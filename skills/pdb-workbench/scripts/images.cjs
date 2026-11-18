function imagePng(record){
  const r=record.subarray(4),v=new DataView(r.buffer,r.byteOffset,r.byteLength);
  if(r.length<16)return null;
  const w=v.getUint16(0),h=v.getUint16(2),stride=v.getUint16(4),flags=v.getUint16(6),bits=r[8];
  const row=Math.ceil(w*bits/8),size=stride*h;
  if(!w||!h||![1,2,4].includes(bits)||stride<row||size>4*1024*1024||flags&0x6000)return null;
  const raster=new Uint8Array(size);let k=16;
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
        if(!count||i+count>size)return null;
        if(repeat){raster.fill(byte(),i,i+count);i+=count}
        else for(let j=0;j<count;j++)raster[i++]=byte();
      }
    }else return null;
  }
  const raw=new Uint8Array((row+1)*h);
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
  return cat([[137,80,78,71,13,10,26,10],chunk('IHDR',Uint8Array.from([...u32(w),...u32(h),bits,0,0,0,0])),chunk('IDAT',cat(blocks)),chunk('IEND',[])]);
}
function sdocImages(bytes,db){
  if(db.type!=='SDoc')return [];
  const images=[];let total=0;
  for(const {start,end} of db.records){
    if(bytes[start]!==4||bytes[start+1]!==4)continue;
    try{const png=imagePng(bytes.subarray(start,end));if(png){total+=png.length;if(total>32*1024*1024)break;images.push(png)}}catch{}
  }
  return images;
}
module.exports={sdocImages};
