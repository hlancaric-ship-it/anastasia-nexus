import { createServer } from 'node:http'
import { mkdir, writeFile, mkdtemp, rm, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'

/** Real QR component in Chromium, proxying only to the actual synthetic Medusa Admin HTTP API. */
export async function verifyQrBrowser(api: any, admin: any, buyer: any, regionId: string) {
 const profile=await mkdtemp(resolve(tmpdir(),'qr-browser-'))
 const server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url!,'http://fixture')
   if(url.pathname==='/context'){res.setHeader('content-type','application/json');res.end(JSON.stringify({regionId}));return}
   if(url.pathname.startsWith('/api/admin/coupon-links')||url.pathname.startsWith('/store-api/store/')){
    const isStore=url.pathname.startsWith('/store-api/'),path=url.pathname.slice(isStore?10:4)+url.search,chunks:Buffer[]=[]
    for await(const chunk of req)chunks.push(Buffer.from(chunk))
    const body=Buffer.concat(chunks).toString()
    const options=isStore?buyer:admin
    const result=req.method==='POST'?await api.post(path,body?JSON.parse(body):{},options):await api.get(path,options)
    res.writeHead(result.status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(result.data));return
   }
   res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:")
   const files:Record<string,string>={'/qr.mjs':'../anastasia-admin/qr.mjs','/styles.css':'../anastasia-admin/styles.css','/fixture.mjs':'scripts/qr-browser-fixture.mjs','/http.mjs':'../storefront-prototype/src/lib/api/http.mjs','/mock.mjs':'../storefront-prototype/src/lib/api/mock.mjs'}
   if(files[url.pathname]){res.setHeader('content-type',url.pathname.endsWith('css')?'text/css':'text/javascript');res.end(await readFile(resolve(files[url.pathname])));return}
   if(url.pathname!=='/'){res.writeHead(404);res.end();return}
   res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="sk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QR admin integration</title><link rel="stylesheet" href="/styles.css"><main class="content"><div id="qr-view"></div><pre id="result">RUNNING</pre></main><script type="module" src="/fixture.mjs"></script></html>')
  }catch{res.writeHead(500);res.end('{}')}
 })
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r))
 try{
  const port=(server.address() as any).port
  const child=spawn(process.env.CHROME_BIN||'google-chrome',['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--no-default-browser-check','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']})
  let browserError='';child.on('error',e=>{browserError=e.message});child.stderr.on('data',b=>{browserError=(browserError+b).slice(-1000)})
  let ws: WebSocket | undefined
  try {
   let devtools=''
   for(let i=0;i<300;i++){try{devtools=await readFile(resolve(profile,'DevToolsActivePort'),'utf8');break}catch{await new Promise(r=>setTimeout(r,100))}}
   if(!devtools)throw Error('Chrome did not start: '+browserError)
   const debugPort=Number(devtools.split('\n')[0])
   const pages=await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json() as any[]
   const target=pages.find(p=>p.type==='page');if(!target)throw Error('Missing Chrome page')
   ws=new WebSocket(target.webSocketDebuggerUrl)
   await new Promise<void>((yes,no)=>{ws!.addEventListener('open',()=>yes(),{once:true});ws!.addEventListener('error',()=>no(Error('Chrome connection failed')),{once:true})})
   let seq=0;const pending=new Map<number,{yes:(v:any)=>void,no:(e:Error)=>void,timer:ReturnType<typeof setTimeout>}>()
   ws.addEventListener('message',event=>{const message=JSON.parse(String(event.data));const task=pending.get(message.id);if(!task)return;pending.delete(message.id);clearTimeout(task.timer);message.error?task.no(Error(message.error.message)):task.yes(message.result)})
   const command=(method:string,params:any={})=>new Promise<any>((yes,no)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);no(Error('Chrome command timed out: '+method))},10000);pending.set(id,{yes,no,timer});ws!.send(JSON.stringify({id,method,params}))})
   await command('Page.enable')
   const results=[]
   for(const width of [1440,390]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500})
    await command('Page.navigate',{url:`http://127.0.0.1:${port}/?width=${width}`})
    let result:any
    for(let i=0;i<1200;i++){
     const state=await command('Runtime.evaluate',{expression:'document.querySelector("#result")?.textContent',returnByValue:true})
     const text=state.result?.value
     if(typeof text==='string'&&text.startsWith('{')){result=JSON.parse(text);break}
     await new Promise(r=>setTimeout(r,50))
    }
    if(process.env.QR_EVIDENCE_DIR){
     await mkdir(process.env.QR_EVIDENCE_DIR,{recursive:true})
     const shot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
     await writeFile(resolve(process.env.QR_EVIDENCE_DIR,`qr-admin-${width}.png`),Buffer.from(shot.data,'base64'))
     await writeFile(resolve(process.env.QR_EVIDENCE_DIR,`qr-result-${width}.json`),JSON.stringify(result||{status:'TIMEOUT'}))
    }
    if(!result||result.status!=='PASS')throw Error('QR browser: '+JSON.stringify(result||{status:'TIMEOUT'}))
    results.push(result)
   }
   return {status:'PASS',checks:results.reduce((n,r)=>n+r.checks,0),widths:[1440,390]}
  } finally {ws?.close();child.kill('SIGTERM')}

 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}
}
