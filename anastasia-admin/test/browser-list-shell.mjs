// Local-only regression: synthetic customers/coupons, no credentials or live writes.
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/lucky/hra-studio54/node_modules/playwright/index.mjs');
const base = process.env.ADMIN_URL || 'http://127.0.0.1:4186';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw Error('Local preview only');
const browser = await chromium.launch({channel:'chrome',headless:true});
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
try {
 const page = await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[], writes=[];
 page.on('pageerror', e => errors.push(e.message));
 const customers=Array.from({length:31},(_,i)=>({id:`cus_${i}`,first_name:`Zákazník ${String(i).padStart(2,'0')}`,last_name:'Test',email:`customer${i}@example.test`,created_at:'2026-10-01T10:00:00Z',tier_code:i%2?'ZR1':null,tier_name:i%2?'Bronze':null}));
 const promotions=Array.from({length:31},(_,i)=>({id:`promo_${i}`,code:i===0?'20ABC':i===1?'20AAA':`KOD${String(i).padStart(2,'0')}`,status:'active',used:i,limit:100,application_method:{type:'percentage',value:i+1}}));
 await page.addInitScript(()=>{localStorage.setItem('ana_api','http://127.0.0.1:9100');localStorage.setItem('ana_token','synthetic-list-test');localStorage.setItem('ana_tour_seen:list_owner','1')});
 let delayOld=false, releaseOld;
 const oldResponseGate=new Promise(resolve=>{releaseOld=resolve});
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.origin==='http://127.0.0.1:9100'){
   const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers,body:''});
   if(req.method()!=='GET')writes.push({path:u.pathname,body:req.postDataJSON()});
   let json={};
   if(u.pathname==='/admin/users/me')json={user:{id:'list_owner',email:'owner@example.test'}};
   if(u.pathname==='/admin/nexus/admin-roles')json={current_user_id:'list_owner',admins:[{id:'list_owner',role:'owner'}]};
   if(u.pathname==='/admin/promotions')json={promotions,count:promotions.length};
   if(u.pathname==='/admin/orders')json={orders:customers.slice(0,5).map((c,i)=>({id:`order_${i}`,display_id:100+i,customer:c,email:c.email,created_at:c.created_at,status:'pending',payment_status:'captured',fulfillment_status:'not_fulfilled',total:123.45,shipping_methods:[{name:'Osobný odber'}],items:[{title:'Testovací produkt',variant_sku:'TEST-01',quantity:1}]})),count:5};
   if(u.pathname==='/admin/product-categories')json={product_categories:[],count:0};
   if(u.pathname==='/admin/products')json={products:[],count:0};
   if(u.pathname==='/admin/nexus/loyalty-customers'){
    const q=u.searchParams.get('q')||'',tier=u.searchParams.get('tier'),offset=Number(u.searchParams.get('offset')||0),limit=Number(u.searchParams.get('limit')||25);
    const filtered=customers.filter(c=>(!q||`${c.first_name} ${c.email}`.includes(q))&&(!tier||(tier==='none'?!c.tier_code:c.tier_code===tier)));
    json={customers:filtered.slice(offset,offset+limit),count:filtered.length,tiers:[{code:'ZR1',name:'Bronze'}]};
    if(delayOld&&q==='customer2')await oldResponseGate;
   }
   return route.fulfill({json,headers});
  }
  if(u.origin===base)return route.continue();
  return route.abort();
 });
 await page.goto(base+'/#/poukazy');
 await page.locator('#rc-wrap tr[data-id]').first().waitFor();
 check(await page.locator('#rc-wrap tr[data-id]').count()===25,'coupons first page');
 check(await page.locator('.st-head-act #promo-new').count()===1,'new coupon in common header');
 await page.locator('.st-pages [data-pg="1"]').first().click();
 check(await page.locator('#rc-wrap tr[data-id]').count()===6,'coupons second page');
 await page.locator('th[data-sort=title]').click();
 check((await page.locator('#rc-wrap tr').first().textContent()).includes('20AAA'),'numeric-prefixed codes sort as whole text');
 await page.locator('th[data-sort="Zľava"]').click();
 check(await page.locator('#rc-wrap tr').first().getAttribute('data-id')==='promo_0','discount numerical sort');
 check(await page.locator('#rc-wrap tr').nth(1).getAttribute('data-id')==='promo_1','discount 2 precedes 10');
 await page.locator('.rc-search').fill('KOD30');
 check(await page.locator('#rc-wrap tr[data-id]').count()===1,'coupon search resets pagination');
 await page.locator('.rc-search').fill('missing');
 check(await page.locator('#rc-wrap tr[data-id]').count()===0,'empty search');
 await page.locator('.rc-search').fill('');
 await page.locator('#promo-new').click();
 await page.locator('#pn-code').waitFor();
 check(await page.locator('#view').textContent().then(t=>t.includes('Nový kupón')),'moved button retains handler');
 await page.goto(base+'/#/zakaznicky');
 await page.locator('tbody tr[data-id]').first().waitFor();
 check(await page.locator('tbody tr[data-id]').count()===25,'customers first page');
 await page.locator('.st-pages [data-pg="1"]').first().click();
 await page.waitForFunction(()=>document.querySelectorAll('tbody tr[data-id]').length===6);
 check(await page.locator('tbody tr').first().getAttribute('data-id')==='cus_25','customer server pagination');
 await page.locator('[data-pick]').first().check();
 await page.locator('[data-st=funcs]').click();
 await page.locator('[data-fn="tier:ZR1"]').click();
 await page.waitForFunction(()=>document.querySelectorAll('tbody tr[data-id]').length===25);
 check(writes.length===1&&writes[0].body.customer_ids[0]==='cus_25'&&writes[0].body.tier_code==='ZR1','dynamic tier menu keeps selection');
 await page.locator('[data-st=filter]').click();
 await page.locator('[name=tier]').selectOption('none');
 await page.locator('.st-filter [type=submit]').click();
 await page.waitForFunction(()=>document.querySelectorAll('tbody tr[data-id]').length===16);
 check(await page.locator('.st-total b').textContent()==='16','tier filter count');
 await page.locator('.st-filter [type=reset]').click();
 await page.waitForFunction(()=>document.querySelectorAll('tbody tr[data-id]').length===25);
 delayOld=true;
 const oldRequest=page.waitForRequest(req=>new URL(req.url()).searchParams.get('q')==='customer2');
 await page.locator('.rc-search').fill('customer2');
 await oldRequest;
 await page.locator('.rc-search').fill('customer30');
 await page.waitForFunction(()=>document.querySelector('tbody tr[data-id]')?.dataset.id==='cus_30');
 const oldResponse=page.waitForResponse(res=>new URL(res.url()).searchParams.get('q')==='customer2');
 releaseOld();
 await (await oldResponse).finished();
 // Browser fetch continuations finish before the next animation frame.
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 check(await page.locator('tbody tr[data-id]').count()===1&&await page.locator('tbody tr[data-id]').first().getAttribute('data-id')==='cus_30','late search response cannot overwrite latest query');
 await page.locator('.rc-search').fill('');
 await page.waitForFunction(()=>document.querySelectorAll('tbody tr[data-id]').length===25);
 for(const width of [1280,1440]){
  await page.setViewportSize({width,height:1000});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`desktop overflow ${width}`);
  await page.screenshot({path:join(tmpdir(),`anastasia-list-customers-${width}.png`)});
 }
 await page.goto(base+'/#/objednavky');
 await page.locator('.ot-orders tbody tr[data-id]').first().waitFor();
 for(const width of [1280,1440,1920,2560]){
  await page.setViewportSize({width,height:1000});
  const widths=await page.locator('.ot-orders thead th').evaluateAll(cells=>cells.map(c=>Math.round(c.getBoundingClientRect().width)));
  console.log(JSON.stringify({viewport:width,orderColumns:widths}));
  check(Math.max(...widths.slice(2,9))-Math.min(...widths.slice(2,9))<=2,`balanced order columns ${width}`);
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`order page overflow ${width}`);
  await page.screenshot({path:join(tmpdir(),`anastasia-list-orders-${width}.png`)});
 }
 check(errors.length===0,`browser errors: ${errors.join('; ')}`);
 console.log(JSON.stringify({checks,passed:true,traffic:'synthetic only'}));
} finally {await browser.close()}
