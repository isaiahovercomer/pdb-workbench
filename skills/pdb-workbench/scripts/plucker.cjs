function be16(n){return [n>>>8,n&255]}
function joinParts(parts){
  const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));
  let at=0;for(const part of parts){out.set(part,at);at+=part.length}
  return out;
}
function palmGray(width,height,rgba,bits){
  if(![1,2,4].includes(bits)||width<1||height<1||rgba.length!==width*height*4)throw Error('圖片格式錯誤');
  const stride=2*Math.ceil(width*bits/16),data=new Uint8Array(16+stride*height);
  if(data.length>64000)throw Error('圖片太大，請縮小尺寸。');
  data.set([...be16(width),...be16(height),...be16(stride),0,0,bits,1]);
  const max=(1<<bits)-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,a=rgba[i+3]/255;
    const l=(rgba[i]*0.299+rgba[i+1]*0.587+rgba[i+2]*0.114)*a+255*(1-a);
    data[16+y*stride+(x*bits>>3)]|=Math.round((1-l/255)*max)<<(8-bits-x*bits%8);
  }
  return data;
}
async function pluckerBook(book,{bitmap=null,compress=true}={}){
  const pages=[[]];let used=0;
  function paragraph(bytes){
    if(used+4+bytes.length>58000){pages.push([]);used=0}
    pages.at(-1).push(bytes);used+=4+bytes.length;
  }
  if(bitmap)paragraph([0,26,0,7]);
  for(const c of book.chapters){
    for(const line of [c.name,c.body,c.note||''].join('\n').replace(/\r\n?/g,'\n').split('\n')){
      let bytes=[];
      for(const ch of line){
        const n=ch.codePointAt(0);
        if(n>=32&&n<127)bytes.push(n);
        else if(n>65535)bytes.push(0,133,0,0,n>>>16,...be16(n&65535));
        else if(n>=128)bytes.push(0,131,0,...be16(n));
        else if(n===9)bytes.push(32);
        if(bytes.length>=8000){paragraph(bytes);bytes=[]}
      }
      paragraph(bytes);
    }
  }
  if(pages.length>65520)throw Error('書籍過大');
  const records=[Uint8Array.from([0,1,0,compress?2:1,0,1,0,0,0,2])],ids=[1];
  const pageId=i=>i===0?2:i+10;
  async function add(id,type,rows,body){
    let packed=body;
    if(compress&&body.length&&typeof CompressionStream==='function'){
      const stream=new Blob([body]).stream().pipeThrough(new CompressionStream('deflate'));
      const candidate=new Uint8Array(await new Response(stream).arrayBuffer());
      if(candidate.length<body.length){packed=candidate;type++}
    }
    records.push(joinParts([[...be16(id),...be16(rows.length),...be16(body.length),type,0],...rows.map(r=>[...be16(r.length),0,0]),packed]));ids.push(id);
  }
  for(let i=0;i<pages.length;i++){
    const rows=pages[i];
    const link=(id,label)=>[0,10,...be16(id),...new TextEncoder().encode(label),0,8];
    if(i)rows.unshift(link(pageId(i-1),'Previous'));
    if(i+1<pages.length)rows.push(link(pageId(i+1),'Next'));
    await add(pageId(i),0,rows,joinParts(rows));
  }
  if(bitmap)await add(7,2,[],bitmap);
  const header=new Uint8Array(80+records.length*8),v=new DataView(header.buffer);
  header.set(new TextEncoder().encode(book.title||'Book').subarray(0,31));
  header.set(new TextEncoder().encode('DataPlkr'),60);v.setUint32(68,Math.max(...ids)+1);v.setUint16(76,records.length);
  let offset=header.length;
  records.forEach((r,i)=>{v.setUint32(78+i*8,offset);v.setUint32(82+i*8,ids[i]);offset+=r.length});
  return joinParts([header,...records]);
}
module.exports={pluckerBook,palmGray};
