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

test('guest reserveBooking holds the slot through booking-guest, never the account endpoint',async()=>{
  const log=router([
    ['GET',/^\/store\/carts\/cart_1/,()=>respond(200,{cart:{id:'cart_1',items:[],metadata:{}}})],
    ['POST',/^\/store\/carts\/cart_1\/line-items$/,()=>respond(200,{cart:{id:'cart_1',items:[]}})],
    ['POST',/^\/store\/booking-guest$/,()=>respond(201,{booking:{id:'b1',starts_at:'2026-10-20T08:00:00.000Z',ends_at:'2026-10-20T09:00:00.000Z',held_until:'2026-10-20T07:15:00.000Z'}})],
  ]);
  const r=await createHttpApi(memoryStorage({'anastasia.cart':'cart_1'}),config).reserveBooking({productId:'p1',variantId:'v1',startsAt:'2026-10-20T08:00:00.000Z'});
  assert.equal(r.ok,true,r.message);assert.equal(r.booking.id,'b1');
  assert.ok(log.includes('POST /store/booking-guest'));assert.ok(!log.includes('POST /store/bookings'),'guest never uses the account booking endpoint');
});

test('completed cart from a previous order is not reused for a guest booking',async()=>{
  const storage=memoryStorage({'anastasia.cart':'cart_old'});
  const log=router([
    ['GET',/^\/store\/carts\/cart_old/,()=>respond(200,{cart:{id:'cart_old',completed_at:'2026-10-27T18:00:00.000Z'}})],
    ['POST',/^\/store\/carts$/,()=>respond(200,{cart:{id:'cart_new'}})],
    ['GET',/^\/store\/carts\/cart_new/,()=>respond(200,{cart:{id:'cart_new',items:[],metadata:{}}})],
    ['POST',/^\/store\/carts\/cart_new\/line-items$/,()=>respond(200,{cart:{id:'cart_new',items:[]}})],
    ['POST',/^\/store\/booking-guest$/,(_p,body)=>body.cart_id==='cart_new'?respond(201,{booking:{id:'b2',starts_at:'2026-10-20T08:00:00.000Z',ends_at:'2026-10-20T09:00:00.000Z'}}):respond(404,{type:'not_found'})],
  ]);
  const r=await createHttpApi(storage,config).reserveBooking({productId:'p1',variantId:'v1',startsAt:'2026-10-20T08:00:00.000Z'});
  assert.equal(r.ok,true,r.message);assert.equal(storage.getItem('anastasia.cart'),'cart_new');
  assert.ok(!log.includes('POST /store/carts/cart_old/line-items'),'do dokončeného košíka sa nič nepridáva');
});

test('guest booking retries once with a fresh cart when the server does not know the stored cart',async()=>{
  const storage=memoryStorage({'anastasia.cart':'cart_acc'});
  let created=0;
  const log=router([
    ['GET',/^\/store\/carts\/cart_/,(p)=>respond(200,{cart:{id:p.match(/cart_\w+/)[0],items:[],metadata:{}}})],
    ['POST',/^\/store\/carts$/,()=>{created++;return respond(200,{cart:{id:'cart_fresh'}});}],
    ['POST',/^\/store\/carts\/cart_\w+\/line-items$/,()=>respond(200,{cart:{items:[]}})],
    ['POST',/^\/store\/booking-guest$/,(_p,body)=>body.cart_id==='cart_fresh'?respond(201,{booking:{id:'b3',starts_at:'2026-10-20T08:00:00.000Z',ends_at:'2026-10-20T09:00:00.000Z'}}):respond(404,{type:'not_found'})],
  ]);
  const r=await createHttpApi(storage,config).reserveBooking({productId:'p1',variantId:'v1',startsAt:'2026-10-20T08:00:00.000Z'});
  assert.equal(r.ok,true,r.message);assert.equal(r.booking.id,'b3');assert.equal(created,1,'najviac jeden nový košík');
  assert.equal(log.filter(l=>l==='POST /store/booking-guest').length,2);
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

test('a hanging backend call is aborted after the read timeout with a clear message',async(t)=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let signal=null;
  globalThis.fetch=(url,init)=>{signal=init.signal;return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'}))));};
  const pending=createHttpApi(memoryStorage(),config).getProducts();
  await new Promise(r=>setImmediate(r));
  assert.ok(signal,'fetch dostal AbortSignal');
  t.mock.timers.tick(14999);assert.equal(signal.aborted,false);
  t.mock.timers.tick(1);assert.equal(signal.aborted,true);
  await assert.rejects(pending,err=>err.code==='API_TIMEOUT'||/neodpovedá|nedostupn|načítať/i.test(String(err?.message)));
});

test('protected contents use the redacted ext from Store API and still accept legacy keys',async()=>{
  router([['GET',/^\/store\/products/,()=>respond(200,{products:[
    {id:'p1',handle:'reset',title:'RESET',metadata:{protected_media:[{title:'Kniha',ext:'PDF'},{title:'Starý',key:'paid/a.mp3'},{title:'Zlý',ext:'"><x'},null]},variants:[{id:'v1'}]},
  ]})]]);
  const p=await createHttpApi(memoryStorage(),config).getProduct('reset');
  assert.deepEqual(p.contents,[{title:'Kniha',ext:'pdf'},{title:'Starý',ext:'mp3'},{title:'Zlý',ext:'x'}]);
});
