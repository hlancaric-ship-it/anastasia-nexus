import {createServer} from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const temp=await mkdtemp(resolve(tmpdir(),'anastasia-library-browser-'));
let browser;
const html='<!doctype html><html lang="sk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated library editor test</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/reference.css"><div class="content"><div class="card"><div class="card-b"><div class="product-editor"><div><h1>Úprava produktu</h1></div><section class="editor-section"><h2>Zakúpený obsah</h2><div id="library"></div></section></div></div></div></div><pre id="result" style="white-space:pre-wrap;overflow-wrap:anywhere">RUNNING</pre><script type="module" src="/test/library-editor-fixture.mjs"></script></html>';
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),path=url.pathname;
 if(path==='/'&&url.searchParams.has('width')){
 const width=Number(url.searchParams.get('width'));if(![320,390,800,1440].includes(width))throw Error('Invalid viewport');
 res.setHeader('Content-Type','text/html');res.end(`<!doctype html><style>body{margin:0}iframe{border:0;width:${width}px;height:1200px}</style><iframe src="/?fixture=1"></iframe><pre id="result">RUNNING</pre><script>const f=document.querySelector('iframe');f.onload=()=>{const timer=setInterval(()=>{const s=f.contentDocument.querySelector('#result')?.textContent;if(s&&s!=='RUNNING'){document.querySelector('#result').textContent=s;clearInterval(timer)}},20)}</script>`);return;
 }
 if(path==='/'){res.setHeader('Content-Type','text/html');res.end(html);return}
 const file=resolve(root,'.'+path);if(!file.startsWith(root+sep))throw Error('Invalid path');
 res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');res.end(await readFile(file));
}catch{res.statusCode=404;res.end()}});
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 if(process.env.PLAYWRIGHT_MODULE){const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);browser=await chromium.launch({channel:'chrome',headless:true});}
 const chrome=process.env.CHROME_BIN||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'google-chrome');
 for(const width of [320,390,800,1440]){
 if(browser){
  const page=await browser.newPage({viewport:{width,height:1200},reducedMotion:'reduce'});
  await page.goto(`http://127.0.0.1:${server.address().port}/?fixture=1`);
  await page.waitForFunction(()=>document.querySelector('#result').textContent!=='RUNNING');
  const result=JSON.parse(await page.locator('#result').textContent());console.log(JSON.stringify(result));
  await page.close();if(result.status!=='PASS'||result.width!==width)throw Error('Library browser failed');continue;
 }
 const run=await new Promise((yes,no)=>{
  const proc=spawn(chrome,['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-sync','--disable-component-update','--password-store=basic','--use-mock-keychain','--timeout=15000',`--user-data-dir=${resolve(temp,String(width))}`,`--window-size=${Math.max(width,800)},1200`,'--virtual-time-budget=8000','--dump-dom',`http://127.0.0.1:${server.address().port}/?width=${width}`],{stdio:['ignore','pipe','pipe']});
  let out='',err='',completedDump=false;proc.stdout.on('data',b=>{out+=b;if(out.includes('</html>')){completedDump=true;proc.kill('SIGTERM')}});proc.stderr.on('data',b=>err=(err+b).slice(-1000));
  const timer=setTimeout(()=>{proc.kill('SIGKILL');no(Error('Browser timed out: '+err+' '+out.slice(-800)))},45000);
  proc.on('error',e=>{clearTimeout(timer);no(e)});proc.on('close',code=>{clearTimeout(timer);code && !completedDump ? no(Error(err)) : yes(out)});
 });
 const match=String(run).match(/<pre id="result"[^>]*>(.*?)<\/pre>/s);if(!match)throw Error('Missing browser result');
 const result=JSON.parse(match[1].replaceAll('&quot;','"').replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>'));
 console.log(JSON.stringify(result));if(result.status!=='PASS'||result.width!==width)throw Error('Library browser failed');
 }
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));await rm(temp,{recursive:true,force:true})}
