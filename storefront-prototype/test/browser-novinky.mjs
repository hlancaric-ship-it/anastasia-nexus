import {mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'file:///Users/lucky/hra-studio54/node_modules/playwright/index.mjs');
const base=process.env.STOREFRONT_URL || 'http://127.0.0.1:4173';
const screenshots=process.env.SCREENSHOT_DIR || join(tmpdir(),'anastasia-novinky');
await mkdir(screenshots,{recursive:true});
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 for(const width of [1440,390]) {
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('anastasia.jwt','synthetic-visual-only'));
  let response={featured:null,posts:[],ads:[],panel:{enabled:true}};
  await page.route('**/store/novinky',route=>route.fulfill({json:response,headers:{'access-control-allow-origin':'*'}}));
  await page.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===new URL(base).origin||['127.0.0.1','localhost'].includes(u.hostname)?route.fallback():route.abort()});
  await page.goto(base+'/novinky',{waitUntil:'load'});
  await page.locator('#nv-track .nv-post').first().waitFor();
  assert.equal(await page.locator('#nv-pgrid .nv-pc').count(),3);
  assert.equal(await page.locator('#nv-tab').isVisible(),true,'empty live API keeps sample panel');
  await page.locator('#nv-tab').click();
  assert.equal(await page.locator('#nv-dock').evaluate(n=>n.inert),false);
  await page.keyboard.press('Escape');
  await page.locator('#nv-dock').evaluate(n=>Promise.all(n.getAnimations().map(a=>a.finished)));
  assert.equal(await page.locator('#nv-tab').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:join(screenshots,`novinky-${width}.png`),fullPage:true,animations:'disabled',timeout:60000});
  const menu=page.locator('[data-menu-open="top"]').filter({visible:true}).first();
  await menu.click();
  const flags=await page.locator('#dc-top-menu [data-flag]').evaluateAll(nodes=>nodes.map(n=>({flag:n.dataset.flag,content:getComputedStyle(n,'::before').content,image:getComputedStyle(n,'::before').backgroundImage,width:getComputedStyle(n,'::before').width,display:getComputedStyle(n).display,boxWidth:n.getBoundingClientRect().width})));
  assert.equal(flags.length,3);assert.ok(flags.every(f=>f.content!=='none'&&f.image!=='none'&&f.width==='22px'&&['flex','inline-flex'].includes(f.display)&&f.boxWidth>=44));
  const account=await page.locator('#dc-top-menu .dch6[data-menu-account]').evaluate(n=>({font:getComputedStyle(n).fontSize,transform:getComputedStyle(n.firstElementChild).transform}));
  assert.equal(account.transform,'none');
  await page.screenshot({path:join(screenshots,`menu-${width}.png`),animations:'disabled',timeout:60000});
  response={featured:null,posts:[],ads:[],panel:{enabled:false}};
  await page.reload({waitUntil:'load'});await page.locator('#nv-track .nv-post').first().waitFor();
  assert.equal(await page.locator('#nv-tab').isVisible(),false,'explicit admin disable wins');
  response={page:{title:'LIVE CONTENT'},featured:null,posts:[{id:'live-1',kind:'text',category:'novinka',title:'Live post'}],ads:[],panel:{enabled:true}};
  await page.reload({waitUntil:'load'});await page.locator('#nv-title').filter({hasText:'LIVE CONTENT'}).waitFor();
  assert.equal(await page.locator('#nv-pgrid .nv-pc').count(),0,'live content replaces sample');
  await page.route('**/store/novinky',route=>route.fulfill({status:503,json:{error:'synthetic unavailable'},headers:{'access-control-allow-origin':'*'}}));
  await page.reload({waitUntil:'load'});await page.locator('#nv-track .nv-post').first().waitFor();
  assert.equal(await page.locator('#nv-pgrid .nv-pc').count(),3,'API failure keeps sample content');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({width,passed:true,flags:flags.length,account}));
  await page.close();
 }
} finally {await browser.close()}
