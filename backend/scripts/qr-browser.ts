import { createServer } from 'node:http'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'

/** Real QR component in Chromium, proxying only to the actual synthetic Medusa Admin HTTP API. */
export async function verifyQrBrowser(api: any, admin: any) {
 const profile=await mkdtemp(resolve(tmpdir(),'qr-browser-'))
 const server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url!,'http://fixture')
   if(url.pathname.startsWith('/api/admin/coupon-links')){
    const path=url.pathname.slice(4)+url.search,chunks:Buffer[]=[]
    for await(const chunk of req)chunks.push(Buffer.from(chunk))
    const body=Buffer.concat(chunks).toString()
    const result=req.method==='POST'?await api.post(path,body?JSON.parse(body):{},admin):await api.get(path,admin)
    res.writeHead(result.status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(result.data));return
   }
   res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:")
   const files:Record<string,string>={'/qr.mjs':'../anastasia-admin/qr.mjs','/styles.css':'../anastasia-admin/styles.css','/fixture.mjs':'scripts/qr-browser-fixture.mjs'}
   if(files[url.pathname]){res.setHeader('content-type',url.pathname.endsWith('css')?'text/css':'text/javascript');res.end(await readFile(resolve(files[url.pathname])));return}
   if(url.pathname!=='/'){res.writeHead(404);res.end();return}
   res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="sk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QR admin integration</title><link rel="stylesheet" href="/styles.css"><main class="content"><div id="qr-view"></div><pre id="result">RUNNING</pre></main><script type="module" src="/fixture.mjs"></script></html>')
  }catch{res.writeHead(500);res.end('{}')}
 })
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r))
 try{
  const port=(server.address() as any).port
  const output=await new Promise<string>((yes,no)=>{
   const child=spawn(process.env.CHROME_BIN||'google-chrome',['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--no-default-browser-check','--window-size=1440,1000',`--user-data-dir=${profile}`,'--virtual-time-budget=60000','--dump-dom',`http://127.0.0.1:${port}/`],{stdio:['ignore','pipe','pipe']})
   let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>{err=(err+b).slice(-1000)})
   const timer=setTimeout(()=>{child.kill('SIGKILL');no(Error('QR browser timed out'))},90000)
   child.on('error',e=>{clearTimeout(timer);no(e)});child.on('close',code=>{clearTimeout(timer);code?no(Error('QR browser failed '+err)):yes(out)})
  })
  const match=output.match(/<pre id="result">([\s\S]*?)<\/pre>/)
  if(!match)throw Error('Missing QR browser result')
  const result=JSON.parse(match[1].replaceAll('&quot;','"').replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>'))
  if(result.status!=='PASS')throw Error('QR browser: '+JSON.stringify(result))
  return result
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await rm(profile,{recursive:true,force:true})}
}
