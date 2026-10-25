// E2E: pokladňa s platbou kartou v TEST režime (Stripe pk_test_ + test client secret) prejde
// bez jediného kliknutia na lištu cookies.
//
// Platobná brána Stripe je nevyhnutná technológia: súhlas s cookies sa pri platbe nevyžaduje
// a platba sa ním nesmie blokovať.
//
// Beží na lokálnom náhľade storefrontu (dist/) + lokálna stubovacia API (syntetické údaje,
// žiadny skutočný obchod, žiadna platba) + zásahnutý Stripe.js (test klient – na Stripe sa
// nevykresuje žiadny požiadavok). Reálny Stripe test kľúč a reálna platba sa netýkajú.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {once} from 'node:events';
import net from 'node:net';
import {pathToFileURL,fileURLToPath} from 'node:url';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||pathToFileURL('/Users/lucky/hra-studio54/node_modules/playwright/index.mjs').href);

const CART_ID='cart_test';
const STRIPE_KEY='pk_test_synthetic_local';
const PUBLISHABLE_KEY='pk_synthetic_local';
const REGION_ID='reg_synthetic_local';

// --- stubovacia API: syntetické odpovede pokladne (čísla a texty sú vymyslené) ---------------
const cartPayload={cart:{id:CART_ID,metadata:{},
  items:[{id:'item_1',product_handle:'pletova-voda',product_title:'Pletová voda',title:'Pletová voda',
    thumbnail:'/assets/brand-mark.svg',unit_price:12,quantity:1,product:{handle:'pletova-voda',metadata:{}}}],
  shipping_methods:[{name:'Kuriér – platba na dobierku'}],
  total:12,item_subtotal:12,discount_total:0,shipping_total:6,tax_total:0}};
const optionsPayload={ok:true,requires_delivery:true,
  delivery:[{code:'courier',name:'Kuriér (zásielka)',amount:6,free_from:60},{code:'pickup',name:'Osobný odber',amount:0,address:'Zvolen'}],
  payment:[{code:'card',label:'Kartou online',available:true,fee:0},{code:'bank_transfer',label:'Prevodom na účet',available:true,fee:0},{code:'cod',label:'Na dobierku',available:true,fee:2}]};

const json=(res,status,data)=>{
  const origin=res.req.headers.origin||'*';
  res.writeHead(status,{'content-type':'application/json',
    'access-control-allow-origin':origin,'access-control-allow-credentials':'true',
    'access-control-allow-methods':'GET,POST,DELETE,OPTIONS',
    'access-control-allow-headers':'content-type,x-publishable-api-key,authorization'});
  res.end(JSON.stringify(data));
};
const stubApi=createServer((req,res)=>{
  req.resume();
  req.on('end',()=>{
    const path=new URL(req.url,'http://localhost').pathname;
    const method=req.method||'GET';
    if(method==='OPTIONS')return json(res,204,{});
    if(method==='GET'&&path==='/store/products')return json(res,200,{products:[]});
    if(method==='GET'&&path===`/store/carts/${CART_ID}`)return json(res,200,cartPayload);
    if(method==='POST'&&path===`/store/carts/${CART_ID}/customer`)return json(res,200,{cart:{id:CART_ID}});
    if(method==='POST'&&path===`/store/carts/${CART_ID}/consents`)return json(res,200,{});
    if(method==='POST'&&path===`/store/carts/${CART_ID}`)return json(res,200,{cart:{id:CART_ID}});
    if(method==='GET'&&path==='/store/nexus-checkout/options')return json(res,200,optionsPayload);
    if(method==='POST'&&path==='/store/nexus-checkout/options')return json(res,200,{ok:true,payment:'card',delivery:'courier',payment_required:true,client_secret:'pi_test_secret_local'});
    if(method==='GET'&&path==='/store/legal/versions')return json(res,200,{terms_version:'2026-10-21',privacy_version:'2026-10-21'});
    if(method==='POST'&&path==='/store/nexus-checkout')return json(res,200,{ok:true,order:{id:'order_test',display_id:1},paymentStatus:'PAID',payment_method:'card'});
    return json(res,404,{error:'NOT_FOUND',path,method});
  });
});
stubApi.listen(0,'127.0.0.1');
await once(stubApi,'listening');
const apiOrigin=`http://127.0.0.1:${stubApi.address().port}`;

