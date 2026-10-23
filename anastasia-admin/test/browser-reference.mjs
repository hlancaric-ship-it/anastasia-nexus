const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/lucky/hra-studio54/node_modules/playwright/index.mjs');
import { mkdir, writeFile } from 'node:fs/promises';
const base='http://127.0.0.1:4182';
const preview=process.argv.includes('--preview');
const browser=await chromium.launch({channel:'chrome',headless:!preview});
const page=await browser.newPage({viewport:preview ? null : {width:1536,height:1024}});
const errors=[];page.on('pageerror',e=>errors.push({message:e.message,stack:e.stack,url:page.url()}));
const now=Date.now();
const cats=['Kozmetika','Bylinky a výživa','Programy a služby','Darčekové vouchery'].map((name,i)=>({id:'cat_'+i,name,handle:'cat-'+i,is_active:true,products:[]}));
const products=['Výuka vedomého vnímania','MINERAL PROTECT','Letný rituál','Darčekový poukaz','Meditácia v praxi'].map((title,i)=>({id:'prod_'+i,title,handle:'product-'+i,status:'published',digital:i%2===0,description:'Popis testovacieho produktu pre kontrolu administrácie.',metadata:{},images:[],sales_channels:[{id:'sc_test'}],shipping_profile:{id:'sp_test',type:i%2===0?'digital':'default'},thumbnail:'/logo-mark.png',categories:[cats[i%4]],variants:[{id:'var_'+i,sku:'SKU'+i,prices:[{amount:[2600,68,54.9,100,1200][i],currency_code:'eur'}],manage_inventory:false}]}));
const customers=['Martina K.','Peter S.','Eva M.','Jana T.','Lucia R.'].map((name,i)=>({id:'cus_'+i,first_name:name.split(' ')[0],last_name:name.split(' ')[1],email:'customer'+i+'@example.test',created_at:new Date(now-i*3600000).toISOString(),groups:[],has_account:true,metadata:{}}));
const orders=Array.from({length:32},(_,i)=>({id:'order_'+i,display_id:1024-i,status:'pending',payment_status:'captured',fulfillment_status:i%2?'shipped':'fulfilled',total:[2600,68,54.9,100,1200][i%5],created_at:new Date(now-i*18*3600000).toISOString(),customer:customers[i%5],customer_id:customers[i%5].id,email:customers[i%5].email,items:[{id:'item_'+i,product_id:products[i%5].id,title:products[i%5].title,quantity:1,total:68,thumbnail:'/logo-mark.png'}]}));
const empty={count:0,products:[],orders:[],customers:[],product_categories:cats,inventory_items:[],conversations:[],bookings:[],checks:[],items:[],templates:[],pages:[],files:[],promotions:[],vouchers:[],entitlements:[],users:[],invites:[],shipping_options:[],payment_providers:[],stock_locations:[],sales_channels:[],regions:[],types:[],entries:[],events:[],logs:[],subscribers:[],campaigns:[],assets:[],groups:[],customer_groups:[],tiers:[],links:[],reviews:[],days:Array.from({length:7},(_,i)=>({date:new Date(now+i*86400000).toISOString().slice(0,10),ranges:[]})),shipping_profiles:[{id:'sp_test',type:'default',name:'Štandardná doprava'}],requests:[],media:[],policy:{tiers:[]},rules:[],settings:{enabled:true,values:[50,100,200],validity_months:12,delivery_method:'both',scope_type:'all',category_ids:[]},metadata:{},selection:{scheme:'forest'},revision:1};
await page.route('**/*',async route=>{
 const u=new URL(route.request().url());
 if(u.hostname==='localhost'&&u.port==='9100'){
 let data={...empty};const p=u.pathname;
 if(p==='/admin/users/me')data={user:{id:'visual_owner',first_name:'Lucia',email:'owner@example.test'}};
 else if(p==='/admin/nexus/admin-roles')data={current_user_id:'visual_owner',admins:[{id:'visual_owner',role:'owner'}]};
 else if(p==='/admin/products'||p==='/admin/product-catalogue') {
 const q=(u.searchParams.get('q')||'').toLowerCase(), type=u.searchParams.get('type'), status=u.searchParams.get('status');
 const filtered=products.filter(p=>(!q||p.title.toLowerCase().includes(q))&&(!status||p.status===status)&&(!type||(type==='digital')===p.digital));
 const offset=Number(u.searchParams.get('offset')||0),limit=Number(u.searchParams.get('limit')||50);
 data={products:filtered.slice(offset,offset+limit),count:filtered.length};
 }
 else if(p.match(/^\/admin\/products\/prod_\d+$/))data={product:products.find(x=>x.id===p.split('/').pop())};
 else if(p.match(/^\/admin\/orders\/order_\d+$/))data={order:orders.find(x=>x.id===p.split('/').pop())};
 else if(p.match(/^\/admin\/customers\/cus_\d+$/))data={customer:customers.find(x=>x.id===p.split('/').pop())};
 else if(p.match(/^\/admin\/product-categories\/cat_\d+$/))data={product_category:cats.find(x=>x.id===p.split('/').pop())};
 else if(p.includes('/protected-media'))data={revision:'a'.repeat(64),media:[],purchases:0};
 else if(p==='/admin/nexus/loyalty-customers')data={customers,count:customers.length,tiers:[]};
 else if(p==='/admin/orders')data={orders,count:32};
 else if(p==='/admin/customers')data={customers,count:18};
 else if(p==='/admin/product-categories')data={product_categories:cats,count:4};
 return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'},body:JSON.stringify(data)});
 }
 if(u.origin===base || u.hostname.endsWith('googleapis.com') || u.hostname.endsWith('gstatic.com'))return route.continue();
 return route.abort();
});
await page.addInitScript(()=>{if(window!==window.top)return;localStorage.setItem('ana_token','local-visual-fixture');localStorage.setItem('ana_tour_seen:visual_owner','1')});
await mkdir('shots/reference',{recursive:true});
if(process.argv.includes('--details')) {
 let checks=0;
 const inspect=async(name)=>{
  await page.evaluate(()=>document.fonts.ready);
  const issue=await page.evaluate(()=>{const visible=e=>!!(e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');return {overflow:document.documentElement.scrollWidth>innerWidth,errors:[...document.querySelectorAll('#view .err')].filter(visible).map(e=>e.textContent),clipped:[...document.querySelectorAll('#view button,#view input,#view select')].filter(visible).filter(e=>{const r=e.getBoundingClientRect();return r.left<0||r.right>innerWidth+1}).map(e=>e.id||e.textContent)}});
  if(issue.overflow||issue.errors.length||issue.clipped.length)throw Error(name+': '+JSON.stringify(issue));
  await page.screenshot({path:`shots/reference/detail-${name}.png`,fullPage:true});checks++;
 };
 try {
 for(const width of [1440,390]) {
  await page.setViewportSize({width,height:936});
  for(const [route,ready] of [['produkty','#p-back'],['objednavky','#o-back'],['zakaznicky','#cu-back'],['kategorie','#c-back']]){
   await page.goto(base+'/#/'+route);await page.locator('#view tr[data-id]').first().waitFor();
   await page.locator('#view tr[data-id]').first().press('Enter');await page.waitForSelector(ready);
   await inspect(`${route}-${width}`);
   const tabs=page.locator('#view .pe-tabs button,#view .tabs .tab');
   for(let i=0;i<await tabs.count();i++){await tabs.nth(i).click();await inspect(`${route}-${width}-tab${i}`)}
  }
  await page.goto(base+'/#/produkty');await page.waitForSelector('#p-new');await page.click('#p-new');await page.waitForSelector('#pn-save');await inspect(`new-product-${width}`);
  await page.goto(base+'/#/produkty');await page.waitForSelector('#ctx-help-btn');await page.click('#ctx-help-btn');
  const close=page.locator('#ctx-help .ctx-close');await close.waitFor({state:'visible'});
  if(!await close.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))}))throw Error('Help close obscured');
  await close.click();checks++;
  await page.goto(base+'/#/objednavky');await page.waitForSelector('tr[data-id]');
  if(await page.locator('tr[data-id]').count()!==6)throw Error('Expected six order cards');
  await page.locator('[data-pick]').first().check();await page.waitForSelector('#o-bulk:not([hidden])');await page.click('#o-bulk-clear');
  const first=await page.locator('tr[data-id]').first().getAttribute('data-id');await page.click('[data-pg="next"]');
  if(await page.locator('tr[data-id]').first().getAttribute('data-id')===first)throw Error('Pagination did not move');checks+=2;
  await page.goto(base+'/#/produkty');await page.locator('#p-body tr[data-id]').first().waitFor();await page.fill('input[aria-label="Hľadať produkty"]','MINERAL');
  await page.waitForFunction(()=>document.querySelectorAll('#p-body tr[data-id]').length===1);checks++;
 }
 if(errors.length)throw Error(JSON.stringify(errors));console.log(JSON.stringify({status:'PASS',checks}));
 } finally {await browser.close()}
 process.exit(0);
}
if(process.argv.includes('--header')) {
 await page.goto(base+'/#/objednavky');await page.waitForSelector('.ot');
 await page.evaluate(()=>window.scrollTo(0,1000));
 const result=await page.locator('.topbar').evaluate(el=>({top:el.getBoundingClientRect().top,searchVisible:document.elementFromPoint(el.querySelector('#side-q').getBoundingClientRect().left+20,35)?.id==='side-q'}));
 if(result.top!==0||!result.searchVisible)throw Error(JSON.stringify(result));
 await page.locator('[data-dd="bell"]').click();
 const above=await page.locator('[data-menu="bell"]').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.left+20,r.top+30))});
 if(!above)throw Error('Notification menu is occluded');
 console.log('PASS: fixed header, usable search and notification menu after scroll');await browser.close();process.exit(0);
}
if(process.argv.includes('--menus')) {
 for(const width of [1536,390]) {
  await page.setViewportSize({width,height:936});await page.goto(base);await page.waitForSelector('.kpi');
  for(const key of ['bell','user',...(width>800?['lang']:[])]) {
   await page.locator(`[data-dd="${key}"]`).click();
   const visible=await page.locator(`[data-menu="${key}"]`).evaluate(menu=>{const r=menu.getBoundingClientRect();const el=document.elementFromPoint(r.left+r.width/2,Math.min(r.bottom-8,innerHeight-8));return menu.contains(el)});
   if(!visible)throw Error(`Occluded ${key} menu at ${width}`);
   await page.locator(`[data-dd="${key}"]`).click();console.log(`${width} ${key} PASS`);
  }
  await page.screenshot({path:`shots/reference/menus-${width}.png`});
 }
 await browser.close();process.exit(0);
}
if(process.argv.includes('--fit')) {
 for(const [width,height] of [[1920,992],[1536,936],[1440,812],[1280,760]]) {
  await page.setViewportSize({width,height});await page.goto(base);await page.waitForSelector('.kpi');await page.evaluate(()=>document.fonts.ready);
  const result=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight,scrollWidth:document.documentElement.scrollWidth,bottom:document.querySelector('.banners').getBoundingClientRect().bottom}));
  console.log(JSON.stringify(result));if(result.scrollHeight>height||result.scrollWidth>width||result.bottom>height)process.exitCode=1;
  await page.screenshot({path:`shots/reference/fit-${width}.png`});
 }
 await browser.close();process.exit(process.exitCode||0);
}
if(preview){await page.goto(base);await page.waitForSelector('.kpi');console.log('Interactive local preview — synthetic data, no backend writes.');await new Promise(resolve=>browser.on('disconnected',resolve));process.exit(0)}
const findings=[];
try{
 for(const width of [1536,1280,1024,800,390,320]){
 await page.setViewportSize({width,height:1024});await page.goto(base);await page.waitForSelector('.kpi');await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:`shots/reference/dashboard-${width}.png`,fullPage:true});
 const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('main *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>innerWidth+1&&!e.closest('.ot-wrap,.tabs')}).slice(0,8).map(e=>e.className)}));
 findings.push({route:'dashboard',...overflow});
 }
 for(const width of [1536,1280,390]){
 await page.setViewportSize({width,height:1024});
 for(const route of ['objednavky','produkty','kategorie','zakaznicky','konzultacie','spravy','obsah','poukazy','nastavenia','pomoc','ambasadori']){
 await page.goto(base+'/#/'+route);await page.waitForTimeout(180);
 const tabs=await page.locator('#actions .pills .pill').count();
 for(let i=0;i<Math.max(1,tabs);i++){
 if(tabs){await page.locator('#actions .pills .pill').nth(i).click();await page.waitForTimeout(120)}
 const result=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,title:document.querySelector('.pills .on')?.textContent,error:document.querySelector('#view>.err')?.textContent,offenders:[...document.querySelectorAll('main *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>innerWidth+1&&!e.closest('.ot-wrap,.tabs,.card-b:has(>table)')}).slice(0,5).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,60)}))}));
 findings.push({route,tab:i,...result});
 await page.screenshot({path:`shots/reference/${route}-${i}-${width}.png`,fullPage:true});
 }
 }
 }
 await writeFile('shots/reference/results.json',JSON.stringify({errors,findings},null,2));
 if(errors.length||findings.some(x=>x.scroll>x.width||x.error||x.offenders?.length))process.exitCode=1;
 console.log(JSON.stringify({views:findings.length,errors,overflow:findings.filter(x=>x.scroll>x.width),renderErrors:findings.filter(x=>x.error)},null,2));
}finally{await browser.close()}
