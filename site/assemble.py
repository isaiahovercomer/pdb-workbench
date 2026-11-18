"""Build the hosted page, Windows companion and self-contained downloadable edition."""
import base64
import io
import json
from pathlib import Path
import re
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

source = Path(__file__).resolve().parent
dist = source.parent / 'docs'
modules = [
    ('batch', '批次製書', 'ixl'),
    ('editor', '詩歌與書報', 'book'),
    ('capture', '網頁合訂', 'capture'),
    ('reader', 'PDB 轉 TXT', 'reader'),
    ('settings', '轉檔環境', 'settings'),
]
page = (source / 'base.html').read_text(encoding='utf-8')
navigation = [('project', '快速專案'), *[(key,label) for key,label,_ in modules[:4]],
              ('build', '製作 PalmDOC'), ('inspect', '快速辨識'), ('settings', '轉檔環境')]
buttons = ''.join(f'<button type="button" id="{key}Tab" class="{"active" if key=="project" else ""}" aria-pressed="{str(key=="project").lower()}" aria-controls="{key}">{label}</button>' for key,label in navigation)
page = re.sub(r'<nav aria-label="瀏覽器工具">.*?</nav>',
              '<nav class="toolsbar" aria-label="工作區">'+buttons+'</nav>',page,count=1)
panels = []
for key,label,name in modules:
    fragment = (source / (name+'-module.html')).read_text(encoding='utf-8')
    if name in ('book','reader'):
        for marker, filename in [('SHARED_ZIP','zip'),('SHARED_BATCH','batch'),('SHARED_SEARCH','search'),('SHARED_PLUCKER','plucker'),('SHARED_IMAGES','images'),('SHARED_LAYOUT','layout')]:
            script=(source.parent/'skills/pdb-workbench/scripts'/(filename+'.cjs')).read_text(encoding='utf-8')
            fragment=fragment.replace('/* '+marker+' */',script.split('module.exports=')[0])
    if name == 'book':
        formats=(source.parent/'skills/pdb-workbench/scripts/formats.cjs').read_text(encoding='utf-8')
        fragment=fragment.replace('/* SHARED_BOOK */',formats.split('\n',1)[1].split('module.exports=')[0])
    if name == 'reader':
        document=(source.parent/'skills/pdb-workbench/scripts/document.cjs').read_text(encoding='utf-8')
        fragment=fragment.replace('/* SHARED_DOCUMENT */',document.split('// SHARED_DOCUMENT')[1].split('module.exports=')[0])
        reader = (source.parent/'skills/pdb-workbench/scripts/reader.cjs').read_text(encoding='utf-8')
        fragment = fragment.replace('/* SHARED_PDB_READER */',reader.split('module.exports=')[0])
    panels.append(f'<section id="{key}" aria-label="{label}" hidden>\n{fragment}\n</section>')
page = page.replace('<p class="footer">','\n'.join(panels)+'\n<p class="footer">',1)
guide = '''<details class="card" style="margin:18px 0"><summary style="cursor:pointer;font-weight:bold">格式、原廠引擎與專案參考</summary><p>PalmDOC 可直接在瀏覽器製作與閱讀。圖文 PDB（SDoc / SilX）可直接閱讀正文與匯出 UTF-8 純文字；寫入及執行 IXL 轉檔設定需使用 Windows 原廠引擎。在 Windows 工作台執行 Run-Project.cmd，可選取 .ixl 和選用的 .ixs，確認目的地後批次轉檔。排程時間寫在 IXL 裡，執行時需要支援排程的原廠程式。</p><p>網頁合訂僅能直接抓取允許瀏覽器讀取的網站。也可以選取已存好的 HTML 資料夾。書架和編輯草稿儲存在目前瀏覽器，請使用匯出功能備份。</p><p>功能研究參考 <a href="https://github.com/jontey/YPSongbook">YPSongbook</a>、<a href="https://github.com/samortiz/ministry">ministry</a>、<a href="https://github.com/jichu4n/palm-pdb">palm-pdb</a>、<a href="https://github.com/atang0925/HarmonyPDB-Next">HarmonyPDB-Next</a> 與 <a href="https://github.com/lxmx/PyPlucker">PyPlucker</a>。工作頁內的功能採獨立實作。</p></details>'''
guide=guide.replace('</details>','<p><a href="https://isaiahovercomer.github.io/pdb-workbench/pdb-workbench-skill.zip" download>下載 Muse 技能 ZIP</a></p></details>')
page = page.replace('<p class="footer">',guide+'<p class="footer">',1)
page = page.replace('const pages=["project","build","inspect"];',
                    'const pages='+json.dumps([key for key,_ in navigation])+';')
