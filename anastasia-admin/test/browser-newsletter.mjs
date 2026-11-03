// Newsletter UI acceptance with synthetic API and the real server email template. No email is sent.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'file:///Users/lucky/hra-studio54/node_modules/playwright/index.mjs');
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const base=process.env.ADMIN_URL || 'http://127.0.0.1:4178';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Local preview only; all API traffic is synthetic');
const require=createRequire(root+'/backend/package.json');
const ts=require('typescript');
const module={exports:{}};
new Function('require','module','exports',ts.transpileModule(readFileSync(root+'/backend/src/modules/newsletter/policy.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(require,module,module.exports);
const {renderCampaignEmail}=module.exports;
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:900}});
 const errors=[],sent=[];page.on('pageerror',e=>errors.push(e.message));
 let campaign;
 await page.addInitScript(()=>{localStorage.setItem('ana_api','http://127.0.0.1:9100');localStorage.setItem('ana_token','synthetic-local-ui-only')});
 await page.route('**/*',route=>{const url=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(url.hostname)?route.fallback():route.abort()});
 await page.route('http://127.0.0.1:9100/**',async route=>{
  const req=route.request(),url=new URL(req.url());
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,OPTIONS'};
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers,body:''});
  let json={};
  if(url.pathname==='/admin/users/me')json={user:{id:'user_synthetic_newsletter',email:'codex+newsletter-ui@l-code-dynamics.com',metadata:{role:'owner'}}};
  if(url.pathname==='/admin/newsletter')json={consents:[],count:0};
  if(url.pathname==='/admin/newsletter/campaigns'){
   if(req.method()==='POST')campaign={id:'nlc_synthetic',status:'draft',...req.postDataJSON()};
   json=req.method()==='POST'?{campaign}:{campaigns:campaign?[campaign]:[],stats:{subscribed:0,campaigns_sent:0}};
  }
  if(url.pathname==='/admin/newsletter/preview'){
   const body=req.postDataJSON();
   json=renderCampaignEmail({subject:body.subject,preheader:body.preheader,bodyHtml:body.body_html,unsubscribeUrl:'#'});
  }
  if(url.pathname.endsWith('/send-test')){sent.push(req.postDataJSON());json={ok:true}}
  return route.fulfill({json,headers});
 });
 await page.goto(base+'/#/obsah/1');await page.locator('#nl-subject').waitFor();
 const styles=await page.evaluate(()=>({sections:[...document.querySelectorAll('.nl-sec-h b')].map(n=>({weight:getComputedStyle(n).fontWeight,size:getComputedStyle(n).fontSize})),labels:[...document.querySelectorAll('.nl-editor label[for]')].map(n=>getComputedStyle(n).fontSize),inputs:[...document.querySelectorAll('.nl-editor input,.nl-editor textarea')].map(n=>({font:getComputedStyle(n).fontFamily,size:getComputedStyle(n).fontSize}))}));
 assert.ok(styles.sections.length>0&&styles.sections.every(s=>Number(s.weight)>=700&&parseFloat(s.size)>=16));
 assert.ok(styles.labels.every(s=>s==='13.5px'));assert.ok(styles.inputs.every(s=>s.size==='13.5px'&&!/monospace/i.test(s.font)));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 await page.locator('[data-pv-mode=mobile]').click();
 await page.waitForFunction(()=>{const f=document.querySelector('#nl-preview');return f?.contentDocument?.body?.textContent.length>50});
 const preview=await page.locator('#nl-preview').evaluate(f=>({overflow:f.contentDocument.documentElement.scrollWidth>f.contentDocument.documentElement.clientWidth+1,width:f.getBoundingClientRect().width,container:f.parentElement.getBoundingClientRect().width}));
 assert.equal(preview.overflow,false);assert.ok(preview.width<=preview.container+1);
 await page.locator('#nl-test').fill('codex+newsletter-ui@l-code-dynamics.com');await page.locator('[data-test]').click();
 await page.locator('[data-msg]').filter({hasText:'Testovací e-mail je prijatý'}).waitFor();
 assert.deepEqual(sent,[{email:'codex+newsletter-ui@l-code-dynamics.com'}]);
 const proximity=await page.locator('[data-msg]').evaluate(n=>{const b=document.querySelector('[data-test]').getBoundingClientRect(),r=n.getBoundingClientRect();return r.top-b.bottom});
 assert.ok(proximity>=0&&proximity<60);assert.deepEqual(errors,[]);
 await page.screenshot({path:join(tmpdir(),`anastasia-newsletter-${width}.png`),animations:'disabled'});
 console.log(JSON.stringify({width,passed:true,sections:styles.sections.length,preview,messageGap:proximity,send:'MOCK_ONLY'}));
 await page.close();
}
}finally{await browser.close()}
