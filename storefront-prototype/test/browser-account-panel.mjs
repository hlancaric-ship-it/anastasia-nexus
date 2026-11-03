import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'file:///Users/lucky/hra-studio54/node_modules/playwright/index.mjs');
const base=process.env.STOREFRONT_URL || 'http://127.0.0.1:4173';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Local preview with synthetic accounts only');
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let saved=false;
  await page.addInitScript(()=>localStorage.setItem('anastasia.jwt','synthetic-account-panel'));
  await page.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.fallback():route.abort());
  await page.route('http://127.0.0.1:9100/**',route=>{
   const req=route.request(),url=new URL(req.url());let body={},status=200;
   if(url.pathname==='/store/customers/me'){
    if(req.method()==='POST')saved=true;
    body={customer:{id:'cus_synthetic_panel',first_name:'Anna',last_name:saved?'Potvrdená':'Nováková',email:'codex+panel@l-code-dynamics.com',metadata:{}}};
   }else if(url.pathname==='/store/orders'){status=503;body={error:'synthetic order outage'}}
   else if(url.pathname==='/store/bookings')body={bookings:[]};
   else if(url.pathname==='/store/products'){status=503;body={error:'synthetic catalogue outage'}}
   else if(url.pathname==='/store/entitlements')body={entitlements:[{product:{id:'prod_synthetic_reset',handle:'reset-40-plus',title:'RESET 40+',media:[{key:'reset-40-plus/lekcia-01.mp4',kind:'video',title:'Týždeň 1'}]}}],count:1};
   else if(url.pathname==='/store/reset-program')body={ok:true,total_weeks:16,weeks:[{week:1,days:[]}],metrics:[]};
   else if(url.pathname==='/store/reset-journal')body={ok:true,entries:[],metrics:[],weeks:[]};
   else if(url.pathname==='/store/chat/status')body={can_write:false,reason:'chat_unavailable'};
   else if(url.pathname==='/store/vouchers')body={vouchers:[]};
   else status=404;
   return route.fulfill({status,json:body,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'content-type,authorization,x-publishable-api-key'}});
  });
  await page.goto(base+'/ucet#reset',{waitUntil:'load'});
  await page.waitForFunction(()=>document.querySelector('#center-name')?.textContent==='Anna Nováková');
  const decline=page.getByRole('button',{name:'Odmietnuť voliteľné',exact:true});if(await decline.isVisible())await decline.click();
  assert.equal(await page.locator('[data-account-go="reset"],#account-reset,#reset-program').count(),0);
  assert.equal(await page.locator('#account-programy').isVisible(),true);
  assert.ok(page.url().endsWith('#programy'));
  assert.equal(await page.locator('#reset-journal').count(),1);
  assert.equal(await page.locator('[data-reset-journal-library]').evaluate(n=>n.hidden),false);
  assert.equal(await page.locator('body').innerText().then(t=>t.includes('Pri akútnych ťažkostiach volajte 155')),false);
  const checks=await page.evaluate(()=>{
   const luminance=rgb=>{const c=rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4});return c[0]*.2126+c[1]*.7152+c[2]*.0722};
   const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
   return ['levandula','bordo','zelena','terakota','modra','slivka'].map(theme=>{document.documentElement.dataset.centerTheme=theme;const aside=document.querySelector('.center-sidebar'),name=document.querySelector('#center-name'),active=document.querySelector('.center-sidebar [aria-current=page]');return {theme,nameColor:getComputedStyle(name).color,sidebarBackground:getComputedStyle(aside).backgroundColor,activeColor:getComputedStyle(active).color,activeBackground:getComputedStyle(active).backgroundColor,nameContrast:ratio(getComputedStyle(name).color,getComputedStyle(aside).backgroundColor),activeContrast:ratio(getComputedStyle(active).color,getComputedStyle(active).backgroundColor)};});
  });
  assert.ok(checks.every(c=>c.nameContrast>=4.5&&c.activeContrast>=4.5),JSON.stringify(checks));
  await page.locator('[data-account-go="profil"]').first().click();
  await page.locator('#center-profile [name=lastName]').fill('Zadaná');
  await page.locator('#center-profile button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#center-name')?.textContent==='Anna Potvrdená');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.locator('[data-account-go="programy"]').first().click();
  await page.evaluate(()=>{scrollTo(0,0);document.querySelector('.center-sidebar').scrollTop=0});
  await page.screenshot({path:join(tmpdir(),`anastasia-account-panel-${width}.png`),animations:'disabled'});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({width,themes:checks.length,name:'server-confirmed',duplicateReset:false,overflow:false}));
  await page.close();
 }
}finally{await browser.close()}
