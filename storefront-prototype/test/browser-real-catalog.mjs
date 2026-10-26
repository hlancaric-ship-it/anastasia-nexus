import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createHttpApi} from '../src/lib/api/http.mjs';
import {digitalTopics} from '../src/lib/digital-content.mjs';
const {config}=await import('../dist/config.mjs');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||pathToFileURL('/Users/lucky/hra-studio54/node_modules/playwright/index.mjs').href);
const base=process.env.STOREFRONT_URL||'http://127.0.0.1:4174';
// Testovací typ konzultácie (bez kategórie) slúži E2E rezervácii, do počtov katalógu nepatrí.
const products=(await createHttpApi({getItem:()=>null,setItem:()=>{}},config).getProducts()).filter(p=>!/^testovaci-/.test(p.slug));
assert.equal(products.length,14);assert.deepEqual(['Biokozmetika','Zdravé doplnky výživy','Programy a služby'].map(c=>products.filter(p=>p.category===c).length),[5,2,7]);
assert.equal(digitalTopics(products.find(p=>p.slug==='nic-nemusis')).length,6);
assert.equal(digitalTopics(products.find(p=>p.slug==='reset-40-plus')).length,16);
const b=await chromium.launch({channel:'chrome',headless:true});let checks=4;const errors=[];
try{
 const p=await b.newPage({viewport:{width:1586,height:992},reducedMotion:'reduce'});await p.addInitScript(()=>localStorage.setItem('ana-ambient-off','1'));
 p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await p.goto(base+'/eshop');await p.waitForFunction(()=>document.querySelectorAll('#catalog-results .product-card').length===14);
 for(const product of products){
  const card=p.locator('#catalog-results .product-card').filter({has:p.locator(`a[href="/eshop/produkt/${product.slug}"]`)});assert.equal(await card.count(),1);assert.ok((await card.innerText()).includes(product.name));assert.ok((await card.innerText()).includes(product.priceLabel));checks+=3;
  const img=card.locator('img').first();await img.evaluate(e=>{e.loading='eager';return e.decode()});assert.equal(await img.getAttribute('src'),product.image);checks++;
 }
 for(const product of products){
  await p.goto(base+'/eshop/produkt/'+product.slug);await p.locator('[data-product-title]').waitFor();assert.equal(await p.locator('[data-product-title]').innerText(),product.name);assert.equal(await p.locator('[data-product-price]').innerText(),product.priceLabel);checks+=2;
  const body=p.locator('[data-product-full-description]').first();assert.equal((await body.textContent()).replace(/\s+/g,' ').trim(),product.longDescription.replace(/\s+/g,' ').trim());checks++;
  if(product.slug!=='vyuka-vedomeho-vnimania'){const image=p.locator('[data-product-main-image]');await image.evaluate(e=>e.decode());assert.equal(await image.getAttribute('src'),product.image);checks++;}
  await p.setViewportSize({width:320,height:850});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),product.slug+' overflows on mobile');checks++;await p.setViewportSize({width:1586,height:992});
 }
 for(const width of [320,390,800,1586,1920]){
  await p.setViewportSize({width,height:992});await p.goto(base+'/eshop/produkt/vyuka-vedomeho-vnimania');await p.evaluate(()=>document.fonts.ready);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks++;
  const qty=p.locator('[name=quantity]');await p.getByRole('button',{name:'Zvýšiť množstvo',exact:true}).click();assert.equal(await qty.inputValue(),'2');await p.getByRole('button',{name:'Znížiť množstvo',exact:true}).click();assert.equal(await qty.inputValue(),'1');checks+=2;
  for(const title of ['Základné informácie','Predpoklady','Osnova výuky','Priebeh výuky','Dôležitá poznámka']){const summary=p.locator('summary').filter({hasText:title});await summary.click();assert.ok(await summary.evaluate(e=>e.parentElement.open));await summary.click();checks++;}
  if(width===1586){const g=await p.locator('.pd-main-image').boundingBox();assert.ok(Math.abs(g.x-103)<2&&Math.abs(g.width-707)<2&&Math.abs(g.height-427)<2);checks++;
   const q=await p.locator('.pd-quantity').boundingBox(),buy=await p.locator('.pd-buy').boundingBox(),contact=await p.locator('.pd-contact').boundingBox();assert.ok(Math.abs(q.y-buy.y)<2&&Math.abs(buy.y-contact.y)<2);checks++;
   await p.screenshot({path:process.env.PRODUCT_SCREENSHOT||'/tmp/anastasia-digital-current.png'});
  }
 }
 // CSP remains self for images, and the proxy exposes only public raster files from a fixed backend.
 const response=await p.request.get(base+'/eshop');assert.match(response.headers()['content-security-policy'],/img-src 'self'/);checks++;
 for(const path of ['/backend-media/static/secret.txt','/backend-media/static/test.svg']){const r=await p.request.get(base+path);assert.equal(r.status(),400);checks++;}
 assert.deepEqual(errors,[]);console.log(`${checks}/${checks} PASS: 14 real products, media, prices, full text, responsive layout, controls and CSP`);
} finally {await b.close();}
