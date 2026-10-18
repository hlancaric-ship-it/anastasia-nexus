import test from 'node:test';
import assert from 'node:assert/strict';
import {createHttpApi} from '../src/lib/api/http.mjs';

// HTTP adaptér dedí z mocku (...mock). Chýbajúca metóda by potichu vracala ukážkové dáta,
// preto každá metóda s dátami zo servera musí naozaj volať backend.
const memoryStorage=(seed={})=>{const m=new Map(Object.entries(seed));return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};};
const config={apiBaseUrl:'https://api.test',publishableKey:'pk_test_synthetic',regionId:'reg_1'};

const SERVER_METHODS=[
  ['getProducts',[]],['getProduct',['x']],['getCategories',[]],['getEntitlements',[]],
  ['getGiftVoucherProduct',[]],['addGiftVoucher',[{variant_id:'v',recipient:{name:'Dana',email:'dana@example.com'}}]],
  ['applyGiftVoucher',['KOD']],['importQr',[new URLSearchParams('produkt=x')]],
  ['getAccount',[]],['getCustomerCenter',[]],['getChatStatus',[]],['getChatConversations',[]],['getChatConversation',['c1']],
  ['sendContact',[{name:'Dana',email:'dana@example.com',subject:'Iná otázka',message:'Dobrý deň, otázka.',consent:'on'}]],['subscribeNewsletter',[{email:'dana@example.com'}]],
  ['getBookingTypes',[]],['getBookingSlots',['prod_1','2026-10-20','2026-11-16']],
  ['reserveBooking',[{productId:'prod_1',variantId:'var_1',startsAt:'2026-10-20T08:00:00.000Z'}]],
];

for(const [name,args] of SERVER_METHODS){
  test(`http adapter ${name} calls the backend instead of the mock`,async()=>{
    let calls=0;
    globalThis.fetch=async()=>{calls++;return{status:500,ok:false,json:async()=>({})};};
    const api=createHttpApi(memoryStorage({'anastasia.jwt':'jwt'}),config);
    assert.equal(typeof api[name],'function');
    try{await api[name](...args);}catch{}
    assert.ok(calls>0,`${name} nevolá server`);
  });
}

test('gift voucher offer without backend product is empty, never sample values',async()=>{
  globalThis.fetch=async()=>({status:200,ok:true,json:async()=>({products:[]})});
  const p=await createHttpApi(memoryStorage(),config).getGiftVoucherProduct();
  assert.deepEqual(p.variants,[]);
});

// Konzultácie: server rozhoduje o termíne; klient pri chybe nič nenecháva podržané ani v košíku.
const respond=(status,data)=>({status,ok:status>=200&&status<300,json:async()=>data});
function router(routes){
  const log=[];
  globalThis.fetch=async(url,init={})=>{
    const path=url.replace('https://api.test',''),method=init.method||'GET';log.push(`${method} ${path}`);
    for(const [m,re,fn] of routes)if(m===method&&re.test(path))return fn(path,init.body?JSON.parse(init.body):undefined);
    return respond(404,{});
  };
  return log;
}

test('booking types come only from products with metadata.booking',async()=>{
  router([['GET',/^\/store\/products/,()=>respond(200,{products:[
    {id:'p1',handle:'konzultacia',title:'Konzultácia',metadata:{booking:{durationMinutes:60,form:'online'}},variants:[{id:'v1',calculated_price:{calculated_amount:40}}]},
    {id:'p2',handle:'stara',title:'Archív',metadata:{booking:{archived:true}},variants:[{id:'v2'}]},
    {id:'p3',handle:'olej',title:'Olej',metadata:{},variants:[{id:'v3'}]},
  ]})]]);
  const r=await createHttpApi(memoryStorage(),config).getBookingTypes();
  assert.equal(r.ok,true);
  assert.deepEqual(r.types.map(t=>[t.id,t.variantId,t.durationMinutes]),[['p1','v1',60]]);
});

test('reserveBooking requires login and never calls the server anonymously',async()=>{
  const log=router([]);
  const r=await createHttpApi(memoryStorage(),config).reserveBooking({productId:'p1',variantId:'v1',startsAt:'2026-10-20T08:00:00.000Z'});
  assert.equal(r.status,401);assert.equal(log.length,0);
});

