import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkStore} from './check-store.mjs';
const config={apiBaseUrl:'https://test.invalid',publishableKey:'pk_public',regionId:'reg_test',stripePublishableKey:'pk_test_fixture'};
const product=(id,extra={})=>({id,thumbnail:'/photo.jpg',variants:[{calculated_price:{calculated_amount:10}}],...extra});
function server(pages){
 return async(url,options)=>{
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
  if(url.includes('/regions/'))return {ok:true,json:async()=>({region:{id:'reg_test',currency_code:'eur'}})};
  const page=Number(new URL(url).searchParams.get('offset'))/50;
  return {ok:true,json:async()=>pages[page]};
 };
}
test('empty real offers block handoff even with a valid ordinary catalog',async()=>{
 const r=await checkStore(config,server([{products:[product('a')],count:1}]));
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.checks.find(c=>c.id==='catalog').status,'PASS');
 assert.equal(r.checks.find(c=>c.id==='booking_offers').status,'BLOCKED');
});
test('reads all pages before evaluating offers, and uses only GET',async()=>{
 const first=Array.from({length:50},(_,i)=>product(String(i)));
 const last=[product('b',{metadata:{booking:{}}}),product('m',{metadata:{membership:{}}}),product('v',{handle:'darkovy-poukaz'})];
 const r=await checkStore(config,server([{products:first,count:53},{products:last,count:53}]));
 assert.equal(r.status,'PASS');assert.equal(r.checks.find(c=>c.id==='catalog').count,53);
});
test('incomplete pagination never reports readiness',async()=>{
 const r=await checkStore(config,server([{products:[],count:1}]));
 assert.equal(r.status,'BLOCKED');assert.equal(r.checks.find(c=>c.id==='complete_catalog').status,'BLOCKED');
});
test('network failure reports no private response or credentials',async()=>{
 const r=await checkStore(config,async()=>{throw Error('SECRET customer@example.com')});
 assert.equal(r.status,'BLOCKED');assert.ok(!JSON.stringify(r).includes('SECRET'));assert.ok(!JSON.stringify(r).includes('@'));
});

test('Club is explicitly out of scope and does not block otherwise complete prerequisites',async()=>{
 const products=[product('b',{metadata:{booking:{}}}),product('v',{handle:'darkovy-poukaz'})];
 const r=await checkStore(config,server([{products,count:2}]));
 assert.equal(r.status,'PASS');
 assert.deepEqual(r.checks.find(c=>c.id==='membership_offers'),{id:'membership_offers',status:'OUT_OF_SCOPE',count:0});
});
test('live or missing Stripe configuration blocks before any network access',async()=>{
 for(const key of ['pk_live_fixture','',undefined]){
  let calls=0;
  const r=await checkStore({...config,stripePublishableKey:key},async()=>{calls++;throw Error('unexpected request')});
  assert.equal(r.status,'BLOCKED');assert.equal(calls,0);
 }
});
