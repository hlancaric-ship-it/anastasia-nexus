import test from 'node:test';
import assert from 'node:assert/strict';
import {createHttpApi} from '../src/lib/api/http.mjs';
import {createMockApi} from '../src/lib/api/index.mjs';

const memoryStorage=(seed={})=>{const m=new Map(Object.entries(seed));return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),m};};
const config={apiBaseUrl:'https://api.test',publishableKey:'pk_test_synthetic',regionId:'reg_1'};
function fakeFetch(routes){
  const calls=[];
  globalThis.fetch=async(url,init={})=>{
    const path=url.replace(config.apiBaseUrl,'');calls.push({path,method:init.method||'GET',body:init.body?JSON.parse(init.body):undefined});
    const hit=routes.find(([m,re])=>m===(init.method||'GET')&&re.test(path));
    const [status,data]=hit?(typeof hit[2]==='function'?hit[2](path):hit[2]):[404,{error:'NOT_FOUND'}];
    return{status,ok:status>=200&&status<300,json:async()=>data};
  };
  return calls;
}
const offer={cart_id:'cart_m',product_id:'prod_m',variant_id:'var_m',title:'Klub',version:3,period_days:30,amount_minor:1900,currency:'eur',amount_label:'19,00 €'};

test('mock Klub never invents offers, prices or memberships',async()=>{
  const api=createMockApi();
  assert.deepEqual(api.getMembershipProducts(),[]);
  assert.equal(api.prepareMembership('x').ok,false);
  assert.equal(api.listMemberships().memberships.length,0);
});

test('membership checkout echoes server offer and never sends provider, method or own price',async()=>{
  const storage=memoryStorage({'anastasia.jwt':'jwt'});
  const calls=fakeFetch([
    ['POST',/^\/store\/carts$/,[200,{cart:{id:'cart_m'}}]],
    ['POST',/^\/store\/carts\/cart_m\/line-items$/,[200,{cart:{id:'cart_m'}}]],
    ['POST',/^\/store\/nexus-cart$/,[200,{}]],
    ['GET',/^\/store\/memberships\/offer\?cart_id=cart_m$/,[200,{offer}]],
    ['GET',/^\/store\/legal\/versions$/,[200,{terms_version:'t1',privacy_version:'p1'}]],
    ['POST',/^\/store\/carts\/cart_m\/consents$/,[200,{consent:{}}]],
    ['POST',/^\/store\/memberships\/checkout$/,[200,{checkout:{id:'mck_1',cart_id:'cart_m',status:'prepared'}}]],
    ['POST',/^\/store\/memberships\/checkouts\/mck_1\/payment-session$/,[200,{payment_session:{id:'ps',provider_id:'pp_membership_stripe_membership',client_secret:'pi_x_secret_y'}}]],
  ]);
  const api=createHttpApi(storage,config);
  const prepared=await api.prepareMembership('var_m');assert.equal(prepared.ok,true);assert.equal(prepared.offer.amount_label,'19,00 €');
  assert.equal((await api.startMembershipCheckout({auto_renew:true})).ok,false,'consent is mandatory');
  const started=await api.startMembershipCheckout({auto_renew:true,terms_accepted:true,privacy_acknowledged:true});
  assert.equal(started.ok,true);assert.equal(started.clientSecret,'pi_x_secret_y');
  const ck=calls.find(c=>c.path==='/store/memberships/checkout');
  assert.deepEqual(ck.body,{cart_id:'cart_m',version:3,amount_minor:1900,auto_renew:true});
  const ps=calls.find(c=>c.path.endsWith('/payment-session'));assert.deepEqual(ps.body,{});
  assert.equal(storage.getItem('anastasia.cart'),null,'membership never touches the shop cart');
});

test('settle polls PENDING then clears local state on SETTLED; 409 after payment never asks to pay again',async()=>{
  const storage=memoryStorage({'anastasia.jwt':'jwt','anastasia.membership.cart':'cart_m','anastasia.membership.checkout':'mck_1'});
  let n=0;
  fakeFetch([
    ['POST',/^\/store\/nexus-checkout$/,[200,{order:{id:'ord'}}]],
    ['POST',/settle$/,()=>++n<2?[200,{status:'PENDING'}]:[200,{status:'SETTLED',membership_id:'mbr_1',access:{status:'ACTIVE'},mandate:{status:'SAVED'}}]],
  ]);
  const done=await createHttpApi(storage,config).completeMembership({delayMs:0});
  assert.equal(done.status,'SETTLED');assert.equal(done.membership_id,'mbr_1');assert.equal(storage.getItem('anastasia.membership.checkout'),null);
  const s2=memoryStorage({'anastasia.jwt':'jwt','anastasia.membership.cart':'cart_m','anastasia.membership.checkout':'mck_1'});
  fakeFetch([['POST',/^\/store\/nexus-checkout$/,[409,{}]]]);
  const review=await createHttpApi(s2,config).completeMembership({delayMs:0});
  assert.equal(review.status,'REVIEW');assert.match(review.message,/neopakujte/);
});

test('account: anonymous gets login prompt, server errors keep Slovak message, network failure is 503',async()=>{
  assert.equal((await createHttpApi(memoryStorage(),config).listMemberships()).status,401);
  fakeFetch([['POST',/stop$/,[404,{ok:false,error:'MEMBERSHIP_NOT_FOUND',message:'Členstvo alebo nákup sa nenašli.'}]]]);
  const api=createHttpApi(memoryStorage({'anastasia.jwt':'jwt'}),config);
  assert.equal((await api.stopMembership('mbr_x')).message,'Členstvo alebo nákup sa nenašli.');
  globalThis.fetch=async()=>{throw new TypeError('offline');};
  const r=await api.getMembershipPayment('mbr_x');assert.equal(r.ok,false);assert.equal(r.status,503);
});