test('slot taken by someone else returns 409 with a clear message and nothing is added to the cart',async()=>{
  const log=router([
    ['GET',/^\/store\/carts\/cart_1/,()=>respond(200,{cart:{id:'cart_1',items:[],metadata:{}}})],
    ['POST',/^\/store\/bookings$/,()=>respond(409,{type:'slot_taken',message:'Termín právě obsadil někdo jiný'})],
  ]);
  const r=await createHttpApi(memoryStorage({'anastasia.jwt':'jwt','anastasia.cart':'cart_1'}),config).reserveBooking({productId:'p1',variantId:'v1',startsAt:'2026-10-20T08:00:00.000Z'});
  assert.equal(r.ok,false);assert.equal(r.status,409);assert.match(r.message,/niekto iný/);
  assert.ok(!log.some(l=>l.includes('/line-items')),'pri obsadenom termíne sa nič nepridáva do košíka');
});

test('failed cart attachment releases the hold and removes the consultation line',async()=>{
  const storage=memoryStorage({'anastasia.jwt':'jwt','anastasia.cart':'cart_1'});
  let items=[];
  const log=router([
    ['GET',/^\/store\/carts\/cart_1/,()=>respond(200,{cart:{id:'cart_1',items,metadata:{}}})],
    ['POST',/^\/store\/bookings$/,()=>respond(201,{booking:{id:'bk_1',starts_at:'2026-10-20T08:00:00.000Z',ends_at:'2026-10-20T09:00:00.000Z',held_until:'2026-10-18T10:15:00.000Z'}})],
    ['POST',/^\/store\/carts\/cart_1\/line-items$/,()=>{items=[{id:'li_1',product_id:'p1',quantity:1,product:{metadata:{booking:{}}}}];return respond(200,{cart:{id:'cart_1'}});}],
    ['POST',/^\/store\/carts\/cart_1\/customer$/,()=>respond(200,{cart:{id:'cart_1'}})],
    ['POST',/^\/store\/bookings\/bk_1\/cart$/,()=>respond(409,{type:'booking_unavailable'})],
    ['POST',/^\/store\/bookings\/bk_1\/cancel$/,()=>respond(200,{booking:{id:'bk_1',status:'canceled'}})],
    ['DELETE',/^\/store\/carts\/cart_1\/line-items\/li_1$/,()=>{items=[];return respond(200,{});}],
  ]);
  const r=await createHttpApi(storage,config).reserveBooking({productId:'p1',variantId:'v1',startsAt:'2026-10-20T08:00:00.000Z'});
  assert.equal(r.ok,false);
  assert.ok(log.includes('POST /store/bookings/bk_1/cancel'),'podržaný termín sa uvoľní');
  assert.ok(log.includes('DELETE /store/carts/cart_1/line-items/li_1'),'riadok konzultácie sa odstráni');
  assert.equal(storage.getItem('anastasia.booking'),null);
});

test('consultation line quantity cannot be raised; removal releases the hold',async()=>{
  const storage=memoryStorage({'anastasia.jwt':'jwt','anastasia.cart':'cart_1','anastasia.booking':JSON.stringify({id:'bk_1',product_id:'p1',label:'x'})});
  let items=[{id:'li_1',product_id:'p1',product_handle:'konzultacia',quantity:1,unit_price:40,product:{metadata:{booking:{}}}}];
  const log=router([
    ['GET',/^\/store\/carts\/cart_1/,()=>respond(200,{cart:{id:'cart_1',items,metadata:{booking_id:'bk_1'},total:40}})],
    ['POST',/^\/store\/bookings\/bk_1\/cancel$/,()=>respond(200,{})],
    ['DELETE',/^\/store\/carts\/cart_1\/line-items\/li_1$/,()=>{items=[];return respond(200,{});}],
    ['POST',/^\/store\/carts\/cart_1$/,()=>respond(200,{cart:{id:'cart_1'}})],
    ['POST',/^\/store\/nexus-cart$/,()=>respond(200,{})],
  ]);
  const api=createHttpApi(storage,config);
  assert.equal((await api.setQuantity('konzultacia',2)).ok,false);
  assert.equal((await api.setQuantity('konzultacia',0)).ok,true);
  assert.ok(log.includes('POST /store/bookings/bk_1/cancel'));
  assert.ok(log.includes('POST /store/carts/cart_1'),'metadata.booking_id sa odpojí od košíka');
});