const freePort=async()=>{const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;};
const webPort=await freePort();

// --- lokálny náhľad storefrontu (dist/) s reálnou CSP hlavičkou serve.mjs -------------------
const preview=spawn(process.execPath,['serve.mjs',String(webPort)],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,ANASTASIA_API_ORIGIN:apiOrigin},stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('preview nenaštartoval')),15000);preview.stdout.on('data',chunk=>{if(String(chunk).includes('ANASTASIA preview')){clearTimeout(timer);resolve();}});preview.on('exit',code=>reject(new Error('preview skončil: '+code)));});
const web=`http://127.0.0.1:${webPort}`;

// --- testovací klient Stripe.js (zásah sieťovej požiadavky, žiadny skutočný Stripe) ---------
const STRIPE_STUB=`
window.__stripeTest={key:null,elements:[],mounted:0,confirmed:0,type:null};
window.Stripe=function(key){
  window.__stripeTest.key=key;
  const elements=function(options){
    window.__stripeTest.elements.push(options);
    return {
      create:function(type){
        return {mount:function(host){
          window.__stripeTest.mounted++;window.__stripeTest.type=type;
          host.innerHTML='<div data-stripe-test-element="1">Stripe TEST platobny prvok</div>';
        }};
      },
    };
  };
  return {
    elements:elements,
    confirmPayment:function(){window.__stripeTest.confirmed++;return Promise.resolve({error:null});},
  };
};`;

