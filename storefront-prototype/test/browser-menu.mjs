import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||pathToFileURL('/Users/lucky/hra-studio54/node_modules/playwright/index.mjs').href);
import assert from 'node:assert/strict';
const base=process.env.STOREFRONT_URL||'http://127.0.0.1:4174';
const browser=await chromium.launch({channel:'chrome',headless:true});let checks=0;const errors=[];
try {
for(const width of [320,390,800,1440,1920]){
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
 await context.addInitScript(()=>{localStorage.setItem('ana-ambient-off','1');window.__ANASTASIA__={useMock:true};});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 for(const route of ['/eshop','/eshop/produkt/vyuka-vedomeho-vnimania','/ucet','/denny-stacionar-vysna-slana','/zdrava-lekaren']){
  console.log('Checking',width,route);await page.goto(base+route,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
  assert.ok(await page.locator('header').first().evaluate(e=>e.getBoundingClientRect().height)<=64);checks++;
  assert.equal(await page.locator('header .header-account svg').evaluate(e=>e.getBoundingClientRect().width),16);checks++;
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${width} ${route} overflow`);checks++;
  for(const side of [false,true]){
   const selector=side?'#dc-side-menu':'#dc-top-menu';
   const trigger=page.locator(`[data-menu-open="${side?'side':'top'}"]`).filter({visible:true}).first();
   if(!await trigger.count())continue;
   await trigger.click();const menu=page.locator(selector);await page.waitForFunction(s=>document.querySelector(s)?.getAttribute('aria-hidden')==='false',selector,{timeout:4000}).catch(e=>{console.log(width,route,selector,errors);throw e});
   assert.equal(await menu.getAttribute('aria-hidden'),'false');checks++;
   for(const text of ['Kozmetika','Bylinky a výživa','Programy a služby','Zdravá lekáreň','Denný stacionár Vyšná Slaná','Pharmanews','Recenzie produktov','Kontakt']){
    assert.equal(await menu.getByRole('link',{name:text,exact:true}).count(),1,`${width} ${route} ${text}`);checks++;
   }
   assert.equal(await menu.getByRole('link',{name:/^(Novinky|Bestsellery|Výuka|Moja knižnica|Aktuality|AI ANASTASIA|Domov|Ľan)$/}).count(),0);checks++;
   const rect=await menu.boundingBox();assert.ok(rect.x>=-1&&rect.x+rect.width<=width+1,`${width} menu viewport`);checks++;
   assert.equal(await menu.evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);checks++;
   if(process.env.MENU_SCREENSHOT&&width===1440&&route==='/eshop'&&!side)await page.screenshot({path:process.env.MENU_SCREENSHOT});
   await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('aria-hidden'),'true');checks++;
  }
 }
 await context.close();
}
// Explicitní HTTP kontext s odpojeným serverem: účet nesmí zablokovat menu.
const offline=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
await offline.addInitScript(()=>localStorage.setItem('ana-ambient-off','1'));
await offline.route(/\/(store|auth)\//,r=>r.abort('failed'));
const p=await offline.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/ucet');
for(const kind of ['top','side']){await p.locator(`[data-menu-open="${kind}"]:visible`).first().click();await p.waitForFunction(k=>document.querySelector(`#dc-${k}-menu`).getAttribute('aria-hidden')==='false',kind);checks++;await p.keyboard.press('Escape');}
await offline.close();
assert.deepEqual(errors,[]);console.log(`${checks}/${checks} PASS; no page errors`);
} finally {await browser.close();}
