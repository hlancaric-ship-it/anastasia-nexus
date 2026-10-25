import test from 'node:test';
import assert from 'node:assert/strict';
import {createHttpApi} from '../src/lib/api/http.mjs';

const memoryStorage=(seed={})=>{const m=new Map(Object.entries(seed));return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),m};};
const config={apiBaseUrl:'https://api.test',publishableKey:'pk_test_synthetic',regionId:'reg_1'};
const respond=(status,data)=>({status,ok:status>=200&&status<300,json:async()=>data});

// GET /store/nexus-checkout/options: server rozhodne, či treba adresu, a vráti možnosti dopravy a platby.
const optionsFor=requiresDelivery=>({
  ok:true,
  requires_delivery:requiresDelivery,
  delivery:requiresDelivery?[
    {code:'courier',name:'Kuriér (zásielka)',amount:6,free_from:60},
    {code:'pickup',name:'Osobný odber',amount:0,address:'Lucrat spol. s r.o., Zvolen'},
  ]:[],
  payment:[
    {code:'card',label:'Kartou online',available:true,fee:0},
    {code:'bank_transfer',label:'Prevodom na účet',available:true,fee:0},
    {code:'cod',label:'Na dobierku',available:requiresDelivery,fee:requiresDelivery?2:null,reason:requiresDelivery?null:'DIGITAL_ONLY'},
  ],
});
const postOptionsOk=[200,{ok:true,delivery:'courier',payment:'card',payment_required:true,client_secret:'pi_test_secret',
  shipping:[{name:'Kuriér (zásielka)',amount:6}],totals:{item_total:10,shipping_total:6,tax_total:0,total:16}}];

function fakeFetch(routes){
  const calls=[];
  globalThis.fetch=async(url,init={})=>{
    const path=url.replace(config.apiBaseUrl,'');
    const method=init.method||'GET';
    const body=init.body?JSON.parse(init.body):undefined;
    calls.push({path,method,body});
    const hit=routes.find(([m,re])=>m===method&&re.test(path));
    const [status,data]=hit?hit[2]:[404,{ok:false,error:'NOT_FOUND'}];
    return respond(status,data);
  };
  return calls;
}
const cartRoutes=(options,postOptions=postOptionsOk)=>[
  ['POST',/^\/store\/carts\/cart_d\/customer$/,[200,{cart:{id:'cart_d'}}]],
  ['POST',/^\/store\/carts\/cart_d$/,[200,{cart:{id:'cart_d'}}]],
  ['GET',/^\/store\/nexus-checkout\/options\?/,[200,options]],
  ['POST',/^\/store\/nexus-checkout\/options$/,postOptions],
  ['GET',/^\/store\/carts\/cart_d(\?|$)/,[200,{cart:{id:'cart_d',items:[],total:16,item_subtotal:10,shipping_total:6,tax_total:0,shipping_methods:[{name:'Kuriér (zásielka)'}]}}]],
];
const storage=()=>memoryStorage({'anastasia.jwt':'jwt','anastasia.cart':'cart_d'});
const paths=calls=>calls.map(c=>`${c.method} ${c.path}`);
const posted=calls=>calls.find(c=>c.method==='POST'&&c.path==='/store/nexus-checkout/options')?.body;
const savedAddress=calls=>calls.find(c=>c.method==='POST'&&c.path==='/store/carts/cart_d')?.body;

test('fyzický košík: možnosti dopravy sú len kurýr a osobný odběr',async()=>{
  fakeFetch(cartRoutes(optionsFor(true)));
  const api=createHttpApi(storage(),config);
  const r=await api.getCheckoutOptions();
  assert.equal(r.ok,true,r.message);
  assert.equal(r.requires_delivery,true);
  assert.deepEqual(r.delivery.map(o=>o.code),['courier','pickup']);
  assert.equal(r.delivery[0].label,'Kuriér (zásielka)');
  assert.equal(r.delivery[1].feeLabel,'Zadarmo');
  assert.equal(r.delivery.some(o=>o.code==='digital'),false,'„Digitálny produkt“ nesmie byť v možnostiach dopravy');
});

test('digitálny košík: doprava sa nevolí a dobierka nie je dostupná',async()=>{
  fakeFetch(cartRoutes(optionsFor(false)));
  const api=createHttpApi(storage(),config);
  const r=await api.getCheckoutOptions();
  assert.equal(r.ok,true,r.message);
  assert.equal(r.requires_delivery,false);
  assert.deepEqual(r.delivery,[]);
  assert.equal(r.payment.find(p=>p.code==='cod').available,false);
  assert.equal(r.payment.find(p=>p.code==='card').available,true);
});

