function imagePng(record){
  const versions=[];
  for(let p=4;p+16<=record.length;){
    const next=4*(record[p+10]*256+record[p+11]);
    if(next&&(next<16||p+next>record.length))break;
    versions.push(record.subarray(p,next?p+next:record.length));
    if(!next)break;
    p+=next;
  }
  for(const version of versions.sort((a,b)=>b[8]-a[8])){
    try{const png=bitmapPng(version);if(png)return png}catch{}
  }
  return null;
}
function bitmapPng(r){
  const v=new DataView(r.buffer,r.byteOffset,r.byteLength);
  if(r.length<16)return null;
  const w=v.getUint16(0),h=v.getUint16(2),stride=v.getUint16(4),flags=v.getUint16(6),bits=r[8];
  const row=Math.ceil(w*bits/8),size=stride*h;
  if(!w||!h||![1,2,4,16].includes(bits)||stride<row||size>4*1024*1024||flags&0x6000)return null;
  const rgb=bits===16;
  if(rgb&&(!(flags&0x400)||r[16]!==5||r[17]!==6||r[18]!==5))return null;
  const raster=new Uint8Array(size);let k=rgb?24:16;
  function byte(){if(k>=r.length)throw Error('圖片記錄不完整');return r[k++]}
  if(!(flags&0x8000)){
    if(k+size>r.length)return null;raster.set(r.subarray(k,k+size));
  }else{
    k+=2;const mode=r[13];
    if(mode===0){
      for(let y=0;y<h;y++)for(let x=0;x<stride;){
        const mask=byte();for(let j=0;j<8&&x<stride;j++,x++){
          const i=y*stride+x;raster[i]=mask&(128>>j)?byte():y?raster[i-stride]:0;
        }
      }
    }else if(mode===1||mode===2){
      for(let i=0;i<size;){
        const n=byte();
        if(mode===2&&n===128)continue;
        const repeat=mode===1||n>128,count=mode===1?n:repeat?257-n:n+1;
        const unit=rgb&&mode===2?2:1;
        if(!count||i+count*unit>size)return null;
        if(unit===2){
          if(repeat){const hi=byte(),lo=byte();for(let j=0;j<count;j++){raster[i++]=hi;raster[i++]=lo}}
          else for(let j=0;j<count*2;j++)raster[i++]=byte();
          continue;
        }
        if(repeat){raster.fill(byte(),i,i+count);i+=count}
        else for(let j=0;j<count;j++)raster[i++]=byte();
      }
    }else return null;
  }
  const outputRow=rgb?w*3:row;
  const raw=new Uint8Array((outputRow+1)*h);
  if(rgb){
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=y*stride+2*x,v=raster[i]*256+raster[i+1],dst=y*(outputRow+1)+1+3*x;
      raw[dst]=Math.round((v>>11)*255/31);
      raw[dst+1]=Math.round(((v>>5)&63)*255/63);
      raw[dst+2]=Math.round((v&31)*255/31);
    }
  }else
  for(let y=0;y<h;y++)for(let x=0;x<row;x++)raw[y*(row+1)+1+x]=255-raster[y*stride+x];
  const u32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
  const cat=parts=>{const a=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){a.set(p,at);at+=p.length}return a};
  function chunk(name,bytes){
    const tag=new TextEncoder().encode(name);let crc=0xffffffff;
    for(const p of [tag,bytes])for(const x of p){crc^=x;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}
    return cat([u32(bytes.length),tag,bytes,u32(~crc)]);
  }
  const blocks=[[120,1]];let a=1,b=0;
  for(let i=0;i<raw.length;i+=65535){const n=Math.min(65535,raw.length-i);blocks.push([i+n===raw.length?1:0,n&255,n>>>8,~n&255,(~n>>>8)&255],raw.subarray(i,i+n))}
  for(const x of raw){a=(a+x)%65521;b=(b+a)%65521}blocks.push(u32((b<<16)|a));
  return cat([[137,80,78,71,13,10,26,10],chunk('IHDR',Uint8Array.from([...u32(w),...u32(h),rgb?8:bits,rgb?2:0,0,0,0])),chunk('IDAT',cat(blocks)),chunk('IEND',[])]);
}
function sdocImages(bytes,db){
  if(db.type!=='SDoc')return [];
  const images=[];let total=0;
  for(const [index,{start,end}] of db.records.entries()){
    if(bytes[start]!==4||bytes[start+1]!==4)continue;
    try{const png=imagePng(bytes.subarray(start,end));if(png){total+=png.length;if(total>32*1024*1024)break;png.recordIndex=index;images.push(png)}}catch{}
  }
  return images;
}
module.exports={sdocImages};
