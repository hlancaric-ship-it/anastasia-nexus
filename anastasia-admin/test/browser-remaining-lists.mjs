// Local synthetic regression for server-paged bookings/messages and complete ambassador list.
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || '/Users/lucky/hra-studio54/node_modules/playwright/index.mjs');
const base=process.env.ADMIN_URL || 'http://127.0.0.1:4188';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Local only');
const browser=await chromium.launch({channel:'chrome',headless:true});let checks=0;
const check=(v,m)=>{assert.ok(v,m);checks++};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('ana_api','http://127.0.0.1:9100');localStorage.setItem('ana_token','synthetic');localStorage.setItem('ana_tour_seen:owner','1')});
 const ambassadors=Array.from({length:31},(_,i)=>({id:`am_${i}`,name:`Partner ${i}`,email:`partner${i}@example.test`,code:`REF${i}`,status:i%2?'paused':'active',commission_percent:i,orders_count:i,revenue:i*10,commission_total:i,commission_pending:i}));
 await page.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());
  if(u.origin==='http://127.0.0.1:9100'){
   const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
   if(r.method()==='OPTIONS')return route.fulfill({status:204,headers,body:''});
   check(r.method()==='GET','only read-only synthetic requests');requests.push(u);
   let json={};
   if(u.pathname==='/admin/users/me')json={user:{id:'owner',email:'owner@example.test'}};
   if(u.pathname==='/admin/nexus/admin-roles')json={current_user_id:'owner',admins:[{id:'owner',role:'owner'}]};
   if(u.pathname==='/admin/bookings'||u.pathname==='/admin/chat/conversations'){
    const isBooking=u.pathname==='/admin/bookings',offset=Number(u.searchParams.get('offset')||0),limit=Number(u.searchParams.get('limit')||25),status=u.searchParams.get('status')||(isBooking?'confirmed':'open');
    const all=Array.from({length:31},(_,i)=>isBooking?{id:`booking_${i}`,status,starts_at:'2026-11-01T12:00:00Z',customer_id:'cus_1',product_id:'prod_1'}:{id:`conversation_${i}`,subject:`Topic ${i}`,customer:{name:'Synthetic Customer'},last_message_at:'2026-11-01T12:00:00Z',status,unread:i===0});
    json={[isBooking?'bookings':'conversations']:all.slice(offset,offset+limit),count:31,unread:1};
   }
   if(u.pathname==='/admin/customers')json={customers:[{id:'cus_1',first_name:'Synthetic',last_name:'Customer'}]};
   if(u.pathname==='/admin/products')json={products:[{id:'prod_1',title:'Synthetic Consultation'}]};
   if(u.pathname==='/admin/ambassadors')json={ambassadors,count:31,totals:{}};
   if(u.pathname==='/admin/ambassadors/settings')json={settings:{enabled:true,default_percent:10,cookie_days:30}};
   return route.fulfill({json,headers});
  }
  return u.origin===base?route.continue():route.abort();
 });
 for(const [section,endpoint] of [['konzultacie','/admin/bookings'],['spravy','/admin/chat/conversations']]){
  await page.goto(base+'/#/'+section);await page.locator('.st-table tbody tr[data-id]').first().waitFor();
  check(await page.locator('.st-table tbody tr[data-id]').count()===25,section+' first server page');
  check(await page.locator('.st-total b').textContent()==='31',section+' count');
  check(await page.locator('[data-st=funcs]').count()===0,section+' no empty bulk menu');
  for(const width of [1280,1440]){
   await page.setViewportSize({width,height:1000});
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),section+' desktop overflow '+width);
   await page.screenshot({path:join(tmpdir(),`anastasia-${section}-${width}.png`)});
  }
  if(section==='konzultacie'){
   const download=page.waitForEvent('download');await page.locator('#ics-export').click();
   check((await download).suggestedFilename()==='konzultacie.ics','calendar export retained');
   await page.locator('.st-table tbody tr[data-id]').first().press('Enter');await page.locator('#b-back').waitFor();
   check(await page.locator('#view').textContent().then(t=>t.includes('Synthetic Consultation')),'keyboard booking detail');
   await page.locator('#b-back').click();await page.locator('.st-table tbody tr[data-id]').first().waitFor();
  }
  await page.locator('.st-pages [data-pg="1"]').first().click();
  await page.waitForFunction(()=>document.querySelectorAll('.st-table tbody tr[data-id]').length===6);
  check(requests.some(u=>u.pathname===endpoint&&u.searchParams.get('offset')==='25'),section+' server offset');
  await page.locator('[data-st=filter]').click();await page.locator('.st-filter select').selectOption(section==='spravy'?'closed':'canceled');
  await page.locator('.st-filter [type=submit]').click();
  await page.waitForFunction(()=>document.querySelectorAll('.st-table tbody tr[data-id]').length===25);
  check(requests.some(u=>u.pathname===endpoint&&u.searchParams.get('status')===(section==='spravy'?'closed':'canceled')&&u.searchParams.get('offset')==='0'),section+' filter uses server');
 }
 await page.goto(base+'/#/ambasadori');await page.locator('#am-search').waitFor();
 check(await page.locator('.st-table tbody tr[data-id]:visible').count()===25,'ambassadors first page');
 await page.locator('.st-pages [data-pg="1"]').first().click();
 check(await page.locator('.st-table tbody tr[data-id]:visible').count()===6,'ambassadors second page');
 await page.locator('th[data-sort=commission_percent]').click();
 check(await page.locator('.st-table tbody tr[data-id]:visible').nth(1).getAttribute('data-id')==='am_1','ambassadors numeric sort');
 await page.locator('#am-search').fill('partner30@example.test');
 check(await page.locator('.st-table tbody tr[data-id]:visible').count()===1,'ambassadors search');
 check(await page.locator('.st-table tbody tr[data-id]:visible').first().getAttribute('data-id')==='am_30','search whole complete list');
 await page.locator('#am-search').fill('');
 await page.locator('[data-st=filter]').click();await page.locator('.st-filter select').selectOption('paused');await page.locator('.st-filter [type=submit]').click();
 check(await page.locator('.st-table tbody tr[data-id]:visible').count()===15,'ambassadors status filter');
 await page.locator('.st-filter [type=reset]').click();
 check(await page.locator('.st-table tbody tr[data-id]:visible').count()===25,'ambassadors reset');
 await page.locator('#am-search').fill('nonexistent');
 check(await page.locator('.st-table tbody tr[data-id]:visible').count()===0,'ambassadors empty search');
 check(await page.locator('tbody .empty:visible').count()===1,'ambassadors empty state');
 await page.locator('#am-search').fill('');
 for(const width of [1280,1440]){
  await page.setViewportSize({width,height:1000});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'ambassadors desktop overflow '+width);
  await page.screenshot({path:join(tmpdir(),`anastasia-ambasadori-${width}.png`)});
 }
 await page.locator('#am-btn-new').click();check(await page.locator('#am-new-name').isVisible(),'new ambassador form retained');
 check(errors.length===0,errors.join('; '));
 console.log(JSON.stringify({checks,passed:true,traffic:'synthetic only'}));
}finally{await browser.close()}
