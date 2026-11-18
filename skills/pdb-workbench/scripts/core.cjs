
"use strict";
const utf8=new TextEncoder();
function createProject(title,sources,destination,depth,images){
  const absolute=/^(?:[a-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+[\\/])/i;
  const paths=sources.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(!title.trim()||!paths.length)throw Error("請填寫書名與至少一筆來源。");
  for(const [index,path] of paths.entries()){
    let ok=absolute.test(path);
    if(!ok){try{ok=["http:","https:"].includes(new URL(path).protocol)}catch{}}
    if(!ok)throw Error("第 "+(index+1)+" 行來源需為 HTTP(S) 網址或 Windows 完整路徑。");
  }
  if(!absolute.test(destination)||!destination.toLowerCase().endsWith(".pdb"))throw Error("輸出位置需為 Windows 完整路徑並以 .pdb 結尾。");
  if(!/^\d+$/.test(depth)||Number(depth)>65535||!["include","exclude"].includes(images))throw Error("請確認連結深度與圖片設定。");
  function escapeXML(str){
    if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(str))throw Error("輸入中含有無法寫入 XML 的字元。");
    return str.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
  }
  return ['<?xml version="1.0" encoding="UTF-8"?>','<iSiloXDocumentList>','  <iSiloXDocument>',
    '    <Source><Sources>',...paths.map(p=>'      <Path>'+escapeXML(p)+'</Path>'),'    </Sources></Source>',
    '    <Destination>','      <Title>'+escapeXML(title.trim())+'</Title>','      <Files><Path>'+escapeXML(destination)+'</Path></Files>','    </Destination>',
    '    <LinkOptions><MaximumDepth value="'+Number(depth)+'"/><FollowOffsite value="no"/></LinkOptions>',
    '    <ImageOptions><Images value="'+images+'"/></ImageOptions>',
    '    <DocumentOptions><CharSet>UTF-8</CharSet></DocumentOptions>','  </iSiloXDocument>','</iSiloXDocumentList>',''].join('\r\n');
}
const MAX=16*1024*1024;
let big5Codes;
function buildBig5Map(){
  const table=new Map(), decoder=new TextDecoder("big5",{fatal:true});
  for(let lead=0x81;lead<=0xfe;lead++)for(let trail=0x40;trail<=0xfe;trail++){
    if(trail>0x7e&&trail<0xa1)continue;
    try{const char=decoder.decode(Uint8Array.of(lead,trail));
      if(!table.has(char)||lead===0xa4)table.set(char,(lead<<8)|trail);
    }catch{/* Unassigned pair. */}
  }return table;
}
function encode(value,enc){
  if(enc==="utf-8")return utf8.encode(value);
  big5Codes??=buildBig5Map();
  const result=new Uint8Array(value.length*2);let pos=0;
  for(const char of value){
    if(char.codePointAt(0)<128){result[pos++]=char.charCodeAt(0);continue}
    const pair=big5Codes.get(char);
    if(pair===undefined)throw Error("Big5 無法表示「"+char+"」。請切換為 UTF-8，或修改此字。");
    result[pos++]=pair>>8;result[pos++]=pair&255;
  }return result.subarray(0,pos);
}
function compressPalmRecord(data){
  const out=[],last=new Map(),literals=[];
  function flush(){
    if(literals.length){out.push(literals.length,...literals);literals.length=0}
  }
  function keyAt(i){return (data[i]<<16)|(data[i+1]<<8)|data[i+2]}
  let i=0;
  while(i<data.length){
    const byte=data[i],prev=i+2<data.length?last.get(keyAt(i)):undefined;
    let length=0,advance=1;
    if(prev!==undefined && i-prev<=2047){
      while(length<10 && i+length<data.length && data[prev+length]===data[i+length])length++;
    }
    if(length>=3){
      flush();
      const marker=0x8000|((i-prev)<<3)|(length-3);
      out.push(marker>>>8,marker&255);advance=length;
    }else if(byte===32 && data[i+1]>=64 && data[i+1]<=127){
      flush();out.push(0x80|data[i+1]);advance=2;
    }else if(byte===0 || (byte>=9 && byte<=127)){
      flush();out.push(byte);
    }else{
      literals.push(byte);if(literals.length===8)flush();
    }
    for(let pos=i;pos<i+advance && pos+2<data.length;pos++)last.set(keyAt(pos),pos);
    i+=advance;
  }
  flush();return Uint8Array.from(out);
}
function writeBook(title,value,enc,compressed=false){
  const body=encode(value.replace(/\r\n?/g,"\n"),enc);
  if(!body.length||body.length>MAX)throw Error("內文需介於 1 byte 與 16 MiB 之間。");
  const sections=Math.ceil(body.length/4096), count=sections+1, start=78+count*8+2;
  const records=[];
  let payloadLength=0;
  for(let pos=0;pos<body.length;pos+=4096){
    const part=body.subarray(pos,pos+4096);
    const record=compressed?compressPalmRecord(part):part;
    records.push(record);payloadLength+=record.length;
  }
  const bytes=new Uint8Array(start+16+payloadLength), view=new DataView(bytes.buffer);
  let used=0;
  for(const c of title){const part=encode(c,enc);if(used+part.length>31)break;bytes.set(part,used);used+=part.length;}
  const time=Math.floor(Date.now()/1000)+2082844800;
  view.setUint32(36,time);view.setUint32(40,time);bytes.set(utf8.encode("TEXtREAd"),60);
  view.setUint32(68,count+1);view.setUint16(76,count);
  view.setUint32(78,start);view.setUint32(82,1);
  view.setUint16(start,compressed?2:1);view.setUint32(start+4,body.length);
  view.setUint16(start+8,sections);view.setUint16(start+10,4096);
  let offset=start+16;
  records.forEach((record,i)=>{
    const row=78+(i+1)*8;view.setUint32(row,offset);view.setUint32(row+4,i+2);
    bytes.set(record,offset);offset+=record.length;
  });
  return bytes;
}
function decodeText(bytes,encoding){
  if(encoding!=="auto")return new TextDecoder(encoding,{fatal:true}).decode(bytes);
  try{return new TextDecoder("utf-8",{fatal:true}).decode(bytes)}catch{return new TextDecoder("big5",{fatal:true}).decode(bytes)}
}
function readHeader(buffer,size){
  if(buffer.byteLength<78)throw Error("檔案過短，無法讀取完整的 PDB 檔頭。");
  const bytes=new Uint8Array(buffer), view=new DataView(buffer);
  const code=i=>String.fromCharCode(...bytes.slice(i,i+4));
  const type=code(60),creator=code(64),count=view.getUint16(76),resource=!!(view.getUint16(32)&1);
  if(!/^[ -~]{4}$/.test(type)||!/^[ -~]{4}$/.test(creator)||78+count*(resource?10:8)>size)throw Error("檔頭識別碼或記錄目錄長度不符 Palm 資料庫格式。");
  const name=bytes.slice(0,32);const end=name.indexOf(0);
  const raw=name.slice(0,end<0?32:end);let decoded;
  try{decoded=decodeText(raw,"auto")}catch{decoded=new TextDecoder("windows-1252").decode(raw)}
  return {"資料庫名稱":decoded||"（空白）","資料類型":type,"建立程式":creator,[resource?"資源數":"記錄數"]:String(count),"檔案大小":size.toLocaleString()+" bytes"};
}

module.exports={createProject,writeBook,readHeader,decodeText};
