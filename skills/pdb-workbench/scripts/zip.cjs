const crcTable=Uint32Array.from({length:256},(_,i)=>{for(let j=0;j<8;j++)i=i&1?(i>>>1)^0xedb88320:i>>>1;return i>>>0});
function zip(entries,mime='application/epub+zip'){
 const enc=new TextEncoder();
 if(entries.length>65535)throw Error('ZIP 檔案數超過上限。');
 const files=[],directory=[];let offset=0,centralSize=0;
 function header(n){const data=new Uint8Array(n),view=new DataView(data.buffer);return {data,u16:(p,v)=>view.setUint16(p,v,true),u32:(p,v)=>view.setUint32(p,v,true)}}
 for(const [name,content] of entries){
  const path=enc.encode(name),data=typeof content==="string"?enc.encode(content):content;let crc=0xffffffff;for(const b of data)crc=(crc>>>8)^crcTable[(crc^b)&255];crc=(crc^0xffffffff)>>>0;
  const l=header(30);l.u32(0,0x04034b50);l.u16(4,20);l.u16(6,2048);l.u16(12,33);l.u32(14,crc);l.u32(18,data.length);l.u32(22,data.length);l.u16(26,path.length);files.push(l.data,path,data);
  const d=header(46);d.u32(0,0x02014b50);d.u16(4,20);d.u16(6,20);d.u16(8,2048);d.u16(14,33);d.u32(16,crc);d.u32(20,data.length);d.u32(24,data.length);d.u16(28,path.length);d.u32(42,offset);directory.push(d.data,path);centralSize+=46+path.length;offset+=30+path.length+data.length;
  if(offset+centralSize>=0xffffffff)throw Error('書籍超過 ZIP 容量。');
 }
 const end=header(22);end.u32(0,0x06054b50);end.u16(8,entries.length);end.u16(10,entries.length);end.u32(12,centralSize);end.u32(16,offset);return new Blob([...files,...directory,end.data],{type:mime});
}
module.exports={zip};
