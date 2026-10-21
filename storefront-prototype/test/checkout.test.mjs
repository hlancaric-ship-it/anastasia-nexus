import test from 'node:test';
import assert from 'node:assert/strict';
import {createHttpApi} from '../src/lib/api/http.mjs';

const memoryStorage=(seed={})=>{const m=new Map(Object.entries(seed));return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),m};};
const config={apiBaseUrl:'https://api.test',publishableKey:'pk_test_synthetic',regionId:'reg_1'};
function fakeFetch(routes){
  const calls=[];
  globalThis.fetch=async(url,init={})=>{
    const path=url.replace(config.apiBaseUrl,'');calls.push({path,method:init.method||'GET',body:init.body?JSON.parse(init.body):undefined});
    const hit=routes.find(([m,re])=>m===(init.method||'GET')&&re.test(path));
    const [status,data]=hit?(typeof hit[2]==='function'?hit[2]():hit[2]):[404,{error:'NOT_FOUND'}];
    return{status,ok:status>=200&&status<300,json:async()=>data};
  };
  return calls;
}
// Server (Medusa + NEXUS) vracia možnosti s cenami; klient ich len zobrazí.
const physicalOptions={ok:true,requires_delivery:true,
  delivery:[{code:'courier',name:'Kuriér (zásielka)',amount:6,free_from:60},{code:'pickup',name:'Osobný odber',amount:0,address:'Lucrat spol. s r.o., Sokolská 88, 960 01 Zvolen'}],
  payment:[{code:'cod',label:'Na dobierku',available:true,fee:2,requires_delivery:'courier'},{code:'card',label:'Kartou online',available:true,fee:0},{code:'bank_transfer',label:'Prevodom na účet',available:true,fee:0}]};
const digitalOptions={ok:true,requires_delivery:false,delivery:[],payment:[{code:'cod',label:'Na dobierku',available:false,fee:null,reason:'DIGITAL_ONLY'},{code:'card',label:'Kartou online',available:true,fee:0},{code:'bank_transfer',label:'Prevodom na účet',available:true,fee:0}]};
const routes=(opts=physicalOptions,select=[200,{ok:true,payment:'card',delivery:'courier',payment_required:true,client_secret:'pi_1_secret_x'}])=>[
  ['POST',/^\/store\/carts\/cart_d\/customer$/,[200,{cart:{id:'cart_d'}}]],
  ['POST',/^\/store\/carts\/cart_d$/,[200,{cart:{id:'cart_d'}}]],
  ['GET',/^\/store\/nexus-checkout\/options\?cart_id=cart_d$/,[200,opts]],
  ['POST',/^\/store\/nexus-checkout\/options$/,select],
  ['GET',/^\/store\/carts\/cart_d/,[200,{cart:{id:'cart_d',items:[],total:68,shipping_total:8,shipping_methods:[{name:'Kuriér – platba na dobierku'}]}}]],
];
const api=()=>createHttpApi(memoryStorage({'anastasia.jwt':'jwt','anastasia.cart':'cart_d'}),config);

test('courier to Czechia: address with country cz, server delivery prices and free-from-60 label',async()=>{
  const calls=fakeFetch(routes());
  const r=await api().prepareCheckout({firstName:'Eva',lastName:'Testová',email:'eva@example.com',delivery:'courier',street:'Na Příkopě 1',city:'Praha',postalCode:'110 00',country:'cz'});
  assert.equal(r.ok,true,r.message);
  const up=calls.find(c=>c.path==='/store/carts/cart_d'&&c.method==='POST');
  assert.equal(up.body.shipping_address.country_code,'cz');
  assert.equal(up.body.shipping_address.postal_code,'11000');
  const [courier,pickup]=r.options.delivery;
  assert.equal(courier.priceLabel.replace(/\s/g,' '),'6,00 €');
  assert.match(courier.freeFromLabel,/zadarmo pri nákupe od 60,00/);
  assert.equal(pickup.priceLabel,'zadarmo');
  assert.match(pickup.address,/Sokolská 88/);
  assert.match(r.options.payment[0].feeLabel,/^\+2,00/);
  // Klient nikdy sám nepridáva dopravu ani nevytvára platobnú session.
  assert.equal(calls.some(c=>c.path.includes('/shipping-methods')||c.path.includes('/payment-sessions')),false);
});

