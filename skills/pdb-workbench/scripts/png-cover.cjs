const fs=require('node:fs');
const {inflateSync}=require('node:zlib');
const {palmGray}=require('./plucker.cjs');

// Decode common, non-interlaced PNG covers into a small grayscale Palm bitmap.
function pngCover(file,side,bits){
  const b=fs.readFileSync(file);
  if(!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('封面請使用 PNG。');
  const w=b.readUInt32BE(16),h=b.readUInt32BE(20),depth=b[24],color=b[25];
  const channels=({0:1,2:3,3:1,4:2,6:4})[color];
  if(!channels||!w||!h||w*h>16000000||b[28]||!(depth===8||([0,3].includes(color)&&[1,2,4].includes(depth))))throw Error('需要一般非交錯 PNG，且最多 1600 萬像素。');
  let palette,alpha;const chunks=[];
  for(let at=8;at+12<=b.length;){
    const len=b.readUInt32BE(at),type=b.toString('ascii',at+4,at+8);
    if(len>b.length-at-12)throw Error('PNG 區塊不完整');
    const data=b.subarray(at+8,at+8+len);
    if(type==='PLTE')palette=data;if(type==='tRNS')alpha=data;if(type==='IDAT')chunks.push(data);
    at+=len+12;
  }
  const stride=Math.ceil(w*channels*depth/8),step=Math.ceil(channels*depth/8);
  const pixels=inflateSync(Buffer.concat(chunks),{maxOutputLength:(stride+1)*h});
  if(pixels.length!==(stride+1)*h)throw Error('PNG 長度不符。');
  function paeth(a,b,c){const p=a+b-c,x=Math.abs(p-a),y=Math.abs(p-b),z=Math.abs(p-c);return x<=y&&x<=z?a:y<=z?b:c}
  for(let y=0;y<h;y++){
    const row=y*(stride+1)+1,mode=pixels[row-1];
    if(mode>4)throw Error('PNG 濾鏡錯誤');
    for(let x=0;x<stride;x++){
      const i=row+x,a=x>=step?pixels[i-step]:0,b=y?pixels[i-stride-1]:0,c=y&&x>=step?pixels[i-stride-1-step]:0;
      if(mode)pixels[i]+=mode===1?a:mode===2?b:mode===3?(a+b)>>1:paeth(a,b,c);
    }
  }
  const scale=Math.min(1,side/Math.max(w,h)),width=Math.max(1,Math.round(w*scale)),height=Math.max(1,Math.round(h*scale));
  const rgba=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const sx=Math.floor(x*w/width),sy=Math.floor(y*h/height),bit=sx*channels*depth;
    const i=sy*(stride+1)+1+(bit>>3),index=depth===8?pixels[i]:(pixels[i]>>(8-depth-bit%8))&((1<<depth)-1);
    let r,g,b,a=255;
    if(color===3){if(!palette||index*3+2>=palette.length)throw Error('PNG 色盤錯誤');[r,g,b]=palette.subarray(index*3,index*3+3);a=alpha?.[index]??255}
    else if(color===0||color===4){r=g=b=Math.round(index*255/((1<<depth)-1));if(color===4)a=pixels[i+1];else if(alpha&&alpha.readUInt16BE(0)===index)a=0}
    else{[r,g,b]=pixels.subarray(i,i+3);if(color===6)a=pixels[i+3];else if(alpha&&r===alpha.readUInt16BE(0)&&g===alpha.readUInt16BE(2)&&b===alpha.readUInt16BE(4))a=0}
    rgba.set([r,g,b,a],(y*width+x)*4);
  }
  return palmGray(width,height,rgba,bits);
}
module.exports={pngCover};