test('expired hold blocks payment before Stripe confirmation',async()=>{
  router([
    ['GET',/^\/store\/carts\/cart_1/,()=>respond(200,{cart:{id:'cart_1',items:[{id:'li_1',product_id:'p1',quantity:1,product:{metadata:{booking:{}}}}],metadata:{booking_id:'bk_1'}}})],
    ['GET',/^\/store\/bookings$/,()=>respond(200,{bookings:[{id:'bk_1',status:'held',held_until:'2000-01-01T00:00:00.000Z'}]})],
  ]);
  const r=await createHttpApi(memoryStorage({'anastasia.jwt':'jwt','anastasia.cart':'cart_1'}),config).verifyCartBooking();
  assert.equal(r.ok,false);assert.equal(r.expired,true);
});

function qrHttpFixture({ guest=false, valid=true }={}) {
 const storage=memoryStorage(guest?{}:{'anastasia.jwt':'synthetic-login'});
 let cart={id:'qr-cart',items:[]},adds=0,couponCalls=0;
 const calls=router([
  ['POST',/^\/store\/coupon-links$/,(_p,body)=>{assert.equal(body.produkt,'QR-SKU');assert.equal(body.ks,'2');return respond(valid?200:422,{variant_id:'qr-variant',quantity:2,code_valid:valid,discount_applied:false})}],
  ['POST',/^\/store\/carts$/,()=>respond(200,{cart})],
  ['GET',/^\/store\/carts\/qr-cart(?:\?|$)/,()=>respond(200,{cart})],
  ['POST',/^\/store\/carts\/qr-cart\/customer$/,()=>respond(200,{cart})],
  ['POST',/^\/store\/carts\/qr-cart\/line-items$/,(_p,body)=>{adds++;assert.deepEqual(body,{variant_id:'qr-variant',quantity:2});cart.items.push({id:'qr-line',variant_id:body.variant_id,quantity:body.quantity,unit_price:50});return respond(200,{cart})}],
  ['POST',/^\/store\/nexus-cart$/,(_p,body)=>{if(body.couponCode){couponCalls++;return respond(valid?200:400,valid?{ok:true,coupon:{code:body.couponCode}}:{error:'COUPON_INVALID'})}return respond(200,{ok:true})}],
 ]);
 return{storage,calls,api:createHttpApi(storage,config),stats:()=>({adds,couponCalls}),remove:()=>{cart.items=[]}};
}
const qrParams=()=>new URLSearchParams('produkt=QR-SKU&ks=2&kupon=OLD10');
test('QR resolves SKU server-side, uses returned variant, and never looks it up as a handle',async()=>{
 const f=qrHttpFixture();assert.equal((await f.api.importQr(qrParams())).couponApplied,true);
 assert.equal(f.stats().adds,1);assert.ok(!f.calls.some(p=>p.includes('/store/products')));
 await f.api.importQr(qrParams());assert.equal(f.stats().adds,1);
});
test('concurrent imports in the same page share one product insertion',async()=>{
 const f=qrHttpFixture();const result=await Promise.all([f.api.importQr(qrParams()),f.api.importQr(qrParams())]);
 assert.ok(result.every(r=>r.ok));assert.equal(f.stats().adds,1);
});
test('QR can retry its coupon after login without adding the product again',async()=>{
 const f=qrHttpFixture({guest:true});const first=await f.api.importQr(qrParams());assert.equal(first.ok,true);assert.equal(first.couponApplied,false);
 f.storage.setItem('anastasia.jwt','synthetic-login');assert.equal((await f.api.importQr(qrParams())).couponApplied,true);assert.equal(f.stats().adds,1);
});
test('an unavailable legacy coupon still adds the valid product without inventing a discount',async()=>{
 const f=qrHttpFixture({valid:false});const result=await f.api.importQr(qrParams());assert.equal(result.ok,true);assert.equal(result.couponApplied,false);assert.equal(f.stats().adds,1);
 assert.equal(f.storage.getItem('anastasia.coupon'),null);
});
test('removing a QR product allows an intentional later rescan to add it back',async()=>{
 const f=qrHttpFixture();await f.api.importQr(qrParams());f.remove();await f.api.importQr(qrParams());assert.equal(f.stats().adds,2);
});
