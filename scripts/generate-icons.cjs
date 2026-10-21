'use strict';
// Deterministic, locally drawn PNG icons; no libraries, external assets or fonts.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
function crc32(buf) { let c = 0xffffffff; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const t = Buffer.from(type), n = Buffer.alloc(4), crc = Buffer.alloc(4); n.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([n, t, data, crc]); }
function inside(x, y, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [a,b] = poly[i], [d,e] = poly[j]; if ((b > y) !== (e > y) && x < (d-a)*(y-b)/(e-b)+a) c = !c; } return c; }
function rounded(x,y,a,b,w,h,r) { const cx = Math.max(a+r, Math.min(x,a+w-r)), cy = Math.max(b+r, Math.min(y,b+h-r)); return x>=a && x<a+w && y>=b && y<b+h && (x-cx)**2+(y-cy)**2<=r*r; }
for (const size of [192,512]) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  for(let py=0;py<size;py++)for(let px=0;px<size;px++) {
    const x=(px+.5)*512/size,y=(py+.5)*512/size;
    let color=[16,44,58];
    if(rounded(x,y,92,92,328,328,76)) color=[8,126,117];
    if(inside(x,y,[[183,159],[273,159],[320,174],[345,205],[345,246],[306,282],[353,353],[296,353],[255,289],[232,289],[232,353],[183,353]])) color=[255,255,255];
    if(rounded(x,y,232,201,63,46,16)) color=[8,126,117];
    if(rounded(x,y,244,367,103,13,6)) color=[237,186,110];
    const offset=py*(size*4+1)+1+px*4;
    raw.set([...color,255],offset);
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
  fs.writeFileSync(path.join(__dirname,`../assets/icon-${size}.png`),png);
  console.log(`Created local icon ${size} × ${size}`);
}
