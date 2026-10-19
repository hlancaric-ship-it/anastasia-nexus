import test from 'node:test';import assert from 'node:assert/strict';
import {bindProductPurchase} from '../public/purchase.mjs';
const fixture=()=>{const events=[],button={disabled:false},results=[];const form={dataset:{code:'real-product'},elements:{quantity:{value:'1'}},reportValidity:()=>true,addEventListener:(name,run)=>events.push(run),querySelectorAll:()=>[button]};return {form,button,events,results}};
test('only one handler and one mutation while a previous submission is pending',async()=>{
 const f=fixture();let finish,calls=0;const options={addToCart:()=>{calls++;return new Promise(r=>finish=r)},onResult:r=>f.results.push(r)};
 bindProductPurchase(f.form,options);bindProductPurchase(f.form,options);assert.equal(f.events.length,1);
 const first=f.events[0]({preventDefault(){}});assert.equal(f.button.disabled,true);await f.events[0]({preventDefault(){}});assert.equal(calls,1);
 finish({ok:true,message:'Added'});await first;assert.equal(f.button.disabled,false);assert.equal(f.results.length,1);
});
test('ambiguous network failure asks to check the cart and releases the button',async()=>{
 const f=fixture();bindProductPurchase(f.form,{addToCart:async()=>{throw Error('network')},onResult:r=>f.results.push(r)});
 await f.events[0]({preventDefault(){}});assert.equal(f.results[0].ok,false);assert.match(f.results[0].message,/skontrolujte košík/);assert.equal(f.button.disabled,false);
});
test('invalid forms and missing product do not mutate',async()=>{
 const f=fixture();let calls=0;bindProductPurchase(f.form,{addToCart:()=>{calls++},onResult:()=>{}});
 f.form.reportValidity=()=>false;await f.events[0]({preventDefault(){}});f.form.reportValidity=()=>true;f.form.dataset.code='';await f.events[0]({preventDefault(){}});assert.equal(calls,0);
});
