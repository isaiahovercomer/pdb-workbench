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
function sdocBits(data) {
  let position = 0;
  return function read(count) {
    if (position + count > data.length * 8) throw Error("SDoc 壓縮資料提前結束。");
    let value = 0;
    for (let bit = 0; bit < count; bit++, position++) {
      const byte = (position >>> 3) ^ 3;
      value |= ((data[byte] >>> (position & 7)) & 1) << bit;
    }
    return value;
  };
}

function sdocTree(lengths) {
  const counts = Array(16).fill(0), next = Array(16).fill(0), symbols = new Map();
  for (const length of lengths) if (length) counts[length]++;
  let code = 0;
  for (let length = 1; length <= 15; length++) {
    code = (code + counts[length - 1]) * 2;
    if (code + counts[length] > 2 ** length) throw Error("SDoc 的字碼表無效。");
    next[length] = code;
  }
  lengths.forEach((len, symbol) => {
    if (len) symbols.set((1 << len) + next[len]++, symbol);
  });
  return function symbol(read) {
    let key = 1;
    for (let len = 1; len <= 15; len++) {
      key = key * 2 + read(1);
      if (symbols.has(key)) return symbols.get(key);
    }
    throw Error("SDoc 文字區段含有未知字碼。");
  };
}

function sdocTables(bytes) {
  const read = sdocBits(bytes);
  const literals = read(5) + 257, distances = read(5) + 1, numCodes = read(4) + 4;
  if (literals > 286 || distances > 30) throw Error("SDoc 壓縮表長度異常。");
  const order = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
  const lengths = Array(19).fill(0);
  for (let i = 0; i < numCodes; i++) lengths[order[i]] = read(3);
  const symbol = sdocTree(lengths);
  function tree(count) {
    const codes = [];
    let previous = 0;
    while (codes.length < count) {
      const value = symbol(read);
      if (value < 16) {
        previous = value;
        codes.push(value);
      } else {
        const repeat = value === 16 ? 3 + read(2) : value === 17 ? 3 + read(3) : 11 + read(7);
        if (repeat > count - codes.length) throw Error("SDoc 壓縮表重複次數異常。");
        for (let n = 0; n < repeat; n++) codes.push(value === 16 ? previous : 0);
      }
    }
    return sdocTree(codes);
  }
  return [tree(literals), tree(distances)];
}

function sdocBlock(data, tables, limit) {
  const read = sdocBits(data), result = [];
  for (;;) {
    const symbol = tables[0](read);
    if (symbol === 256) return Uint8Array.from(result);
    if (result.length >= limit) throw Error("SDoc 文字超出宣告長度。");
    if (symbol < 256) {
      result.push(symbol);
      continue;
    }
    const e = Math.max(0, ((symbol - 261) >> 2));
    const length = symbol === 285 ? 258 : symbol < 265 ? symbol - 254 :
      3 + ((4 + ((symbol - 265) & 3)) << e) + read(e);
    const d = tables[1](read), extra = Math.max(0, (d >> 1) - 1);
    const distance = d < 4 ? d + 1 : 1 + ((2 + (d & 1)) << extra) + read(extra);
    if (distance > result.length || length > limit - result.length) throw Error("SDoc 文字參照無效。");
    for (let i = 0; i < length; i++) result.push(result[result.length - distance]);
  }
}
function extractSdoc(bytes, db) {
  function record(index) {
    const entry = db.records[index];
    if (!entry) throw Error("SDoc 缺少文字記錄。");
    return bytes.subarray(entry.start, entry.end);
  }
  const header = record(0);
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  if (header.length < 64 || header[2] !== 3 ||
      String.fromCharCode(...header.subarray(6,12)) !== "isSilo") {
    throw Error("尚未支援這個 SDoc 檔頭版本。");
  }
  if (view.getUint16(38) || view.getUint32(40) || (header[48] & 15)) {
    throw Error("這本 SDoc 使用保護或額外權限設定，目前無法匯出。");
  }
  const headerSize = view.getUint16(0);
  if (headerSize < 64 || headerSize + 2 > header.length) throw Error("SDoc 檔頭不完整。");
  const directory = headerSize + 2 + 2 * view.getUint16(headerSize);
  if (directory + 2 > header.length) throw Error("SDoc 目錄超出範圍。");
  const groups = view.getUint16(directory);
  if (!groups || directory + 2 + 4 * groups > header.length) throw Error("SDoc 目錄不完整。");
  const first = view.getUint16(directory + 2);
  const count = view.getUint16(directory + 2 + 2 * groups);
  const size = view.getUint32(20), slots = view.getUint16(24), blockSize = view.getUint16(26);
  if (!slots || blockSize !== 4096 || size > maxBytes || !first || first + count > db.records.length ||
      count !== Math.ceil(size / (slots * blockSize))) throw Error("SDoc 正文長度或記錄數異常。");
  const out = new Uint8Array(size);
  let written = 0;
  for (let index = 0; index < count; index++) {
    const data = record(first + index);
    if (data.length < 8 || data[1] !== 0) throw Error("SDoc 文字記錄類型無效。");
    const table = data[0] + data[data[0]];
    const flags = table + 2 * (slots + 2);
    if (data[0] < 4 || !Number.isInteger(table) || flags + slots > data.length) throw Error("SDoc 文字索引損毀。");
    const dv = new DataView(data.buffer,data.byteOffset,data.byteLength);
    const offsets = Array.from({length: slots + 2}, (_, i) => 4 * dv.getUint16(table + 2*i));
    if (offsets[0] < flags + slots || offsets.some((v,i) => v > data.length || (i && v < offsets[i-1]))) {
      throw Error("SDoc 區塊位置異常。");
    }
    let trees;
    for (let i = 0; i < slots && written < size; i++) {
      const start = offsets[i+1], end = offsets[i+2], limit = Math.min(blockSize, size-written);
      const mode = data[flags+i];
      if (mode > 7) throw Error("尚未支援這個 SDoc 壓縮模式。");
      let part;
      if (mode & 4) {
        const length = end - start - (mode & 3);
        if (length !== limit) throw Error("SDoc 文字區段長度不符。");
        part = data.subarray(start,start+length);
      } else {
        if (!trees) trees = sdocTables(data.subarray(offsets[0],offsets[1]));
        part = sdocBlock(data.subarray(start,end), trees, limit);
      }
      if (part.length !== limit) throw Error("SDoc 文字區段不完整。");
      out.set(part,written);
      written += part.length;
    }
  }
  if (written !== size) throw Error("SDoc 正文長度不符。");
  // Registered IANA charset identifiers in the document header.
  db.encoding = ({106:"utf-8",2026:"big5",2252:"windows-1252",113:"gbk",114:"gb18030",
    1013:"utf-16be",1014:"utf-16le"})[view.getUint16(58)];
  return out;
}

