import React from 'react'
import { createRoot } from 'react-dom/client'
import Memberships from '../../src/admin/routes/clenstva/Memberships'
import { DEFAULT_THEME } from '../../src/lib/admin-theme/policy'
const member:any={id:'mbr_synthetic',customer_id:'cus_synthetic',status:'unknown',period_end:'2027-01-01T00:00:00.000Z',period_elapsed:false,renew:true,last_order_id:'order_synthetic'}
const product:any={id:'prod_synthetic',title:'Ukážkové členstvo',status:'published',configuration:{version:'v1',period_days:30}}
let uncertain=false
const writes:any[]=[]
window.fetch=(async(url:string,init:RequestInit={})=>{
 const u=new URL(url,location.origin),body=init.body?JSON.parse(String(init.body)):undefined
 const reply=(value:any)=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}})
 if(u.pathname==='/admin/my-theme')return reply({selection:DEFAULT_THEME,revision:0})
 if(body){writes.push({path:u.pathname,body});if(uncertain)throw new Error('offline');if(u.pathname.endsWith('/stop')){member.renew=false;return reply({membership:member})}product.configuration=body.configuration;return reply({product})}
 const tab=u.searchParams.get('tab'),items=tab==='products'?[product]:tab==='checkouts'?[{id:'mck_synthetic',customer_id:'cus_synthetic',status:'prepared'}]:[member]
 return reply({items,count:1,offset:0,limit:12})
}) as typeof fetch
createRoot(document.getElementById('root')!).render(<Memberships/>);
const checks:string[]=[]
const assert=(yes:unknown,label:string)=>{if(!yes)throw new Error(label);checks.push(label)}
const tick=()=>new Promise(r=>setTimeout(r,30))
async function wait(test:()=>unknown){for(let i=0;i<120;i++){if(test())return;await tick()}throw new Error('TIMEOUT')}
function button(text:string,scope:ParentNode=document){const el=[...scope.querySelectorAll('button')].find(b=>b.textContent===text);if(!el)throw new Error('Missing '+text);return el}
async function click(text:string){button(text).click();await tick()}
function fill(id:string,value:string){const el=document.getElementById(id) as HTMLInputElement;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}))}
void(async()=>{try{
 await wait(()=>document.querySelectorAll('.membership-row').length===1)
 assert(document.body.textContent?.includes('Platbu treba dohľadať'),'unknown native status explained')
 assert(document.querySelector('a[href="/app/orders/order_synthetic"]'),'real native order navigation')
 assert(document.querySelector('a[href="/app/customers/cus_synthetic"]'),'real customer navigation')
 await click('Zastaviť obnovu');await wait(()=>document.querySelector('dialog[open]'))
 assert(document.querySelector('dialog')?.textContent?.includes('Už rozbehnutá platba môže byť dokončená'),'inflight payment warning before confirmation')
 await click('Potvrdiť zastavenie');await wait(()=>!document.querySelector('dialog'))
 assert(!member.renew&&writes.length===1,'stop calls native route exactly once')
 await click('Členské produkty');await wait(()=>document.body.textContent?.includes('Ukážkové členstvo'))
 await click('Upraviť podmienky');await wait(()=>document.querySelector('dialog[open]'))
 fill('member-version','v2');fill('member-days','60');await tick();await click('Uložiť podmienky');await wait(()=>!document.querySelector('dialog'))
 assert(product.configuration.period_days===60&&writes[1].body.expected.version==='v1','optimistic server config contract')
 assert(!('amount' in writes[1].body.configuration),'no client pricing calculation')
 await click('Nedokončené nákupy');await wait(()=>document.body.textContent?.includes('Nákup čaká na dokončenie'))
 assert(document.body.textContent?.includes('Nákup tu znovu nespúšťame'),'pending purchase never blindly retried')
 await click('Členské produkty');await wait(()=>document.body.textContent?.includes('Ukážkové členstvo'))
 await click('Upraviť podmienky');await wait(()=>document.querySelector('dialog[open]'));uncertain=true
 fill('member-version','v3');await tick();await click('Uložiť podmienky');await wait(()=>document.querySelector('[role=alert]'))
 assert(button('Uložiť podmienky').disabled,'unknown result disables repeat write')
 assert(document.querySelector('[role=alert]')?.textContent?.includes('Výsledok zmeny nepoznáme'),'unknown result announced')
 await click('Zavrieť a obnoviť údaje');uncertain=false;await click('Obnoviť údaje');await wait(()=>document.querySelectorAll('.membership-row').length===1)
 assert(!button('Upraviť podmienky').disabled,'readback required before next write')
 assert(document.documentElement.scrollWidth<=innerWidth,'no horizontal overflow')
 const cs=getComputedStyle(button('Upraviť podmienky'));assert(cs.color!==cs.backgroundColor,'button text readable')
 const result={status:'PASS',width:innerWidth,count:checks.length,checks};document.getElementById('result')!.textContent=JSON.stringify(result);if(parent!==window)parent.postMessage(result,location.origin)
}catch(e){const result={status:'FAIL',width:innerWidth,checks,error:String(e)};document.getElementById('result')!.textContent=JSON.stringify(result);if(parent!==window)parent.postMessage(result,location.origin)}})()
