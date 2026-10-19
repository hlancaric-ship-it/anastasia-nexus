import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,extname,sep} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'dist');
const port=Number(process.argv[2]||4173);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.ttf':'font/ttf','.mp4':'video/mp4','.webm':'video/webm','.mp3':'audio/mpeg','.txt':'text/plain'};
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
  const api=process.env.ANASTASIA_API_ORIGIN||'http://127.0.0.1:9100';
  res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self' https://js.stripe.com; style-src 'self' 'unsafe-inline'; img-src 'self' https://*.stripe.com data:; media-src 'self'; font-src 'self'; connect-src 'self' ${api} https://api.stripe.com; frame-src https://js.stripe.com https://hooks.stripe.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  // Same-origin public images keep img-src 'self'. This is a fixed-backend, read-only proxy.
  const mediaPath=new URL(req.url,'http://localhost').pathname;
  if(mediaPath.startsWith('/backend-media/static/')){
    try{
      const path=decodeURIComponent(mediaPath.slice('/backend-media'.length));
      if(path.split('/').some(part=>part==='..'||part==='.')||!/^\/static\/[a-zA-Z0-9_./-]+\.(?:jpg|jpeg|png|webp|avif|gif)$/i.test(path)){res.writeHead(400);res.end();return;}
      const upstream=await fetch(new URL(path,api),{method:req.method,redirect:'error',signal:AbortSignal.timeout(10000)});
      if(!upstream.ok){res.writeHead(upstream.status);res.end();return;}
      const type=upstream.headers.get('content-type')||'';
      if(!/^image\/(?:jpeg|png|webp|avif|gif)(?:;|$)/i.test(type)||Number(upstream.headers.get('content-length'))>10000000){res.writeHead(502);res.end();return;}
      const bytes=req.method==='HEAD'?null:Buffer.from(await upstream.arrayBuffer());
      if(bytes&&bytes.length>10000000){res.writeHead(502);res.end();return;}
      res.writeHead(200,{'Content-Type':type});res.end(bytes);return;
    }catch{res.writeHead(502);res.end();return;}
  }
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    let file=resolve(root,'.'+pathname);if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
    let info=await stat(file);if(info.isDirectory()){file=resolve(file,'index.html');info=await stat(file);}
    res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.setHeader('Accept-Ranges','bytes');
    const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if(range){const start=Number(range[1]),end=Math.min(range[2]?Number(range[2]):info.size-1,info.size-1);if(start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return;}res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${info.size}`,'Content-Length':end-start+1});if(req.method==='HEAD')res.end();else createReadStream(file,{start,end}).pipe(res);}
    else{res.writeHead(200,{'Content-Length':info.size});if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res);}
  }catch{res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'});if(req.method==='HEAD')res.end();else res.end(await readFile(resolve(root,'404.html')));}
});
const host=process.env.HOST||'127.0.0.1';
server.listen(port,host,()=>console.log(`ANASTASIA preview: http://${host}:${port}`));
