const fs=require('node:fs');
const path=require('node:path');
const {webcrypto}=require('node:crypto');
if(!globalThis.crypto) globalThis.crypto=webcrypto;
const formats=require('./formats.cjs');
const reader=require('./reader.cjs');
const {textChapters,originalChapters}=require('./search.cjs');
function sourceBook(file) {
  const title=path.basename(file,path.extname(file));
  if (/\.(pdb|prc)$/i.test(file)) {
    if(fs.statSync(file).size>reader.maxBytes)throw Error('檔案超過 48 MiB');
    return require('./document.cjs').decodedBook(reader,fs.readFileSync(file),title);
  }
  const text=fs.readFileSync(file,'utf8');
  if(/\.json$/i.test(file)){
    const book=JSON.parse(text);
    if(formats.valid(book))return {...book,images:[],chapters:book.chapters.map(({layout,...chapter})=>chapter)};
    if(!Array.isArray(book.sources)||!book.sources.length||!book.sources.every(s=>typeof s==='string'&&/\.(cho|pro|txt|chopro|chordpro|pdb|prc)$/i.test(s)))throw Error('來源清單格式錯誤');
    return {title:book.title||title,author:book.author||'',chapters:book.sources.flatMap(s=>sourceBook(path.resolve(path.dirname(file),s)).chapters)};
  }
  return {title,author:'',chapters:formats.readCho(text,title)};
}
async function exportBook(input,output,step=0){
  const b=sourceBook(input);
  if(!b.chapters.length)throw Error('沒有可匯出的章節。');
  if(!Number.isInteger(step)||Math.abs(step)>12)throw Error('移調範圍為 -12 至 12 半音。');
  if(step)for(const c of b.chapters)if(!c.literal)c.body=c.body.replace(/\[([^\]\n]{1,32})\]/g,(_,name)=>'['+formats.shifted(name,step)+']');
  if(path.extname(output).toLowerCase()==='.pdb'){
    fs.writeFileSync(output,await require('./plucker.cjs').pluckerBook(b),{flag:'wx'});return;
  }
  const fn={'.epub':formats.epubBook,'.html':formats.htmlBook,'.xlsx':formats.excelBook,'.cho':formats.writeCho}[path.extname(output).toLowerCase()];
  if(!fn)throw Error('輸出支援 html、epub、xlsx、cho、pdb。');
  const result=fn(b);
  fs.writeFileSync(output,result instanceof Blob?Buffer.from(await result.arrayBuffer()):result,{flag:'wx'});
}
module.exports={exportBook,sourceBook};