test('možnosti dopravy sa čítajú zo servera pre konkrétny košík',async()=>{
  const calls=fakeFetch(cartRoutes(optionsFor(true)));
  await createHttpApi(storage(),config).getCheckoutOptions();
  assert.ok(paths(calls).includes('POST /store/carts/cart_d/customer'),'košík sa priradí prihlásenému zákazníkovi');
  assert.ok(paths(calls).some(p=>p.startsWith('GET /store/nexus-checkout/options?cart_id=cart_d')),'možnosti sa čítajú pre konkrétny košík');
});

test('fyzický košík bez krajiny: doplníme krajinu a možnosti dopravy sa načítajú znova',async()=>{
  const calls=[];
  globalThis.fetch=async(url,init={})=>{
    const path=url.replace(config.apiBaseUrl,''),method=init.method||'GET';
    calls.push({path,method,body:init.body?JSON.parse(init.body):undefined});
    if(method==='POST'&&path==='/store/carts/cart_d/customer')return respond(200,{cart:{id:'cart_d'}});
    if(method==='POST'&&path==='/store/carts/cart_d')return respond(200,{cart:{id:'cart_d'}});
    if(method==='GET'&&path.startsWith('/store/nexus-checkout/options')){
      // Server vie cenu dopravy až podľa krajiny – prvý pokus zlyhá.
      if(!calls.some(c=>c.method==='POST'&&c.path==='/store/carts/cart_d'))return respond(409,{ok:false,error:'ADDRESS_REQUIRED'});
      return respond(200,optionsFor(true));
    }
    return respond(404,{ok:false,error:'NOT_FOUND'});
  };
  const r=await createHttpApi(storage(),config).getCheckoutOptions();
  assert.equal(r.ok,true,r.message);
  assert.equal(r.requires_delivery,true);
  assert.deepEqual(r.delivery.map(o=>o.code),['courier','pickup']);
  const saved=calls.find(c=>c.method==='POST'&&c.path==='/store/carts/cart_d');
  assert.equal(saved.body.shipping_address.country_code,'sk');
});

test('fyzický košík: prepareCheckout odovzdá serveru kód dopravy a použije client_secret',async()=>{
  const calls=fakeFetch(cartRoutes(optionsFor(true)));
  const api=createHttpApi(storage(),config);
  const r=await api.prepareCheckout({firstName:'Eva',lastName:'Testová',email:'eva@example.com',delivery:'courier',street:'Testovacia 12',city:'Bratislava',postalCode:'811 01',payment:'card'});
  assert.equal(r.ok,true,r.message);
  assert.deepEqual(posted(calls),{cart_id:'cart_d',delivery:'courier',payment:'card'});
  assert.equal(r.clientSecret,'pi_test_secret');
  assert.equal(r.paymentRequired,true);
  assert.deepEqual(r.totals,{item_total:10,shipping_total:6,tax_total:0,total:16});
  // Adresa sa ukladá do košíka pred výberom dopravy.
  assert.equal(savedAddress(calls).shipping_address.address_1,'Testovacia 12');
  assert.equal(savedAddress(calls).shipping_address.postal_code,'81101');
  // Klient nevytvára vlastnú dopravu ani platobnú session.
  assert.equal(paths(calls).some(p=>p.includes('/shipping-methods')),false);
  assert.equal(paths(calls).some(p=>p.includes('/shipping-options')),false);
  assert.equal(paths(calls).some(p=>p.includes('/payment-collections')),false);
  assert.equal(paths(calls).filter(p=>p==='POST /store/nexus-checkout/options').length,1);
});

test('digitálny košík: doprava je null a adresa bez ulice',async()=>{
  const calls=fakeFetch(cartRoutes(optionsFor(false),[200,{ok:true,delivery:null,payment:'card',payment_required:true,client_secret:'pi_test_digital',shipping:[],totals:{item_total:10,shipping_total:0,tax_total:0,total:10}}]));
  const api=createHttpApi(storage(),config);
  const r=await api.prepareCheckout({firstName:'Eva',lastName:'Testová',email:'eva@example.com',delivery:null,payment:'card'});
  assert.equal(r.ok,true,r.message);
  assert.deepEqual(posted(calls),{cart_id:'cart_d',delivery:null,payment:'card'});
  assert.equal(r.clientSecret,'pi_test_digital');
  assert.equal(savedAddress(calls).shipping_address.country_code,'sk');
  assert.equal(savedAddress(calls).shipping_address.address_1,undefined,'digitálny košík nepotrebuje adresu na doručenie');
});

