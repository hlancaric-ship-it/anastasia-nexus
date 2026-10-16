/** Browser behavior fixture. Synthetic transport only; not a real persistence/identity test. */
import React from 'react'
import { createRoot } from 'react-dom/client'
import Appearance from '../../src/admin/routes/vzhlad-administracie/Appearance'
import { DEFAULT_THEME } from '../../src/lib/admin-theme/policy'
let stored={selection:{...DEFAULT_THEME},revision:0}, writes=0, loseResponse=false, conflict=false, denyRead=false
window.confirm=()=>true
window.fetch=(async(_url:string,init:RequestInit={})=>{
 if(init.signal?.aborted)throw new DOMException('Aborted','AbortError')
 if(init.body){
  writes++
  if(conflict)return new Response('{}',{status:409})
  const body=JSON.parse(String(init.body));stored={selection:body.selection,revision:stored.revision+1}
  if(loseResponse)throw new Error('LOST_AFTER_WRITE')
 }else if(denyRead)return new Response('{}',{status:403})
 return new Response(JSON.stringify(stored),{headers:{'Content-Type':'application/json'}})
}) as typeof fetch
const root=createRoot(document.getElementById('root')!)
let instance=0
const render=()=>root.render(<React.StrictMode><Appearance key={instance++}/></React.StrictMode>)
render()
const checks:string[]=[]
const assert=(condition:unknown,label:string)=>{if(!condition)throw new Error(label);checks.push(label)}
const tick=()=>new Promise(r=>setTimeout(r,20))
async function wait(test:()=>unknown){for(let i=0;i<150;i++){if(test())return;await tick()}throw new Error('TIMEOUT')}
function button(label:string){const b=[...document.querySelectorAll('button')].find(el=>el.textContent?.trim()===label);if(!b)throw new Error('MISSING_BUTTON '+label);return b}
function radio(value:string){const el=document.querySelector<HTMLInputElement>(`input[name=admin-scheme][value=${value}]`)!;el.click()}
function fill(id:string,value:string){const el=document.getElementById(id) as HTMLInputElement;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}))}
const frame=()=>document.querySelector<HTMLElement>('.anastasia-admin')!
const report=(value:unknown)=>{document.getElementById('result')!.textContent=JSON.stringify(value)}
void(async()=>{
 await wait(()=>document.querySelectorAll('input[name=admin-scheme]').length===5&&!document.querySelector<HTMLInputElement>('input[name=admin-scheme]')!.matches(':disabled'))
 assert(frame().dataset.theme==='original','original site palette is initial theme')
 assert(document.querySelector('input[value=original]')?.getAttribute('name')==='admin-scheme','five labeled theme choices')
 for(const value of ['forest','wine','night','original']){radio(value);await tick();assert(frame().dataset.theme===value,'live preview '+value)}
 radio('custom');await tick();fill('color-navigation','#777777');fill('color-accent','#a7a5cf');await tick()
 assert(getComputedStyle(frame()).getPropertyValue('--admin-navigation').trim()==='#777777','custom navigation updates preview')
 fill('color-accent','bad');await tick();assert(button('Uložiť môj vzhľad').disabled,'invalid color cannot be saved')
 fill('color-accent','#a7a5cf');await tick()
 document.querySelector<HTMLInputElement>('input[name=admin-density]:last-of-type') // Density is chosen by its label below.
 const compact=[...document.querySelectorAll('label')].find(l=>l.textContent==='Kompaktné')!;compact.querySelector('input')!.click();await tick()
 assert(frame().dataset.density==='compact','compact layout preview')
 button('Uložiť môj vzhľad').click();await wait(()=>document.querySelector('[role=status]')?.textContent?.includes('uložený'))
 assert(writes===1&&stored.selection.scheme==='custom','one save persists current selection')
 render();await wait(()=>frame().dataset.theme==='custom'&&!document.querySelector<HTMLInputElement>('input[name=admin-scheme]')!.matches(':disabled'))
 assert(frame().dataset.density==='compact','preference reload survives screen remount')
 radio('night');await tick();conflict=true;button('Uložiť môj vzhľad').click();await wait(()=>document.querySelector('[role=alert]'))
 assert(frame().dataset.theme==='night'&&button('Uložiť môj vzhľad').disabled,'conflict preserves preview and requires reload')
 conflict=false;button('Načítať uložený vzhľad').click();await wait(()=>frame().dataset.theme==='custom')
 radio('wine');await tick();loseResponse=true;const count=writes;button('Uložiť môj vzhľad').click();await wait(()=>document.querySelector('[role=alert]'))
 assert(writes===count+1&&button('Uložiť môj vzhľad').disabled,'lost response does not trigger blind resend')
 loseResponse=false;button('Načítať uložený vzhľad').click();await wait(()=>!document.querySelector('[role=alert]')&&frame().dataset.theme==='wine')
 assert(writes===count+1&&stored.selection.scheme==='wine','read after uncertainty recovers saved appearance')
 denyRead=true;render();await wait(()=>!!document.querySelector('[role=alert]'))
 assert(button('Uložiť môj vzhľad').disabled&&document.body.textContent?.includes('oprávnenie'),'read failure is not a false saved default')
 denyRead=false;button('Načítať uložený vzhľad').click();await wait(()=>!document.querySelector('[role=alert]'))
 button('Predvolený vzhľad').click();await tick();assert(frame().dataset.theme==='original','reset is an original-theme preview')
 assert(!button('Uložiť môj vzhľad').disabled,'reset must be confirmed with save')
 assert(document.documentElement.scrollWidth<=innerWidth+1,'no horizontal page overflow')
 assert([...document.querySelectorAll('button')].every(b=>b.getBoundingClientRect().height>=44),'button targets at least 44px')
 assert(getComputedStyle(document.getElementById('theme-sample-input')!).fontSize==='16px','consistent readable form font')
 button('Ukážka hlavného tlačidla').click();await tick();assert(document.body.textContent?.includes('iba náhľad tlačidla'),'preview action cannot pretend to save a product')
 report({status:'PASS',width:innerWidth,checks,writes})
})().catch(e=>report({status:'FAIL',error:String(e),checks,body:document.body.textContent?.slice(-1500)}))
