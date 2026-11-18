const {zip}=require('./zip.cjs');
const blank=()=>({name:'',body:'',note:''});
const heading=(c,i)=>c.name.trim()||'第 '+(i+1)+' 章';
function safeXml(s){return Array.from(String(s),c=>{const n=c.codePointAt(0);return n===9||n===10||n===13||(n>=32&&n<=0xd7ff)||(n>=0xe000&&n<=0xfffd)||n>=0x10000?c:'�'}).join('').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
function valid(b){return b&&typeof b.title==='string'&&typeof b.author==='string'&&Array.isArray(b.chapters)&&b.chapters.length>0&&b.chapters.length<=2000&&b.chapters.every(c=>c&&['name','body','note'].every(k=>typeof c[k]==='string'))}

function marked(line){
 const matches=[...line.matchAll(/\[([^\]\r\n]{1,32})\]/g)];if(!matches.length)return safeXml(line);
 const pieces=[safeXml(line.slice(0,matches[0].index))];matches.forEach((m,i)=>{const text=line.slice(m.index+m[0].length,matches[i+1]?.index??line.length);pieces.push('<span class="bookPair"><strong class="bookChord">'+safeXml(m[1])+'</strong><span>'+safeXml(text||'\u00a0')+'</span></span>')});return pieces.join('');
}
function lineNotes(c) {
 const notes=new Map();
 for(const row of (c.lineNotes||'').split('\n')){
   const match=row.match(/^\s*([1-9]\d*)\s*\|\s*(.+)$/);if(match){const index=Number(match[1]);notes.set(index,[notes.get(index),match[2]].filter(Boolean).join('；'))}
 }
 return notes;
}
function arranged(c,book,inline){
 const items=c.layout.slice().sort((a,b)=>a.start-b.start||(a.kind==='anchor'?-1:b.kind==='anchor'?1:b.end-a.end));
 const safeText=s=>safeXml(s).replace(/\n/g,'<br/>');
 function range(start,end,omit,level){
  let pos=start,html='';
  for(const e of items){
   if(e===omit||e.start<pos||e.start>=end||e.end>end||e.end<e.start||!Number.isSafeInteger(e.start)||!Number.isSafeInteger(e.end))continue;
   html+=safeText(c.body.slice(pos,e.start));pos=e.start;
   if(e.kind==='anchor'&&Number.isSafeInteger(e.target)){html+='<span id="o'+e.target+'"></span>';continue}
   if(e.kind==='link'&&Number.isSafeInteger(e.target)&&Number.isSafeInteger(e.page)){
    html+='<a '+(e.note?(inline?'role="doc-noteref" ':'epub:type="noteref" '):'')+'href="'+(inline?'':'c'+e.page+'.xhtml')+'#o'+e.target+'">'+safeText(c.body.slice(e.start,e.end))+'</a>';
   }else if(e.kind==='image'&&book.images?.[e.img] instanceof Uint8Array){
    html+=pictureTag(book.images[e.img],e.img,inline);
   }else if(e.kind==='table'&&level<4&&Array.isArray(e.rows)){
    html+='<table><tbody>'+e.rows.map(row=>'<tr>'+row.map(cell=>'<td colspan="'+(Number(cell.colspan)||1)+'" rowspan="'+(Number(cell.rowspan)||1)+'">'+range(cell.start,cell.end,e,level+1).replace(/^(<br\/>)+|(<br\/>)+$/g,'')+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
   }else continue;
   pos=e.end;
  }
  return html+safeText(c.body.slice(pos,end));
 }
 return range(0,c.body.length,null,0);
}
function chapter(c,i,book={},inline=true){if(c.literal&&c.layout?.length)return '<h2>'+safeXml(heading(c,i))+'</h2><div>'+arranged(c,book,inline)+'</div>';const notes=lineNotes(c);return '<h2>'+safeXml(heading(c,i))+'</h2><div class="bookVerse">'+c.body.replace(/\r\n?/g,'\n').split('\n').map((line,j)=>(c.literal?safeXml(line):marked(line))+(notes.has(j+1)?'<small>〔'+safeXml(notes.get(j+1))+'〕</small>':'')).join('<br/>')+'</div>'+(c.note.trim()?'<p class="bookFoot">'+safeXml(c.note)+'</p>':'')}

const bookCss='body{max-width:48em;margin:1em auto;padding:1em;font-family:serif;line-height:1.75;color:#213f38}h1,h2{line-height:1.4}.bookVerse,.bookFoot{white-space:pre-wrap;overflow-wrap:anywhere}.bookPair{display:inline-flex;flex-direction:column;vertical-align:bottom}.bookChord{font:bold .8em/1.25 monospace;color:#775020}.bookFoot{border-top:1px solid #ccc;padding-top:.7em}table{border-collapse:collapse}td{border:1px solid #888;padding:.25em}img{max-width:100%;height:auto}section{margin:2em 0;break-before:page}a{color:#17584c}';
function pictures(book){return Array.isArray(book.images)?book.images.filter(x=>x instanceof Uint8Array):[]}
function pictureTag(bytes,i,inline){
 let src='p'+i+'.png';
 if(inline){let binary='';for(let n=0;n<bytes.length;n+=8192)binary+=String.fromCharCode(...bytes.subarray(n,n+8192));src='data:image/png;base64,'+btoa(binary)}
 return '<img alt="原書圖片 '+(i+1)+'" src="'+src+'"/>';
}
function gallery(book,inline){
 const placed=new Set(book.chapters.flatMap(c=>(c.layout||[]).filter(e=>e.kind==='image').map(e=>e.img)));
 const tags=pictures(book).map((bytes,i)=>placed.has(i)?'':'<figure>'+pictureTag(bytes,i,inline)+'</figure>').join('');
 return tags?'<section><h2>原書圖片附錄</h2>'+tags+'</section>':'';
}
function htmlBook(b){return '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+safeXml(b.title)+'</title><style>'+bookCss+'</style><main><h1>'+safeXml(b.title)+'</h1><p>'+safeXml(b.author)+'</p><nav id="toc"><h2>目錄</h2><ol>'+b.chapters.map((c,i)=>'<li><a href="#c'+i+'">'+safeXml(heading(c,i))+'</a></li>').join('')+'</ol></nav>'+b.chapters.map((c,i)=>'<section id="c'+i+'">'+chapter(c,i,b,true)+'<p><a href="#toc">回目錄</a></p></section>').join('') +gallery(b,true)+'</main></html>'}

function epubBook(b){
 const xml='<?xml version="1.0" encoding="UTF-8"?>',uuid='urn:uuid:'+globalThis.crypto.randomUUID(),title=safeXml(b.title);
 const page=(t,body)=>xml+'<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-Hant" lang="zh-Hant"><head><title>'+t+'</title><link href="book.css" rel="stylesheet" type="text/css"/></head><body>'+body+'</body></html>';
 const names=b.chapters.map((c,i)=>safeXml(heading(c,i))), links=names.map((n,i)=>'<li><a href="c'+i+'.xhtml">'+n+'</a></li>').join('');
 const opf=xml+'<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">'+uuid+'</dc:identifier><dc:title>'+title+'</dc:title><dc:language>zh-Hant</dc:language>'+(b.author?'<dc:creator>'+safeXml(b.author)+'</dc:creator>':'')+'<meta property="dcterms:modified">'+new Date().toISOString().split('.')[0]+'Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="book.css" media-type="text/css"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'+names.map((_,i)=>'<item id="c'+i+'" href="c'+i+'.xhtml" media-type="application/xhtml+xml"/>').join('')+pictures(b).map((_,i)=>'<item id="p'+i+'" href="p'+i+'.png" media-type="image/png"/>').join('')+'</manifest><spine toc="ncx"><itemref idref="nav"/>'+names.map((_,i)=>'<itemref idref="c'+i+'"/>').join('')+'</spine></package>';
 const ncx=xml+'<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="'+uuid+'"/></head><docTitle><text>'+title+'</text></docTitle><navMap>'+names.map((n,i)=>'<navPoint id="p'+i+'" playOrder="'+(i+1)+'"><navLabel><text>'+n+'</text></navLabel><content src="c'+i+'.xhtml"/></navPoint>').join('')+'</navMap></ncx>';
 return zip([['mimetype','application/epub+zip'],['META-INF/container.xml',xml+'<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="EPUB/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'],['EPUB/book.opf',opf],['EPUB/book.css',bookCss],['EPUB/toc.ncx',ncx],['EPUB/nav.xhtml',page(title,'<h1>'+title+'</h1><nav epub:type="toc"><h2>目錄</h2><ol>'+links+'</ol></nav>')],...names.map((n,i)=>['EPUB/c'+i+'.xhtml',page(n,chapter(b.chapters[i],i,b,false)+(i===names.length-1?gallery(b,false):''))]),...pictures(b).map((img,i)=>['EPUB/p'+i+'.png',img])]);
}

const chordPattern=/^([A-G])([#b♯♭]?)(?:(m(?:aj|in)?|M|maj|min|dim|aug|sus|add|no|omit|alt|dom|Δ|ø|°|\+|-|[#b♯♭]|[0-9]|[(),])*)(?:\/([A-G])([#b♯♭]?))?$/;
function shifted(name,step){
 const m=chordPattern.exec(name);
 if(!m)return name;
 const sharp=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'],flat=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
 const pitches={C:0,D:2,E:4,F:5,G:7,A:9,B:11};const spell=step>0?sharp:flat;
 function note(letter,sign){const diff=sign==='b'||sign==='♭'?-1:sign==='#'||sign==='♯'?1:0;return spell[(pitches[letter]+diff+step+12)%12]}
 const rootLength=m[1].length+m[2].length,slash=name.lastIndexOf('/');
 const suffix=name.slice(rootLength,slash===-1?undefined:slash);
 return note(m[1],m[2])+suffix+(m[4]?'/'+note(m[4],m[5]):'');
}

function excelBook(b){
 const xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
 const main='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
 const rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
 const pkg='http://schemas.openxmlformats.org/package/2006/relationships';
 const rows=[];let seq=0;
 function row(values){
   if(seq>=1048576)throw Error('行數超過 Excel 工作表上限。');
   seq++;const cells=values.map((v,i)=>{const addr=String.fromCharCode(65+i)+seq;
    if(typeof v==='number')return '<c r="'+addr+'"><v>'+v+'</v></c>';
    if(v.length>32767)throw Error('第 '+seq+' 列有欄位超過 Excel 的字數上限，請先拆分長段落。');
    const value=safeXml(v.replace(/_x([0-9a-fA-F]{4})_/g,'_x005F_x$1_'));
    return '<c r="'+addr+'" t="inlineStr"><is><t xml:space="preserve">'+value+'</t></is></c>';
   }).join('');rows.push('<row r="'+seq+'">'+cells+'</row>');
 }
 row(['書名','編者','章序','篇名或歌名','行序','內文或歌詞','和弦','含和弦原文','經文出處與附註']);
 b.chapters.forEach((c,i)=>c.body.split(/\r\n?|\n/).forEach((line,j)=>{
   const chords=[];const lyrics=line.replace(/\[([^\]\r\n]{1,32})\]/g,(token,name)=>{if(!chordPattern.test(name))return token;chords.push(name);return ''});
   row([b.title,b.author,i+1,heading(c,i),j+1,lyrics,chords.join(' '),line,[j===0?c.note:'',lineNotes(c).get(j+1)].filter(Boolean).join('；')]);
 }));
 const sheet=xml+'<worksheet xmlns="'+main+'"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="16"/><cols>'+[22,15,8,24,8,48,18,54,38].map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join('')+'</cols><sheetData>'+rows.join('')+'</sheetData><autoFilter ref="A1:I'+seq+'"/></worksheet>';
 const relationship=(type,target)=>xml+'<Relationships xmlns="'+pkg+'"><Relationship Id="rId1" Type="'+rel+'/'+type+'" Target="'+target+'"/></Relationships>';
 return zip([
 ['[Content_Types].xml',xml+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
 ['_rels/.rels',relationship('officeDocument','xl/workbook.xml')],
 ['xl/workbook.xml',xml+'<workbook xmlns="'+main+'" xmlns:r="'+rel+'"><sheets><sheet name="篇章與歌詞" sheetId="1" r:id="rId1"/></sheets></workbook>'],
 ['xl/_rels/workbook.xml.rels',relationship('worksheet','worksheets/sheet1.xml')],
 ['xl/worksheets/sheet1.xml',sheet]],'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
function readCho(raw,fallback){
 const songs=[];let c=blank(),hasTitle=false;
 function push(){c.body=c.body.replace(/\n$/,'');if(c.body.trim()||hasTitle||c.note.trim()){if(!c.name)c.name=fallback;songs.push(c)}c=blank();hasTitle=false}
 for(const line of raw.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n')){
  const t=line.match(/^\s*\{(?:title|t)\s*:\s*(.*?)\}\s*$/i);
  if(t){if(hasTitle||c.body.trim())push();c.name=t[1];hasTitle=true;continue}
  if(/^\s*\{new_song\}\s*$/i.test(line)){push();continue}
  const annotation=line.match(/^\{comment: 行註 (\d+) \| (.*)\}$/);if(annotation){c.lineNotes=(c.lineNotes||'')+annotation[1]+' | '+annotation[2]+'\n';continue}
  const note=line.match(/^\s*\{comment:\s*經文附註：(.*)\}\s*$/);if(note){c.note+=(c.note?'\n':'')+note[1];continue}
  c.body+=line+'\n';
 }
 push();return songs;
}
function writeCho(b){return b.chapters.map((c,i)=>'{title: '+heading(c,i).replace(/[\r\n]/g,' ')+'}\n'+(c.note?c.note.split(/\r?\n/).map(n=>'{comment: 經文附註：'+n+'}').join('\n')+'\n':'')+[...lineNotes(c)].map(([n,t])=>'{comment: 行註 '+n+' | '+t+'}\n').join('')+c.body).join('\n{new_song}\n')}
module.exports={valid,htmlBook,epubBook,excelBook,readCho,writeCho,shifted};
