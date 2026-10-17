import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
const require=createRequire(import.meta.url)
const { build }=require('esbuild')
const scripts=dirname(fileURLToPath(import.meta.url)),temp=await mkdtemp(resolve(tmpdir(),'anastasia-theme-browser-'))
let server
try{
 await build({entryPoints:[resolve(scripts,'admin-theme/browser.tsx')],outfile:resolve(temp,'test.js'),bundle:true,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}})
 await writeFile(resolve(temp,'index.html'),'<!doctype html><html lang="sk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin theme test</title><link rel="stylesheet" href="/test.css"><style>body{margin:0;font:16px Arial,sans-serif}#result{white-space:pre-wrap;overflow-wrap:anywhere}</style><div id="root"></div><pre id="result">RUNNING</pre><script src="/test.js"></script></html>')
 server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1');if(url.searchParams.has('viewport')){const width=Number(url.searchParams.get('viewport'));if(![1440,390].includes(width)){res.statusCode=400;res.end();return}res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden}iframe{display:block;border:0;width:${width}px;height:1100px}pre{position:absolute;left:-99999px}</style><iframe id="fixture" title="Exact appearance viewport" src="/index.html"></iframe><pre id="result">RUNNING</pre><script>addEventListener('message',e=>{if(e.origin===location.origin&&e.source===document.getElementById('fixture').contentWindow)document.getElementById('result').textContent=JSON.stringify(e.data)})</script></html>`);return}const name=req.url==='/test.js'?'test.js':req.url==='/test.css'?'test.css':'index.html';res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await readFile(resolve(temp,name)))}catch{res.statusCode=500;res.end('fixture failure')}})
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port
 const chrome=process.env.CHROME_BIN??(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'google-chrome')
 for(const width of [1440,390]){
  const args=['--headless','--no-sandbox','--disable-gpu','--disable-background-networking','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-sync','--disable-component-update','--disable-dev-shm-usage','--password-store=basic','--use-mock-keychain','--timeout=15000',`--user-data-dir=${resolve(temp,'profile-'+width)}`,`--window-size=${width},1100`,'--virtual-time-budget=12000','--dump-dom',`http://127.0.0.1:${port}/?viewport=${width}`]
  if(process.env.ADMIN_THEME_SCREENSHOT_DIR)args.splice(-1,0,`--screenshot=${resolve(process.env.ADMIN_THEME_SCREENSHOT_DIR,`admin-theme-${width}.png`)}`)
  const output=await new Promise((yes,no)=>{const child=spawn(chrome,args,{stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>{err=(err+b).slice(-2000)});const timer=setTimeout(()=>{child.kill('SIGKILL');no(new Error('Chrome timed out: '+err))},60000);child.on('error',e=>{clearTimeout(timer);no(e)});child.on('close',code=>{clearTimeout(timer);code?no(new Error('Chrome failed: '+err)):yes(out)})})
  const match=String(output).match(/<pre id="result">([\s\S]*?)<\/pre>/)
  if(!match)throw new Error('Missing browser result')
  const decoded=match[1].replaceAll('&quot;','"').replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>')
  const result=JSON.parse(decoded);console.log(JSON.stringify(result));if(result.status!=='PASS'||result.width!==width)process.exitCode=1
 }
}finally{if(server)await new Promise(r=>server.close(r));await rm(temp,{recursive:true,force:true})}
