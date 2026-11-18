  const maxBytes=48*1024*1024;
  const broken=message=>{throw new Error(message)};
  function decode(bytes,choice){
    if(choice!=="auto")return new TextDecoder(choice).decode(bytes);
    for(const enc of ["utf-8","big5"]){try{return new TextDecoder(enc,{fatal:true}).decode(bytes)}catch{}}
    return new TextDecoder("windows-1252").decode(bytes);
  }
  function parsePdb(bytes){
    if(bytes.length<78)broken("檔頭不足 78 位元組。");
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const count=view.getUint16(76), resource=Boolean(view.getUint16(32)&1);
    const step=resource?10:8, end=78+count*step;
    if(end>bytes.length)broken("記錄目錄長度超過檔案。");
    const code=(at,size)=>String.fromCharCode(...bytes.subarray(at,at+size));
    const records=[];
    for(let i=0;i<count;i++){
      const at=78+step*i,start=view.getUint32(at+(resource?6:0));
      if(start<end||start>bytes.length)broken("第 "+i+" 筆記錄的位置無效。");
      const id=resource?code(at,4)+" / "+view.getUint16(at+4):((bytes[at+5]<<16)|(bytes[at+6]<<8)|bytes[at+7]).toString(16).padStart(6,"0");
      records.push({start,end:0,id});
    }
    const sorted=[...records].sort((a,b)=>a.start-b.start);
    sorted.forEach((entry,i)=>{entry.end=i+1<sorted.length?sorted[i+1].start:bytes.length});
    const n=bytes.subarray(0,32).indexOf(0);
    return {records,type:code(60,4),creator:code(64,4),name:bytes.subarray(0,n<0?32:n),resource,chained:view.getUint32(72)!==0};
  }
  function inflate(block,out,start,limit){
    let pos=start;
    const put=byte=>{if(pos>=limit)broken("展開後的記錄長度超過檔頭宣告。");out[pos++]=byte};
    for(let i=0;i<block.length;){
      const c=block[i++];
      if(c===0||(c>=9&&c<128)){put(c);continue}
      if(c<=8){
        if(i+c>block.length)broken("壓縮記錄中的文字區段不完整。");
        for(let j=0;j<c;j++)put(block[i++]);
      }else if(c>=192){put(32);put(c^128)}
      else{
        if(i===block.length)broken("壓縮記錄的參照不完整。");
        const v=((c&63)<<8)|block[i++], distance=v>>3;
        if(!distance||distance>pos-start)broken("壓縮記錄的參照位置無效。");
        for(let j=0;j<(v&7)+3;j++)put(out[pos-distance]);
      }
    }
    return pos;
  }
  function extract(bytes,db){
    const head=db.records[0];
    if(!head||head.end-head.start<16)broken("PalmDOC 缺少完整的文件檔頭。");
    const v=new DataView(bytes.buffer,bytes.byteOffset+head.start,head.end-head.start);
    const compression=v.getUint16(0), length=v.getUint32(4), count=v.getUint16(8), blockSize=v.getUint16(10);
    if(![1,2].includes(compression))broken("這個 PalmDOC 的壓縮或保護方式尚未支援。");
    if(length>maxBytes||count>=db.records.length||(!blockSize&&length)||length>count*blockSize)broken("PalmDOC 的文件長度或記錄數無法驗證。");
    const out=new Uint8Array(length);let pos=0;
    for(let i=1;i<=count;i++){
      const r=db.records[i],block=bytes.subarray(r.start,r.end);
      const limit=Math.min(out.length,pos+blockSize);
      if(compression===2){pos=inflate(block,out,pos,limit);continue}
      if(block.length>limit-pos)broken("文字記錄超過檔頭宣告的長度。");
      out.set(block,pos);pos+=block.length;
    }
    if(pos!==length)broken("正文未達檔頭宣告的長度。");
    return out;
  }
  function requireTextFormat(db){
    if(db.chained) broken("串接式記錄目錄目前僅支援結構檢視。");
    if(db.resource || db.type!=="TEXt" || db.creator!=="REAd"){
      if(db.type==="SDoc" && db.creator==="SilX") broken("圖文 PDB（SDoc / SilX）請在相容的 Windows 閱讀器開啟，選 File → Save As 另存純文字。文件須允許轉出。");
      broken("尚未支援正文轉檔："+db.type+" / "+db.creator);
    }
  }
module.exports={maxBytes,parsePdb,requireTextFormat,extract,decode};