function palmRecords(bytes, db) {
  const encoder=new TextEncoder(), blocks=[];
  let total=0;
  function add(item){
    const data=typeof item==='string'?encoder.encode(item):item;
    total+=data.length;
    if(total>maxBytes)throw Error('匯出的資料量超過上限。');
    blocks.push(data);
  }
  function date(value){
    if(value===65535)return '';
    return (1904+(value>>>9))+'-'+String((value>>5)&15).padStart(2,'0')+'-'+String(value&31).padStart(2,'0');
  }
  for(const [index,entry] of db.records.entries()) {
    if((bytes[78+index*8+4]&128) || entry.start===entry.end)continue;
    const data=bytes.subarray(entry.start,entry.end);
    let pos=0;
    function take(n){
      if(n>data.length-pos)throw Error('Palm 記錄長度錯誤：'+(index+1));
      const part=data.subarray(pos,pos+n);pos+=n;return part;
    }
    const u8=()=>take(1)[0];
    const u16=()=>{const b=take(2);return b[0]*256+b[1]};
    function string(){
      const end=data.indexOf(0,pos);
      if(end<0)throw Error('Palm 文字記錄缺少結尾。');
      const field=take(end-pos);pos++;return field;
    }
    function field(label,value){add(label+': ');add(value);add('\n')}
    if(blocks.length)add('\n');
    if(db.creator==='memo'){add(string());add('\n')}
    if(db.creator==='todo'){
      const due=date(u16()),flags=u8();field('Completed',flags&128?'yes':'no');field('Priority',String(flags&127));
      if(due)field('Due',due);field('Task',string());field('Note',string());
    }
    if(db.creator==='addr'){
      const phone=take(4), fields=take(4);
      const mask=fields[1]*65536+fields[2]*256+fields[3];take(1);
      const names=['Last name','First name','Company','Phone 1','Phone 2','Phone 3','Phone 4','Phone 5','Address','City','State','ZIP','Country','Title','Custom 1','Custom 2','Custom 3','Custom 4','Note'];
      const types=['Work','Home','Fax','Other','Email','Main','Pager','Mobile'];
      const labels=(phone[1]<<16)|(phone[2]<<8)|phone[3];
      for(let i=0;i<names.length;i++)if(mask&(1<<i))field(i>=3&&i<8?types[(labels>>((i-3)*4))&15]||names[i]:names[i],string());
    }
    if(db.creator==='date'){
      const clock=()=>{const h=u8(),m=u8();return h===255?'':String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')};
      const start=clock(),end=clock();field('Date',date(u16()));if(start)field('Time',start+' - '+end);
      const flags=u8();take(1);
      if(flags&64){const amount=u8(),unit=u8();field('Alarm',amount+' '+(['minutes','hours','days'][unit]||unit))}
      if(flags&32){const kind=u8();take(1);const until=date(u16()),every=u8(),rule=u8(),week=u8();take(1);
        field('Repeat',[kind,until,every,rule,week].join(' / '));}
      if(flags&8){const n=u16();for(let i=0;i<n;i++)field('Except',date(u16()))}
      if(flags&4)field('Event',string());if(flags&16)field('Note',string());
    }
  }
  const result=new Uint8Array(total);let offset=0;
  for(const b of blocks){result.set(b,offset);offset+=b.length}return result;
}

  function extract(bytes,db){
    if(db.type==="DATA")return palmRecords(bytes,db);
    if(db.type==="SDoc" && db.creator==="SilX") return extractSdoc(bytes,db);
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
    if(!db.resource && db.type==="DATA" && ["memo","addr","date","todo"].includes(db.creator))return;
    if(!db.resource && db.type==="SDoc" && db.creator==="SilX") return;
    if(db.resource || db.type!=="TEXt" || db.creator!=="REAd"){
      broken("尚未支援正文轉檔："+db.type+" / "+db.creator);
    }
  }
module.exports={maxBytes,parsePdb,requireTextFormat,extract,decode};
