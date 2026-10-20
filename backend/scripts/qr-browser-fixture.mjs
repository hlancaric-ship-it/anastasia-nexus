import { qrAgenda } from '/qr.mjs';
import { createHttpApi } from '/http.mjs';
const view=document.querySelector('#qr-view');
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const api=async(path,{method='GET',body}={})=>{const r=await fetch('/api'+path,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.message||'API error');return d};
const wait=async(fn)=>{for(let i=0;i<500;i++){const v=fn();if(v)return v;await new Promise(r=>setTimeout(r,40))}throw Error('Browser condition timed out')};
const passed=[];
const assert=(ok,label)=>{if(!ok)throw Error(label);passed.push(label)};
try{
 await qrAgenda({api,esc,fmtDate:s=>s||'—',freshView:v=>v})(view);
 assert(view.textContent.includes('QR kódy'),'QR list visible');
 view.querySelector('[data-new]').click();
 view.querySelector('#qr-sku').value='QR-SYNTHETIC';view.querySelector('#qr-code').value='QR-SYNTHETIC10';
 view.querySelector('[data-create]').requestSubmit();
 await wait(()=>view.querySelector('[data-download]'));
 const generatedUrl=view.querySelector('#qr-url').value;
 assert(generatedUrl.includes('/eshop/kosik?'),'Generation opens saved detail');
 view.querySelector('[data-download="svg"]').click();
 await wait(()=>view.querySelector('[data-qr] img'));
 assert(view.querySelector('[data-qr] img').src.startsWith('data:image/svg+xml;base64,'),'Saved QR can be downloaded');
 view.querySelector('[data-back]').click();await wait(()=>view.querySelector('[data-import]'));
 view.querySelector('[data-import]').click();
 const field=view.querySelector('#qr-import'),save=view.querySelector('[data-save-import]');
 assert(save.disabled,'Import requires preview');
 field.value='https://old.example/eshop/kosik?kupon=QR-SYNTHETIC10&produkt=QR-SYNTHETIC&ks=1';field.dispatchEvent(new Event('input'));
 view.querySelector('[data-import-form]').requestSubmit();await wait(()=>!save.disabled);
 assert(view.querySelector('[role=status]').textContent.includes('Kontrola'),'Preview result announced');
 field.dispatchEvent(new Event('input'));assert(save.disabled,'Editing invalidates preview');
 view.querySelector('[data-import-form]').requestSubmit();await wait(()=>!save.disabled);save.click();
 await wait(()=>view.querySelector('[role=status]')?.textContent.includes('Uloženie'));
 assert(!view.querySelector('[role=alert]'),'No hidden UI error');
 const {regionId}=await(await fetch('/context')).json();
 for(const url of [generatedUrl,'https://old.example/eshop/kosik?kupon=QR-SYNTHETIC10&produkt=QR-SYNTHETIC&ks=1']){
  const values=new Map([['anastasia.jwt','synthetic-browser-login']]);
  const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
  const shop=createHttpApi(storage,{apiBaseUrl:location.origin+'/store-api',publishableKey:'pk_synthetic_browser',regionId});
  const result=await shop.importQr(new URL(url).searchParams);
  assert(result.ok&&result.couponApplied,'Actual storefront QR SKU resolution and server coupon application');
  await shop.importQr(new URL(url).searchParams);
  const cart=await shop.getCart();
  assert(cart.lines.length===1&&cart.lines[0].quantity===1,'Storefront rescan does not duplicate product');
 }
 assert(document.documentElement.scrollWidth<=innerWidth+1,'No horizontal overflow');
 document.querySelector('#result').textContent=JSON.stringify({status:'PASS',checks:passed.length,passed,width:innerWidth});
}catch(e){document.querySelector('#result').textContent=JSON.stringify({status:'FAIL',error:e.message})}