test('only Slovakia or Czechia can be sent as the country',async()=>{
  const calls=fakeFetch(routes());
  await api().prepareCheckout({email:'eva@example.com',delivery:'pickup',country:'de'});
  assert.equal(calls.find(c=>c.path==='/store/carts/cart_d'&&c.method==='POST').body.shipping_address.country_code,'sk');
});

test('digital-only cart: no delivery and cash on delivery is not offered',async()=>{
  fakeFetch(routes(digitalOptions));
  const r=await api().prepareCheckout({email:'eva@example.com',delivery:'digital'});
  assert.equal(r.ok,true);
  assert.equal(r.options.requiresDelivery,false);
  assert.equal(r.options.payment.find(p=>p.code==='cod').available,false);
});

test('selectCheckout sends only codes (no amounts, no provider) and returns the Stripe client secret',async()=>{
  const calls=fakeFetch(routes());
  const r=await api().selectCheckout({delivery:'courier',payment:'card'});
  assert.equal(r.ok,true);assert.equal(r.clientSecret,'pi_1_secret_x');
  const body=calls.find(c=>c.path==='/store/nexus-checkout/options'&&c.method==='POST').body;
  assert.deepEqual(body,{cart_id:'cart_d',delivery:'courier',payment:'card'});
  assert.equal(r.cart.shippingTitle,'Doprava a dobierka');
});

test('server refusal of cash on delivery is shown to the customer',async()=>{
  fakeFetch(routes(physicalOptions,[400,{ok:false,error:'COD_NOT_AVAILABLE'}]));
  const r=await api().selectCheckout({delivery:'pickup',payment:'cod'});
  assert.equal(r.ok,false);assert.match(r.message,/kuriérom/);
});

test('bank transfer order: unpaid, payment details (IBAN, VS, amount) from the server',async()=>{
  fakeFetch([['POST',/^\/store\/nexus-checkout$/,[200,{ok:true,order:{id:'order_1',display_id:1042},paymentStatus:'PENDING',payment_method:'bank_transfer',
    bank_transfer:{beneficiary:'Lucrat spol. s r.o.',bank:'Tatra banka',iban:'SK17 1100 0000 0026 2409 8906',swift:'TATRSKBX',variable_symbol:'1042',amount:66,currency_code:'eur'}}]]]);
  const r=await api().checkout();
  assert.equal(r.status,'PENDING');assert.match(r.messages,/prevodom/);
  assert.equal(r.bankTransfer.variable_symbol,'1042');assert.equal(r.bankTransfer.iban,'SK17 1100 0000 0026 2409 8906');
  assert.equal(r.bankTransfer.amountLabel.replace(/\s/g,' '),'66,00 €');
});

test('cash on delivery order: pay on receipt',async()=>{
  fakeFetch([['POST',/^\/store\/nexus-checkout$/,[200,{ok:true,order:{id:'o'},paymentStatus:'PENDING',payment_method:'cod',bank_transfer:null}]]]);
  const r=await api().checkout();
  assert.equal(r.status,'PENDING');assert.match(r.messages,/Platíte pri prevzatí/);assert.equal(r.bankTransfer,null);
});

test('failed completion after card payment tells the customer the payment was refunded',async()=>{
  fakeFetch([['POST',/^\/store\/nexus-checkout$/,[400,{ok:false,error:'CHECKOUT_FAILED',payment_compensation:'refunded'}]]]);
  const r=await api().checkout();
  assert.equal(r.status,'ERROR');assert.match(r.messages,/automaticky vrátili/);
});
