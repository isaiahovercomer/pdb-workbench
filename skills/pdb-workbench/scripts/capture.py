"""Collect supplied local pages or linked same-origin web pages into offline HTML."""
import argparse
import base64
import json
import subprocess
import tempfile
from collections import deque
from html import escape
from html.parser import HTMLParser
from pathlib import Path
import re
from urllib.parse import unquote, urldefrag, urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, build_opener

TAGS = set('a abbr article aside b blockquote br caption code dd div dl dt em figcaption figure h1 h2 h3 h4 h5 h6 hr i img li main ol p pre rb rp rt ruby section small span strong sub sup table tbody td th thead tr u ul'.split())
VOID = {'br', 'hr', 'img'}
SKIP = {'script', 'style', 'iframe', 'object', 'template', 'noscript', 'svg', 'math', 'textarea'}


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.events, self.links, self.title = [], [], ''
        self.skip, self.in_title = [], False
        self.feed(text)
        self.close()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in SKIP:
            self.skip.append(tag)
        if self.skip:
            return
        if tag == 'title':
            self.in_title = True
        if tag in TAGS:
            self.events.append(('open', tag, attrs))
            if tag == 'a' and attrs.get('href'):
                self.links.append(attrs['href'])

    def handle_endtag(self, tag):
        if self.skip:
            if tag == self.skip[-1]:
                self.skip.pop()
        elif tag == 'title':
            self.in_title = False
        elif tag in TAGS - VOID:
            self.events.append(('close', tag, {}))

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        elif not self.skip:
            self.events.append(('text', data, {}))


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def collect(source, output, title, depth, limit):
    remote = urlsplit(source).scheme in ('http', 'https')
    opener = build_opener(NoRedirect())
    files = {}
    if remote:
        first = urldefrag(source).url
        queue = deque([(first, 0)])
    else:
        root = Path(source).resolve(strict=True)
        entries = sorted(root.rglob('*')) if root.is_dir() else [root]
        for p in entries:
            if p.is_file() and (not root.is_dir() or p.resolve().is_relative_to(root)):
                files[p.as_uri()] = p
        queue = deque((u, 0) for u,p in files.items() if p.suffix.lower() in ('.html','.htm','.xhtml'))
        first = queue[0][0] if queue else ''
    pages, visited, images = {}, set(), {}
    total = 0

    def read(url, maximum):
        nonlocal total
        if remote:
            if urlsplit(url)[:2] != urlsplit(first)[:2]:
                raise ValueError('跨站來源')
            stream = opener.open(url, timeout=10)
        else:
            stream = files[url].open('rb')
        with stream:
            data = stream.read(maximum+1)
        total += len(data)
        if total > 24*1024*1024 or len(data)>maximum:
            raise ValueError('超出讀取上限')
        return data

    while queue and len(pages)<limit and total<=24*1024*1024:
        url, level = queue.popleft()
        if url in visited:
            continue
        visited.add(url)
        try:
            data = read(url, 2*1024*1024)
            charset = re.search(br'charset\s*=\s*["\x27]?([\w-]+)',data[:4096],re.I)
            try:
                text = data.decode(charset[1].decode() if charset else 'utf-8-sig')
            except (UnicodeError,LookupError):
                text = data.decode('big5',errors='replace')
            page = pages[url] = Page(text)
        except (OSError, ValueError, KeyError) as error:
            print(url,error)
            continue
        if remote and level<depth:
            for href in page.links:
                link = urldefrag(urljoin(url,href)).url
                if urlsplit(link)[:2]==urlsplit(first)[:2] and link not in visited and len(queue)<limit*3:
                    queue.append((link,level+1))
    if not pages:
        raise ValueError('沒有可收錄的 HTML')
    ids = {url:'p'+str(i) for i,url in enumerate(pages)}
    def anchor(key, fragment):
        return key+('-'+unquote(fragment).encode().hex() if fragment else '')
    toc, sections = [], []
    for url,page in pages.items():
        key = ids[url]
        caption = escape(page.title.strip() or Path(unquote(urlsplit(url).path)).name or url)
        toc.append(f'<li><a href="#{key}">{caption}</a></li>')
        section = [f'<article id="{key}"><h2>{caption}</h2>']
        for kind,tag,attrs in page.events:
            if kind=='text':
                section.append(escape(tag))
            elif kind=='close':
                section.append('</'+tag+'>')
            else:
                keep = {}
                if attrs.get('id') or attrs.get('name'):
                    keep['id']=anchor(key,attrs.get('id') or attrs['name'])
                if tag=='a' and attrs.get('href'):
                    target,frag=urldefrag(urljoin(url,attrs['href']))
                    if target in ids:
                        keep['href']='#'+anchor(ids[target],frag)
                    elif urlsplit(target).scheme in ('http','https'):
                        keep['href']=urljoin(url,attrs['href'])
                if tag in ('td','th'):
                    keep.update({k:v for k,v in attrs.items() if k in ('colspan','rowspan') and (v or '').isdigit()})
                if tag=='img':
                    img=urljoin(url,attrs.get('src') or '')
                    if img not in images:
                        images[img]=''
                        try:
                            data=read(img,1024*1024)
                            mime=next((t for sig,t in [(b'\x89PNG\r\n\x1a\n','png'),(b'\xff\xd8\xff','jpeg'),(b'GIF8','gif')] if data.startswith(sig)),None)
                            if mime:
                                images[img]='data:image/'+mime+';base64,'+base64.b64encode(data).decode()
                        except (KeyError,OSError,ValueError) as error:
                            print(img,error)
                    if not images[img]:
                        section.append(escape(attrs.get('alt') or ''))
                        continue
                    keep.update(src=images[img],alt=attrs.get('alt') or '')
                section.append('<'+tag+''.join(f' {k}="{escape(v,quote=True)}"' for k,v in keep.items())+'>')
        sections.append(''.join(section)+'<p><a href="#contents">回目錄</a></p></article>')
    if Path(output).suffix.lower()=='.pdb':
        chapters=[]
        for url,page in pages.items():
            lines=[]
            for kind,tag,attrs in page.events:
                if kind=='text':
                    lines.append(tag)
                elif (kind=='close' and tag in ('p','div','li','h1','h2','h3','h4','tr','pre')) or (kind=='open' and tag=='br'):
                    lines.append('\n')
            chapters.append({'name':page.title.strip() or Path(unquote(urlsplit(url).path)).name,'body':''.join(lines).strip(),'note':''})
        with tempfile.TemporaryDirectory() as folder:
            source_file=Path(folder)/'chapters.json'
            source_file.write_text(json.dumps({'title':title,'author':'','chapters':chapters}),encoding='utf8')
            subprocess.run(['node',str(Path(__file__).with_name('run.cjs')),'sdoc',str(source_file),str(output)],check=True)
        return
    with open(output,'x',encoding='utf8') as f:
        f.write('<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(title)+'</title><style>body{max-width:48em;margin:auto;padding:1em;line-height:1.7}img{max-width:100%}</style><h1>'+escape(title)+'</h1><nav id="contents"><ol>'+''.join(toc)+'</ol></nav>'+''.join(sections)+'</html>')
    print(f'{len(pages)} pages: {output}')


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('source')
    parser.add_argument('output')
    parser.add_argument('--title',default='離線閱讀合訂本')
    parser.add_argument('--depth',type=int,choices=range(6),default=1)
    parser.add_argument('--max-pages',type=int,choices=range(1,101),default=20)
    args=parser.parse_args()
    collect(args.source,args.output,args.title,args.depth,args.max_pages)