page = page.replace('<h1>PDB 文件轉檔</h1>', '<h1>電子書製作工作台</h1>')
page = re.sub(r'<section class="hero">.*?</section>', '''<section class="hero"><div><h1>電子書製作工作台</h1><p>把網頁、書報與詩歌編成一本書。選擇工作區，即可開始製作、轉檔或閱讀。</p><a class="primary" href="./workbench.zip" download>下載 Windows 轉檔工作台</a></div><div class="bookplate" aria-hidden="true"><b>PDB</b><span>PDB · EPUB</span></div></section>''',page,count=1,flags=re.S)
page = page.replace('</style>', '''.hero{padding:clamp(22px,3.5vw,38px);margin:22px 0 18px}.bookplate{justify-self:end;display:grid;align-content:center;text-align:center;border:1px solid #a4b2a2;border-left:9px double #a4b2a2;padding:16px 30px;transform:rotate(-3deg);color:#f1e6c9}.bookplate b{font:italic 36px Georgia,serif}.bookplate span{font-size:12px;letter-spacing:.15em}.toolsbar{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:18px;border:0}.toolsbar button{border:1px solid var(--edge);background:white;color:var(--ink);border-radius:6px;padding:8px 12px}.toolsbar button.active{background:var(--green);color:white}.wrap,.card,fieldset{min-width:0}#xsFields summary{cursor:pointer;font-weight:700;padding:8px 0}#xsFields details{border-top:1px solid var(--edge);padding:6px 0 14px}input[type=checkbox]{width:auto;display:inline-block}#capture{padding:clamp(14px,3vw,28px);border:1px solid var(--edge);border-radius:12px;background:white}@media(max-width:700px){.bookplate{display:none}.toolsbar{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}.toolsbar button{font-size:14px;padding:7px 2px}.hero{margin:14px 0}.hero p{margin:6px 0 16px}}\n</style>''',1)
link = 'href="./workbench.zip" download'
assert page.count(link)==1 and all(f'id="{key}Tab"' in page for key,_ in navigation)
local = page.replace(link, 'href="/native"').replace('下載 Windows 轉檔工作台</a>', '開啟 Windows 轉檔引擎</a>',1)
dist.mkdir(exist_ok=True)
(dist/'index.html').write_text(page,encoding='utf-8')
companion = source.parent / 'workbench'
with ZipFile(dist/'workbench.zip','w',ZIP_DEFLATED) as archive:
    for item in sorted(companion.iterdir()):
        if item.is_file() and item.suffix.lower() in ('.cmd','.html','.cs','.ps1','.md'):
            archive.write(item,item.name)
    archive.writestr('studio.html',local)
payload = (dist/'workbench.zip').read_bytes()
with ZipFile(io.BytesIO(payload)) as archive:
    assert archive.testzip() is None and 'Start.cmd' in archive.namelist()
encoded=base64.b64encode(payload).decode('ascii')
standalone=page.replace(link, f'href="data:application/zip;base64,{encoded}" download="workbench.zip"')
output=source.parent/'outputs'/'PDB-Workbench.html'
output.parent.mkdir(exist_ok=True)
output.write_text(standalone,encoding='utf-8')
print(f'{len(payload):,} byte companion | {output.stat().st_size:,} byte standalone')

core = re.findall(r'<script>(.*?)</script>', (source/'base.html').read_text(encoding='utf-8'), re.S)[0]
(source.parent/'skills/pdb-workbench/scripts/core.cjs').write_text(core+'\nmodule.exports={createProject,writeBook,readHeader,decodeText};\n',encoding='utf-8')

skill=source.parent/'skills'/'pdb-workbench'
with ZipFile(dist/'pdb-workbench-skill.zip','w') as archive:
    for item in sorted([skill/'SKILL.md', *skill.glob('scripts/*.cjs'), *skill.glob('scripts/*.py')]):
        info=ZipInfo('pdb-workbench/'+item.relative_to(skill).as_posix())
        info.compress_type=ZIP_DEFLATED
        archive.writestr(info,item.read_bytes())
