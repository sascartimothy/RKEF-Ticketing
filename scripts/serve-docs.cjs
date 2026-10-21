"use strict";
// Dependency-free local static server for integration gate. Run: npm run dev
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../docs');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
const port=Number(process.env.PORT)||4173;
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  let decoded;
  try { decoded=decodeURIComponent(pathname); }catch{res.writeHead(400);res.end('Bad URL');return;}
  const target=path.resolve(root,'.'+decoded,(decoded.endsWith('/')?'index.html':''));
  if(!target.startsWith(root+path.sep)&&target!==path.join(root,'index.html')){res.writeHead(403);res.end('Forbidden');return;}
  fs.readFile(target,(err,buf)=>{
    if(err){res.writeHead(err.code==='ENOENT'?404:500);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(buf);
  });
});
server.listen(port,'127.0.0.1',()=>console.log(`RKEF integration gate: http://127.0.0.1:${port}/`));