// Chrome ak je v systéme, inak vlastný prehliadač Playwright.
const launchBrowser=async()=>{try{return await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});}catch{return await chromium.launch({headless:true});}};
const browser=await launchBrowser();
const checks=[];const pageErrors=[];
// Voliteľné snímky pre kontrolu dizajnu (SHOTS=adresár), test tým nemení správanie.
const shot=async(page,name)=>{if(!process.env.SHOTS)return;await page.addStyleTag({content:'#cookie-banner{display:none!important}'});await page.waitForTimeout(600);await page.screenshot({path:`${process.env.SHOTS}/${process.env.VIEWPORT_W||1440}-${name}.png`,fullPage:true});await page.evaluate(()=>document.querySelectorAll('style').forEach(s=>{if(s.textContent.includes('#cookie-banner{display:none'))s.remove();}));};
try{
  const context=await browser.newContext({viewport:{width:Number(process.env.VIEWPORT_W||1440),height:1000},locale:'sk-SK'});
  await context.addInitScript(({api,publishableKey,regionId,stripeKey,cartId})=>{
    window.__ANASTASIA__={apiBaseUrl:api,publishableKey,regionId,stripePublishableKey:stripeKey};
    try{sessionStorage.setItem('anastasia.cart',cartId);sessionStorage.setItem('anastasia.jwt','jwt_test');}catch{}
  },{api:apiOrigin,publishableKey:PUBLISHABLE_KEY,regionId:REGION_ID,stripeKey:STRIPE_KEY,cartId:CART_ID});
  let stripeLoads=0;
  await context.route('https://js.stripe.com/v3',route=>{stripeLoads++;route.fulfill({status:200,contentType:'application/javascript',body:STRIPE_STUB});});
  const page=await context.newPage();
  page.on('pageerror',error=>pageErrors.push(error.message));

  // Na iných stránkach sa platobná brána načítať nesmie.
  // Úvod webu (nový koncept) nemá preloader, lišta cookies je hneď viditeľná.
  await page.goto(`${web}/`,{waitUntil:'load'});
  await page.waitForSelector('#cookie-banner:not([hidden])',{timeout:20000});
  assert.equal(stripeLoads,0,'Stripe sa nesmie načítať mimo pokladne');
  assert.equal(await page.evaluate(()=>localStorage.getItem('anastasia.consent')),null,'lišta cookies nesmie mať uložené rozhodnutie');
  checks.push('domovská stránka: Stripe sa nenačítal, lišta cookies je otvorená');

  // Pokladňa: platba kartou v TEST režime bez kliknutia na lištu cookies.
  if(process.env.SHOTS){await page.goto(`${web}/kosik`,{waitUntil:'load'});await page.waitForTimeout(1500);await shot(page,'kosik');}
  await page.goto(`${web}/pokladna`,{waitUntil:'load'});
  await page.locator('#checkout-form [name=firstName]').waitFor();
  await shot(page,'pokladna-1');
  await page.fill('#checkout-form [name=firstName]','Kontrola');
  await page.fill('#checkout-form [name=lastName]','Bez kliknutia na lištu');
  await page.fill('#checkout-form [name=email]','kontrola@example.invalid');
  await page.locator('#checkout-form [data-next="2"]').click();
  await page.locator('#delivery-options input[name=delivery][value=courier]').waitFor();
  await page.check('#delivery-options input[name=delivery][value=courier]');
  await page.fill('#checkout-form [name=street]','Kontrolná 1');
  await page.fill('#checkout-form [name=city]','Bratislava');
  await page.fill('#checkout-form [name=postalCode]','81101');
  await page.locator('#checkout-form [data-next="3"]').click();
  await page.waitForSelector('#stripe-payment-element [data-stripe-test-element]',{timeout:15000});
  checks.push('pokladňa: platobný prvok Stripe sa načítal a zobrazil');
  await shot(page,'pokladna-3');

  assert.ok(stripeLoads>=1,'Stripe.js sa musí načítať pri výbere platby kartou');
  assert.equal(await page.evaluate(()=>localStorage.getItem('anastasia.consent')),null,'zákazník nesmie rozhodnúť o cookies, aby mohol zaplatiť');
  assert.equal(await page.locator('#cookie-banner').isVisible(),true,'lišta cookies musí zostať otvorená (test ju nikdy nekliká)');
  assert.equal(await page.evaluate(()=>window.__stripeTest.key),STRIPE_KEY,'Stripe musí byť inicializovaný testovacím kľúčom');
  assert.equal(await page.evaluate(()=>window.__stripeTest.elements[0]?.clientSecret),'pi_test_secret_local','Payment Element musí použiť test client secret');
  const body=await page.locator('body').innerText();
  assert.ok(!body.includes('dokončite nastavenia cookies'),'hlásenie o blokácii platby kartou nesmie byť na stránke');
  assert.ok(!body.includes('Pred platbou kartou'),'žiadne hlásenie o cookies v pokladni');
  checks.push('pokladňa: žiadne hlásenie o blokácii platby, súhlas s cookies nebol potrebný');

  // Odslanie objednávky: platba prejde a objednávka sa vytvorí.
  await page.check('#checkout-form [name=terms]');
  await page.check('#checkout-form [name=privacy]');
  await page.locator('#checkout-form [type=submit]').evaluate(element=>element.scrollIntoView({block:'center'}));
  await page.locator('#checkout-form [type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#checkout-result')?.textContent.includes('Ďakujeme'),null,{timeout:15000});
  assert.equal(await page.evaluate(()=>window.__stripeTest.confirmed),1,'platba kartou musí prejsť presne raz');
  assert.equal(await page.evaluate(()=>window.__stripeTest.mounted),1,'platobný prvok sa montuje raz');
  checks.push('objednávka: platba kartou potvrdená a objednávka vytvorená bez súhlasu s cookies');

  assert.deepEqual(pageErrors,[],`stránka nesmie padať: ${pageErrors.join(' | ')}`);
  checks.push('bez chýb v konzole prehliadača');
  console.log(JSON.stringify({status:'PASS',checks,stripeLoads,consentDecision:null,cardPayment:'test mode (pk_test_ synthetic)'},null,1));
}finally{
  await browser.close();
  preview.kill('SIGTERM');
  await new Promise(resolve=>stubApi.close(resolve));
}
