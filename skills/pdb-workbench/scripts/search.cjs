const chapterPattern = /^[ \t]*(?:第[零〇一二兩三四五六七八九十百千萬0-9０-９]+[章篇部卷節首]|chapter\s+[\dIVXLCDM]+\b|卷[一二三四五六七八九十]+|#{1,4}\s)[^\n]{0,100}$/gim;
function originalChapters(bytes,db,plain,encoding){
  if(db.type!=='SDoc'||!db.records.length)return [];
  const {start,end}=db.records.at(-1),record=bytes.subarray(start,end);
  if(record.length<8||record[0]!==0||record[1]!==8)return [];
  const v=new DataView(record.buffer,record.byteOffset,record.byteLength),count=v.getUint16(4);
  const offsets=record.length-count*4;
  if(!count||offsets<8||count>5000)return [];
  const decoder=new TextDecoder(encoding==='auto'?'utf-8':encoding);
  let namePos=8,prior=0,charPos=0;
  const out=[];
  for(let i=0;i<count;i++){
    const zero=record.indexOf(0,namePos),pos=v.getUint32(offsets+i*4);
    if(zero<namePos||zero>=offsets||pos<prior||pos>plain.length)return [];
    charPos+=decoder.decode(plain.subarray(prior,pos)).replace(/\r\n?/g,'\n').length;
    const name=decoder.decode(record.subarray(namePos,zero)).trim();
    if(name)out.push({name,index:charPos});
    namePos=zero+1;prior=pos;
  }
  return out;
}
function textChapters(text,original=[]) {
  const chapters = [];
  let start=0, name='全書開頭';
  for (const match of original.length?original.map(x=>({0:x.name,index:x.index})):text.matchAll(chapterPattern)) {
    if (match.index>start) chapters.push({name,body:text.slice(start,match.index),note:'',start});
    start=match.index; name=match[0].trim();
  }
  chapters.push({name,body:text.slice(start),note:'',start});
  return chapters;
}
function searchBook(title,text,term,original=[]) {
  const results=[];
  if(!term)return results;
  const needle=term.toLowerCase(),titleHit=title.toLowerCase().includes(needle);
  for(const c of textChapters(text,original)){
    const chapterHit=c.name.toLowerCase().includes(needle);
    let matched=false;
    for(const line of c.body.matchAll(/[^\n]+/g)){
      const i=line[0].toLowerCase().indexOf(needle);
      if(i<0)continue;
      matched=true;
      results.push({chapter:c.name,offset:c.start+line.index+i,score:(titleHit?4:0)+(chapterHit?2:0)+1,
        snippet:line[0].slice(Math.max(0,i-26),i+term.length+48)});
      if(results.length>=2000)return results;
    }
    if(!matched&&(chapterHit||(titleHit&&!results.length)))results.push({chapter:c.name,offset:c.start,score:(titleHit?4:0)+(chapterHit?2:0),snippet:c.body.slice(0,75).replace(/\s+/g,' ')});
  }
  return results;
}
function searchFile(reader,bytes,name,term,encoding='auto'){
  const db=reader.parsePdb(bytes);reader.requireTextFormat(db);
  const plain=reader.extract(bytes,db),enc=encoding==='auto'?db.encoding||'auto':encoding;
  const text=reader.decode(plain,enc).replace(/\r\n?/g,'\n');
  const title=reader.decode(db.name,encoding)||name;
  return searchBook(title,text,term,originalChapters(bytes,db,plain,enc)).map(hit=>({...hit,name:title}));
}
module.exports={textChapters,searchBook,originalChapters,searchFile};
