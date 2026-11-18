/* SDoc layout records refer to encoded byte offsets. Keep decoded strings out of position arithmetic. */
function sdocLayout(bytes,db,plain,encoding,chapters,images){
  if(db.type!=='SDoc')return;
  const records=db.records.map(({start,end})=>bytes.subarray(start,end));
  const u16=(r,p)=>r[p]*256+r[p+1];
  const u32=(r,p)=>u16(r,p)*65536+u16(r,p+2);
  const parts=(type,sub)=>records.filter(r=>r[0]===4&&r[1]===type&&r[5]===sub);
  const decode=new TextDecoder(encoding==='auto'?'utf-8':encoding);
  const elements=[],targets=new Set(),footnotes=new Set(),indices=new Set([0]);
  const at=(a,z)=>decode.decode(plain.subarray(a,z)).replace(/\r\n?/g,'\n');
  function directory(sub){
    const out=[];
    for(const r of parts(8,sub)){
      const n=u16(r,8),base=10+2*(n+1);
      if(base>r.length)continue;
      for(let i=0;i<n;i++)out.push(r.subarray(base+u16(r,10+2*i),base+u16(r,12+2*i)));
    }
    return out;
  }
  const geometry=directory(0),patterns=directory(1);
  const tables=parts(5,1).flatMap(r=>{
    const out=[];for(let p=12;p+6<=r.length;p+=6)out.push(r.subarray(p,p+6));return out;
  });
  const figures=parts(5,0).flatMap(r=>{
    const out=[];for(let p=12;p+8<=r.length&&out.length<=u16(r,8);p+=8)out.push(u16(r,p+6));return out;
  });
  const picturesByRecord=new Map(images.map((x,i)=>[x.recordIndex,i]));
  function readTable(start,end,id){
    const entry=tables[id];if(!entry||entry[0]!==3)return;
    const g=geometry[entry[1]],cells=records[u16(entry,2)];
    if(!g||g.length<14||!cells||cells[1]!==9)return;
    const cols=u16(g,6),rows=u16(g,8),groups=u16(g,10),count=u16(g,12);
    if(!cols||!rows||!groups||!count||count>8192)return;
    let templates=[];
    if(g[1]&4)templates=Array.from(g.slice(14,14+groups));
    else for(let i=16;i+1<g.length;i+=2){for(let j=0;j<g[i+1]&&templates.length<groups;j++)templates.push(g[i])}
    if(templates.length!==groups)return;
    const base=u16(entry,4);let k=base+2*(groups-1),rowStart=start;
    const parsed=[];
    for(let n=0;n<groups;n++){
      const rowEnd=n===groups-1?end:start+u16(cells,base+n*2);
      const shape=patterns[templates[n]];if(!shape||shape.length<6||rowStart>=rowEnd||rowEnd>end)return;
      const num=shape[2],height=shape[3],group=Array.from({length:height},()=>[]);
      if(!num||!height||parsed.length+height>rows||k+num-1>cells.length)return;
      let cellStart=rowStart;
      for(let j=0;j<num;j++){
        const cellEnd=j===num-1?rowEnd:rowStart+cells[k++];
        const p=6+j*4;
        const [y,colspan,rowspan]=(shape[1]&16)?[0,1,1]:[shape[p+1],shape[p+2],shape[p+3]];
        if(y>=height||!colspan||colspan>cols||!rowspan||rowspan>height||cellEnd<=cellStart||cellEnd>end)return;
        group[y].push({start:cellStart,end:cellEnd,colspan,rowspan});indices.add(cellStart);indices.add(cellEnd);cellStart=cellEnd;
      }
      parsed.push(...group);rowStart=rowEnd;
    }
    if(parsed.length===rows&&parsed.reduce((sum,row)=>sum+row.length,0)===count)return parsed;
  }
  for(const r of records){
    if(r[0]!==4||r[1]!==2||r[4]!==16||r.length<24)continue;
    const data=u16(r,8),n=u16(r,10),first=u32(r,12),last=u32(r,16);
    if(data+4>r.length||first>=plain.length||last>plain.length)continue;
    if(r[5]===2&&r[7]===0&&r[data]===4&&(r[6]===10||r[6]===0)){
      const wide=r[6]===10,step=wide?2:1,ids=data+u16(r,data+2);
      if(!ids||ids+n>r.length||data+4+n*step>r.length)continue;
      let pos=first;
      for(let i=0;i<n;i++){
        const len=wide?u16(r,data+4+2*i):r[data+4+i];
        const end=pos+len;
        if(end>plain.length||plain[pos]!==10)break;
        const rows=readTable(pos,end,r[ids+i]);
        if(rows)elements.push({kind:'table',start:pos,end,rows});
        pos+=1+(wide?u16(r,20+2*i):r[20+i]);
      }
    }
    if(r[5]===2&&r[7]===3&&r[6]===1&&r[data]===4&&r[data+1]===1){
      const to=data+u16(r,data+2);
      let pos=first;
      for(let i=0;i<n&&to+2*i+2<=r.length;i++){
        const len=r[data+4+i],target=u16(r,to+2*i);
        if(target>=32768)break;
        if(pos+len>plain.length||target>=plain.length||!len||/[\r\n]/.test(at(pos,pos+len)))break;
        const label=at(pos,pos+len).trim();
        const note=/^(?:[〔【\[]\s*(?:註|注|note)?\s*\d+\s*[〕】\]]|(?:註|注|footnote)\s*\d+)$/i.test(label);
        elements.push({kind:'link',start:pos,end:pos+len,target,note});targets.add(target);
        if(note)footnotes.add(target);
        pos+=1+r[20+i];
      }
    }
    if(r[5]===3&&r[6]===13){
      let pos=first,priorFigure=-1;
      for(let i=0;i<n&&data+i*2+2<=r.length;i++){
        const value=u16(r,data+2*i);
        if(value>=32768){
          if((value&32767)<priorFigure)break;
          priorFigure=value&32767;
          if(plain[pos]!==10){
            // The low byte may wrap. Use a position only when one newline fits the remaining range.
            let found=-1;
            for(let possible=pos+256;possible<last;possible+=256){
              if(plain[possible]===10){if(found!==-1){found=-1;break}found=possible}
            }
            if(found===-1)break;
            pos=found;
          }
          const img=picturesByRecord.get(figures[value&32767]);
          if(img!==undefined)elements.push({kind:'image',start:pos,end:pos+1,img});
        }
        pos+=1+r[20+i];
      }
    }
  }
  for(const e of elements){indices.add(e.start);indices.add(e.end)}
  for(const target of targets)indices.add(target);
  let prior=0,chars=0;const offsets=new Map();
  for(const i of [...indices].sort((a,b)=>a-b)){chars+=at(prior,i).length;offsets.set(i,chars);prior=i}
  const chapterAt=p=>{let lo=0,hi=chapters.length;while(lo+1<hi){const m=(lo+hi)>>1;if(chapters[m].start<=p)lo=m;else hi=m}return lo};
  for(const target of targets)elements.push({kind:'anchor',start:target,end:target,target,note:footnotes.has(target)});
  for(const e of elements){
    const idx=chapterAt(offsets.get(e.start)),c=chapters[idx],rel=p=>offsets.get(p)-c.start;
    if(rel(e.end)>c.body.length)continue;
    if(e.rows)for(const row of e.rows)for(const cell of row){cell.start=rel(cell.start);cell.end=rel(cell.end)}
    if(e.kind==='link')e.page=chapterAt(offsets.get(e.target));
    (c.layout??=[]).push({...e,start:rel(e.start),end:rel(e.end)});
  }
}
module.exports={sdocLayout};
