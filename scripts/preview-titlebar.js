// Превью логотипа в титлбаре: тёмный скруглённый бокс + фирменный знак.
// Нужно только чтобы глазами проверить центрирование. node scripts/preview-titlebar.js
const fs = require('fs'), path = require('path'), zlib = require('zlib')
const S = 160, SCALE = S / 40, TAN9 = Math.tan(9 * Math.PI / 180), TX = 3.2
const A = [0x34,0xf5,0xa3], B = [0x0f,0xa9,0x68]
const lerp=(a,b,t)=>a+(b-a)*t, mix=t=>[lerp(A[0],B[0],t),lerp(A[1],B[1],t),lerp(A[2],B[2],t)]
function inRR(vx,vy,x,y,w,h,r){ if(vx<x||vx>x+w||vy<y||vy>y+h)return 0
  const cx=Math.max(x+r,Math.min(vx,x+w-r)), cy=Math.max(y+r,Math.min(vy,y+h-r))
  const corner=(vx<x+r||vx>x+w-r)&&(vy<y+r||vy>y+h-r)
  if(corner){const dx=vx-cx,dy=vy-cy;return dx*dx+dy*dy<=r*r?1:0} return 1 }
const bars=[{x:8,y:7,w:5.4,h:26,r:2.7,op:1},{x:17,y:19,w:5.4,h:14,r:2.7,op:.82},{x:26,y:13,w:5.4,h:20,r:2.7,op:.62}]
function sample(fx,fy){ const vx=fx/SCALE, vy=fy/SCALE
  if(!inRR(vx,vy,2,2,36,36,11)) return [0,0,0,0]
  let r=0x07,g=0x10,b=0x0c
  const bx=vx-TX+TAN9*vy
  for(const bar of bars){ if(inRR(bx,vy,bar.x,bar.y,bar.w,bar.h,bar.r)){
    const t=Math.max(0,Math.min(1,((bx-bar.x)/bar.w+(vy-bar.y)/bar.h)/2)), c=mix(t), o=bar.op
    r=c[0]*o+r*(1-o); g=c[1]*o+g*(1-o); b=c[2]*o+b*(1-o) } }
  return [r,g,b,255] }
const SS=3, raw=Buffer.alloc(S*S*4)
for(let y=0;y<S;y++)for(let x=0;x<S;x++){let r=0,g=0,b=0,a=0
  for(let sy=0;sy<SS;sy++)for(let sx=0;sx<SS;sx++){const p=sample(x+(sx+.5)/SS,y+(sy+.5)/SS);r+=p[0];g+=p[1];b+=p[2];a+=p[3]}
  const n=SS*SS,o=(y*S+x)*4;raw[o]=Math.round(r/n);raw[o+1]=Math.round(g/n);raw[o+2]=Math.round(b/n);raw[o+3]=Math.round(a/n)}
const POLY=0xedb88320;let T=null;function crc(buf){if(!T){T=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?POLY^(c>>>1):c>>>1;T[n]=c}}let c=0xffffffff;for(let i=0;i<buf.length;i++)c=(c>>>8)^T[(c^buf[i])&0xff];return(c^0xffffffff)>>>0}
function chunk(t,d){const b=Buffer.from(t),o=Buffer.alloc(12+d.length);o.writeUInt32BE(d.length,0);b.copy(o,4);d.copy(o,8);o.writeUInt32BE(crc(Buffer.concat([b,d])),8+d.length);return o}
const rows=Buffer.alloc(S*(S*4+1));for(let y=0;y<S;y++){rows[y*(S*4+1)]=0;raw.copy(rows,y*(S*4+1)+1,y*S*4,(y+1)*S*4)}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(S,0);ihdr.writeUInt32BE(S,4);ihdr[8]=8;ihdr[9]=6
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(rows,{level:9})),chunk('IEND',Buffer.alloc(0))])
fs.writeFileSync(path.join(__dirname,'..','assets','_preview_titlebar.png'),png);console.log('ok',png.length)
