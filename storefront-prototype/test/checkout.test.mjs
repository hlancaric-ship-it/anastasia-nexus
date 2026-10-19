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
    const [status,data]=hit?hit[2]:[404,{error:'NOT_FOUND'}];
    return{status,ok:status>=200&&status<300,json:async()=>data};
  };
  return calls;
}
// Medusa vracia kuriéra aj pre čisto digitálny košík, keď má košík adresu.
const options=[
  {id:'so_digital',shipping_profile_id:'sp_digital',type:{code:'digital'}},
  {id:'so_courier',shipping_profile_id:'sp_default',type:{code:'courier'}},
];
const routes=(profiles)=>[
  ['POST',/^\/store\/carts\/cart_d\/customer$/,[200,{cart:{id:'cart_d'}}]],
  ['POST',/^\/store\/carts\/cart_d$/,[200,{cart:{id:'cart_d'}}]],
  ['GET',/^\/store\/shipping-options\?cart_id=cart_d/,[200,{shipping_options:options}]],
  ['GET',/^\/store\/carts\/cart_d\?fields=id,items\.product\.shipping_profile\.id$/,[200,{cart:{id:'cart_d',items:profiles.map(id=>({product:{shipping_profile:{id}}}))}}]],
  ['POST',/^\/store\/carts\/cart_d\/shipping-methods$/,[200,{cart:{id:'cart_d'}}]],
  ['POST',/^\/store\/nexus-cart$/,[200,{}]],
  ['GET',/^\/store\/carts\/cart_d/,[200,{cart:{id:'cart_d',items:[],total:0}}]],
];
const methods=calls=>calls.filter(c=>c.path==='/store/carts/cart_d/shipping-methods').map(c=>c.body.option_id);

test('digital-only cart (consultation, voucher) picks only the digital option and needs no address',async()=>{
  const calls=fakeFetch(routes(['sp_digital']));
  const api=createHttpApi(memoryStorage({'anastasia.jwt':'jwt','anastasia.cart':'cart_d'}),config);
  const r=await api.prepareCheckout({firstName:'Eva',lastName:'Testová',email:'eva@example.com',delivery:'digital'});
  assert.equal(r.ok,true,r.message);
  assert.deepEqual(methods(calls),['so_digital']);
});

test('physical cart without shipping address is rejected, with address gets only courier',async()=>{
  let calls=fakeFetch(routes(['sp_default']));
  let api=createHttpApi(memoryStorage({'anastasia.jwt':'jwt','anastasia.cart':'cart_d'}),config);
  assert.equal((await api.prepareCheckout({email:'eva@example.com',delivery:'digital'})).ok,false);
  assert.deepEqual(methods(calls),[]);
  calls=fakeFetch(routes(['sp_default']));
  api=createHttpApi(memoryStorage({'anastasia.jwt':'jwt','anastasia.cart':'cart_d'}),config);
  const r=await api.prepareCheckout({email:'eva@example.com',delivery:'shipping',street:'Testovacia 12',city:'Bratislava',postalCode:'811 01'});
  assert.equal(r.ok,true,r.message);
  assert.deepEqual(methods(calls),['so_courier']);
});

test('mixed cart gets one method per profile in the cart; missing option for a profile fails closed',async()=>{
  let calls=fakeFetch(routes(['sp_default','sp_digital']));
  let api=createHttpApi(memoryStorage({'anastasia.jwt':'jwt','anastasia.cart':'cart_d'}),config);
  assert.equal((await api.prepareCheckout({email:'eva@example.com',delivery:'shipping',street:'A 1',city:'B',postalCode:'81101'})).ok,true);
  assert.deepEqual(methods(calls).sort(),['so_courier','so_digital']);
  calls=fakeFetch(routes(['sp_unknown']));
  api=createHttpApi(memoryStorage({'anastasia.jwt':'jwt','anastasia.cart':'cart_d'}),config);
  assert.equal((await api.prepareCheckout({email:'eva@example.com',delivery:'shipping',street:'A 1',city:'B',postalCode:'81101'})).ok,false);
  assert.deepEqual(methods(calls),[]);
});