test('smíšený košík: fyzický tovar vyžaduje dopravu, digitálny sa doručí elektronicky',async()=>{
  const calls=fakeFetch(cartRoutes(optionsFor(true)));
  const api=createHttpApi(storage(),config);
  const r=await api.prepareCheckout({firstName:'Eva',lastName:'Testová',email:'eva@example.com',delivery:'pickup',payment:'card'});
  assert.equal(r.ok,true,r.message);
  assert.deepEqual(posted(calls),{cart_id:'cart_d',delivery:'pickup',payment:'card'});
  // Osobný odběr nepotrebuje adresu na doručenie.
  assert.equal(savedAddress(calls).shipping_address.address_1,undefined);
  assert.equal(savedAddress(calls).shipping_address.country_code,'sk');
});

test('chyba dopravy pri fyzickom košíku má zákazníkovi zrozumiteľnú hlášku',async()=>{
  for(const code of ['INVALID_DELIVERY','SHIPPING_OPTION_UNAVAILABLE','DELIVERY_REQUIRED','SHIPPING_REQUIRED']){
    const calls=fakeFetch(cartRoutes(optionsFor(true),[409,{ok:false,error:code}]));
    const api=createHttpApi(storage(),config);
    const r=await api.prepareCheckout({firstName:'Eva',lastName:'Testová',email:'eva@example.com',delivery:'courier',street:'Testovacia 12',city:'Bratislava',postalCode:'811 01',payment:'card'});
    assert.equal(r.ok,false);
    assert.equal(r.error,code);
    assert.equal(r.message,'Košík obsahuje tovar na doručenie. Zvoľte doručenie na adresu.',code);
    assert.equal(paths(calls).some(p=>p.includes('/shipping-methods')),false);
  }
});

test('chyby platby a prihlásenia sa preložia na slovenské hlášky',async()=>{
  const paymentCalls=fakeFetch(cartRoutes(optionsFor(true),[400,{ok:false,error:'INVALID_PAYMENT_METHOD'}]));
  const payment=await createHttpApi(storage(),config).prepareCheckout({firstName:'Eva',lastName:'Testová',email:'eva@example.com',delivery:'courier',street:'Testovacia 12',city:'Bratislava',postalCode:'811 01',payment:'apple'});
  assert.equal(payment.ok,false);
  assert.equal(payment.message,'Zvoľte spôsob platby.');
  assert.equal(paymentCalls.length>0,true);

  const unavailableCalls=fakeFetch(cartRoutes(optionsFor(true),[400,{ok:false,error:'PAYMENT_METHOD_UNAVAILABLE'}]));
  const unavailable=await createHttpApi(storage(),config).prepareCheckout({firstName:'Eva',lastName:'Testová',email:'eva@example.com',delivery:'courier',street:'Testovacia 12',city:'Bratislava',postalCode:'811 01',payment:'card'});
  assert.equal(unavailable.ok,false);
  assert.match(unavailable.message,/nie je dostupný/);
  assert.equal(unavailableCalls.length>0,true);

  const deniedCalls=fakeFetch(cartRoutes(optionsFor(true),[401,{ok:false,error:'UNAUTHORIZED'}]));
  const denied=await createHttpApi(storage(),config).prepareCheckout({firstName:'Eva',lastName:'Testová',email:'eva@example.com',delivery:'courier',street:'Testovacia 12',city:'Bratislava',postalCode:'811 01',payment:'card'});
  assert.equal(denied.ok,false);
  assert.equal(denied.message,'Pre dokončenie objednávky sa prihláste.');
  assert.equal(deniedCalls.length>0,true);
});

test('hosť nakupuje bez registrácie: košík sa k účtu nepriraďuje, možnosti prídu zo servera',async()=>{
  const calls=fakeFetch(cartRoutes(optionsFor(true)));
  const api=createHttpApi(memoryStorage({'anastasia.cart':'cart_d'}),config);
  const options=await api.getCheckoutOptions();
  assert.equal(options.ok,true,options.message);
  assert.equal(paths(calls).some(p=>p.endsWith('/customer')),false,'hosťovi sa košík k účtu nepriraďuje');
  assert.equal(paths(calls).some(p=>p.startsWith('GET /store/nexus-checkout/options')),true);
});

test('checkout adaptér nevytvára vlastnú platobnú session',async()=>{
  const api=createHttpApi(storage(),config);
  assert.equal(typeof api.createPaymentSession,'undefined');
  assert.equal(typeof api.getCheckoutOptions,'function');
});
