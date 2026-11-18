function sdocBook(book,bitmap=null){
  const utf=new TextEncoder(),records=[],heads=[],pieces=[];
  const view=r=>new DataView(r.buffer,r.byteOffset,r.byteLength);
  function record(n){const r=new Uint8Array(n);records.push(r);return r}
  let length=0;
  function append(s){const data=utf.encode(s);pieces.push(data);length+=data.length}
  if(bitmap)append('\n');
  for(const c of book.chapters){
    if(heads.length)append('\n\n');
    const name=(c.name||'').replace(/\0/g,'').trim();
    heads.push({name:utf.encode(name||'章節 '+(heads.length+1)),pos:length});
    if(name)append(name+'\n');
    append(c.body.replace(/\r\n?/g,'\n'));
    if(c.lineNotes)append('\n'+c.lineNotes);
    if(c.note)append('\n'+c.note);
  }
  if(!length||length>48*1024*1024)throw Error('請提供正文，整本上限為 48 MiB。');
  if(heads.length>5000)throw Error('章節數超過上限。');
  const body=new Uint8Array(length);let cursor=0;
  for(const p of pieces){body.set(p,cursor);cursor+=p.length}
  const header=record(212),h=view(header),slots=8;
  h.setUint16(0,128);header.set([3,0,3,0],2);header.set(utf.encode('isSilo'),6);
  const now=new Date();h.setUint16(12,now.getUTCFullYear());header.set([now.getUTCMonth()+1,now.getUTCDate(),now.getUTCHours(),now.getUTCMinutes(),now.getUTCSeconds()],14);
  h.setUint32(20,length);h.setUint16(24,slots);h.setUint16(26,4096);
  h.setUint32(28,Math.max(1,heads.length));h.setUint16(36,8);h.setUint16(46,0x615);header.set([240,0,1,1,20,17],48);
  h.setUint16(56,1);h.setUint16(58,106);h.setUint16(128,4);h.setUint16(138,18);
  const count=Math.ceil(length/(4096*slots));h.setUint16(140,1);h.setUint16(176,count);
  for(let g=0;g<count;g++){
    const start=g*4096*slots,n=Math.min(length-start,4096*slots);
    const r=record(36+4*Math.ceil(n/4)),v=view(r);
    r[0]=4;r[4]=2;
    v.setUint16(6,9);let at=36;
    for(let i=0;i<slots;i++){
      const size=Math.max(0,Math.min(n-4096*i,4096)),padding=(4-size%4)%4;
      v.setUint16(8+2*i,at/4);r[26+i]=4+padding;
      if(size)r.set(body.subarray(start+4096*i,start+4096*i+size),at);
      at+=size+padding;
    }
    v.setUint16(24,at/4);
  }
  if(bitmap){
    const id=records.length;
    const r=record(bitmap.length+4);r.set([4,4]);r.set(bitmap,4);
    const placement=record(26),v=view(placement);
    placement.set([4,2,0,0,16,3,13,0]);v.setUint16(8,24);v.setUint16(10,1);v.setUint32(16,1);v.setUint16(24,32768);
    h.setUint16(148,records.length-1);h.setUint16(184,1);
    const fig=record(22);fig.set([4,5,0,0,6,0]);view(fig).setUint16(10,8);view(fig).setUint16(12,16);fig.set([0,0,Math.min(255,view(bitmap).getUint16(0)),Math.min(255,view(bitmap).getUint16(2))],14);view(fig).setUint16(18,id);view(fig).setUint16(20,4);
  }
  h.setUint16(32,records.length);record(8)[1]=8;
  h.setUint16(34,records.length);
  const namesSize=heads.reduce((n,x)=>n+x.name.length+1,0);
  const offsetStart=(8+namesSize+1)&~1;
  if(offsetStart+4*heads.length>65535)throw Error('章節名稱合計過長。');
  const toc=record(offsetStart+4*heads.length),t=view(toc);toc[1]=8;t.setUint16(4,heads.length);t.setUint16(6,namesSize);
  cursor=8;heads.forEach((x,i)=>{toc.set(x.name,cursor);cursor+=x.name.length+1;t.setUint32(offsetStart+i*4,x.pos)});
  const base=80+8*records.length,output=new Uint8Array(base+records.reduce((n,r)=>n+r.length,0)),v=view(output);
  let title='';for(const ch of (book.title||'SDoc')){if(utf.encode(title+ch).length>31)break;title+=ch}
  output.set(utf.encode(title));output.set(utf.encode('SDocSilX'),60);
  const stamp=Math.floor(now.getTime()/1000)+2082844800;v.setUint32(36,stamp);v.setUint32(40,stamp);v.setUint32(68,records.length+1);v.setUint16(76,records.length);
  cursor=base;records.forEach((r,i)=>{v.setUint32(78+i*8,cursor);v.setUint32(82+i*8,i+1);output.set(r,cursor);cursor+=r.length});
  return output;
}
module.exports={sdocBook};
