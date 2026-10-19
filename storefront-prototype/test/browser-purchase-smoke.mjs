// Real local catalog + anonymous Store cart only. No accounts, orders, payments, messages or mocked network.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||pathToFileURL('/Users/lucky/hra-studio54/node_modules/playwright/index.mjs').href);
const base=process.env.STOREFRONT_URL||'http://127.0.0.1:4174';
assert.match(base,/^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
assert.equal(process.env.ALLOW_LOCAL_CART_SMOKE,'1','Explicit opt-in required: creates an anonymous cart and empties its items afterward');
const browser=await chromium.launch({channel:'chrome',headless:true});
let checks=0,adds=0,financial=0;const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},locale:'sk-SK'});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.method()==='POST'){const path=new URL(r.url()).pathname;if(/\/line-items$/.test(path))adds++;if(/payment|nexus-checkout|magic-link|contact|chat/.test(path))financial++;}});
 try{
  for(const slug of ['pletova-voda','nic-nemusis']){
   await page.goto(base+'/eshop/produkt/'+slug);await page.locator('[data-product-title]').waitFor();
   assert.equal(await page.evaluate(()=>/^pk_test_/.test(globalThis.__ANASTASIA_CONFIG__.stripePublishableKey)),true);checks++;
   await page.locator('.add-product button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('.toast')?.textContent.includes('pridaný'));checks++;
  }
  assert.equal(adds,2);checks++;
  await page.goto(base+'/kosik');await page.waitForFunction(()=>document.querySelectorAll('.cart-line').length===2);
  for(const q of await page.locator('.cart-line [aria-label="Množstvo"]').allTextContents()){assert.equal(Number(q),1);checks++;}
  const lines=page.locator('.cart-line');await lines.first().locator('[data-quantity="2"]').click();await page.waitForFunction(()=>[...document.querySelectorAll('.cart-line [aria-label="Množstvo"]')].some(e=>Number(e.textContent)===2));checks++;
  await page.goto(base+'/pokladna');await page.locator('#checkout-form [name=firstName]').waitFor();
  await page.locator('[data-next="2"]').click();assert.equal(await page.locator('fieldset[data-step="1"]').isVisible(),true);checks++;
  // Deliberately unsubmitted local form input; no customer/address API is called before authentication.
  await page.fill('[name=firstName]','Kontrola');await page.fill('[name=lastName]','Bez uloženia');await page.fill('#checkout-form [name=email]','inspection@example.invalid');await page.click('[data-next="2"]');
  await page.check('[name=delivery][value=shipping]');await page.click('[data-next="3"]');assert.equal(await page.locator('fieldset[data-step="2"]').isVisible(),true);checks++;
  await page.fill('[name=street]','Kontrola 1');await page.fill('[name=city]','Bratislava');await page.fill('[name=postalCode]','81101');await page.click('[data-next="3"]');
  await page.waitForFunction(()=>document.querySelector('#stripe-payment-element')?.textContent.includes('prihláste'));
  assert.equal(await page.locator('#stripe-payment-element iframe').count(),0);checks++;
  for(const width of [320,390,800,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);checks++;}
  assert.equal(financial,0);assert.deepEqual(errors,[]);checks+=2;
 }finally{
  // Only remove items belonging to this new browser context's anonymous inspection cart.
  await page.goto(base+'/kosik');await page.waitForSelector('#cart-view .cart-line, #cart-view .empty-state');
  while(await page.locator('.remove-line').count()){const n=await page.locator('.remove-line').count();await page.locator('.remove-line').first().click();await page.waitForFunction(count=>document.querySelectorAll('.remove-line').length<count,n);}
 }
 console.log(JSON.stringify({status:'PASS',checks,addRequests:adds,paymentOrMessagingRequests:financial,cartRestoredEmpty:true}));
}finally{await browser.close()}
