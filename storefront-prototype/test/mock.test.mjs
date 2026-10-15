import test from 'node:test';
import assert from 'node:assert/strict';
import {createMockApi,createApi} from '../src/lib/api/index.mjs';

test('cart validates quantity, rejects unknown identifiers, and caps aggregate quantities',()=>{
  const api=createMockApi();assert.equal(api.addToCart('unknown').ok,false);
  for(const qty of [0,-1,1.2,100,NaN,Infinity])assert.equal(api.addToCart('DEMO-GEL',qty).ok,false);
  assert.equal(api.addToCart('DEMO-GEL',98).ok,true);assert.equal(api.addToCart('DEMO-GEL',2).ok,false);
  assert.equal(api.addToCart('DEMO-GEL').ok,true);assert.equal(api.getCart().lines[0].quantity,99);
  assert.equal(api.setQuantity('bio-sprchovy-gel',0).ok,true);assert.equal(api.getCart().lines.length,0);
});
test('QR retains product, quantity and coupon; reload is idempotent',()=>{
  const state=new Map(),storage={getItem:k=>state.get(k),setItem:(k,v)=>state.set(k,v)};
  const api=createMockApi(storage),params=new URLSearchParams('produkt=DEMO-GEL&ks=3&kupon=DEMO10');
  assert.equal(api.importQr(params).ok,true);assert.equal(api.getCart().lines[0].quantity,3);assert.equal(api.getCart().coupon,'DEMO10');
  const restored=createMockApi(storage);assert.equal(restored.importQr(params).ok,true);assert.equal(restored.getCart().lines[0].quantity,3);
});
test('invalid QR quantity and unknown product never mutate the cart',()=>{
  const api=createMockApi();for(const qty of ['0','-1','1.5','1e2','Infinity','100',''])assert.equal(api.importQr(new URLSearchParams({produkt:'DEMO-GEL',ks:qty})).ok,false);
  assert.equal(api.importQr(new URLSearchParams({produkt:'<script>',ks:'1'})).ok,false);assert.equal(api.getCart().lines.length,0);
});
test('invalid coupon preserves inserted QR product but never grants discount',()=>{
  const api=createMockApi();const result=api.importQr(new URLSearchParams('produkt=DEMO-GEL&ks=2&kupon=NOPE'));
  assert.equal(result.ok,true);assert.equal(api.getCart().lines[0].quantity,2);assert.equal(api.getCart().coupon,'');assert.match(result.message,/nie je/);
});
test('adapters isolate sessions and tolerate unavailable/corrupt browser storage',()=>{
  const a=createMockApi(),b=createMockApi();a.addToCart('DEMO-GEL');assert.equal(b.getCart().lines.length,0);
  const api=createMockApi({getItem:()=>'{invalid',setItem:()=>{throw Error('denied');}});assert.equal(api.addToCart('DEMO-GEL').ok,true);
});
test('persisted untrusted lines and coupon cannot inject product/price values',()=>{
  const api=createMockApi({getItem:()=>JSON.stringify({lines:[{slug:'<script>',quantity:1},{slug:'bio-sprchovy-gel',quantity:2,priceLabel:'0 €'}],coupon:'HACK',qrKeys:[null,1,'safe']})});
  assert.equal(api.getCart().lines.length,1);assert.equal(api.getCart().lines[0].priceLabel,'18,00 €');assert.equal(api.getCart().coupon,'');
});
test('mock auth does not enumerate accounts and never authenticates tokens',()=>{
  const api=createMockApi();assert.deepEqual(api.requestMagicLink('known@example.test'),api.requestMagicLink('unknown@example.test'));assert.equal(api.confirmMagicLink({token:'fake'}).ok,false);
});
test('entitlements are independent of history and default locked',()=>{
  const api=createMockApi();assert.equal(api.getAccount().orders.length,1);assert.equal(api.getEntitlements().active,false);assert.equal(api.getEntitlements({preview:'unlocked'}).weeks.length,16);
});
test('checkout has four explicit outcomes without granting access',()=>{
  const api=createMockApi();for(const scenario of ['ALLOW','REVIEW','BLOCK','ERROR']){assert.equal(api.checkout({scenario}).status,scenario);assert.ok(api.checkout({scenario}).messages);assert.equal(api.getEntitlements().active,false);}
});
test('data is returned defensively and catalogue filters are coherent',()=>{
  const api=createMockApi();const products=api.getProducts();products[0].name='changed';assert.notEqual(api.getProducts()[0].name,'changed');assert.equal(api.getProducts({search:'SPRCHOVÝ'}).length,1);assert.equal(api.getProducts({category:'Kozmetika'}).length,4);
});
test('async adapter waits for writes and serializes concurrent mutations',async()=>{
  const api=createApi();await Promise.all([api.addToCart('DEMO-GEL'),api.addToCart('DEMO-GEL',2),api.applyCoupon('DEMO10')]);
  const cart=await api.getCart();assert.equal(cart.lines[0].quantity,3);assert.equal(cart.coupon,'DEMO10');
});
test('a rejected write does not poison the async adapter queue',async()=>{
  let calls=0;const api=createApi(undefined,{addToCart:async()=>{if(calls++===0)throw Error('offline');return{ok:true};}});
  await assert.rejects(api.addToCart(),/offline/);assert.equal((await api.addToCart()).ok,true);
});

test('chat rejects server states and validates Unicode text without sharing sessions',async()=>{
  const api=createApi();
  for(const [preview,status,type] of [['ineligible',403,'chat_not_eligible'],['blocked',403,'chat_blocked'],['limit',429,'chat_consecutive_limit'],['daily',429,'chat_daily_limit'],['closed',409,'conversation_closed']]){
    await api.setChatPreview(preview);assert.deepEqual(await api.sendChatMessage({conversation_id:'demo-chat',body:'Otázka'}),{ok:false,status,type});
  }
  await api.setChatPreview('open');
  assert.equal((await api.sendChatMessage({body:' '})).type,'message_empty');
  assert.equal((await api.sendChatMessage({body:'😀'.repeat(2001)})).type,'message_too_long');
  const text='<img src=x onerror=alert(1)> https://example.test';
  const first=await api.sendChatMessage({conversation_id:'demo-chat',body:text});assert.equal(first.message.body,text);
  const results=await Promise.all([api.sendChatMessage({body:'😀'.repeat(2000)}),api.sendChatMessage({body:'Tretia'}),api.sendChatMessage({body:'Štvrtá'})]);
  assert.deepEqual(results.map(r=>r.status),[201,201,429]);
  assert.equal(createMockApi().getChatConversation('demo-chat').messages.length,1);
});
test('voucher variants come from API; recipient validation, cart reload and authoritative credit',async()=>{
  const values=new Map();const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  const api=createMockApi(storage);const product=api.getGiftVoucherProduct();assert.deepEqual(product.variants.map(v=>v.title),['50,00 €','100,00 €','200,00 €']);
  product.variants[0].title='changed';assert.equal(api.getGiftVoucherProduct().variants[0].title,'50,00 €');
  assert.equal(api.addGiftVoucher({variant_id:'unknown',recipient:{}}).ok,false);
  assert.equal(api.addGiftVoucher({variant_id:'gv-50',recipient:{name:'Demo',email:'bad'}}).ok,false);
  assert.equal(api.addGiftVoucher({variant_id:'gv-50',recipient:{name:'Demo',email:'demo@example.test',message:'x'.repeat(301)}}).ok,false);
  assert.equal(api.addGiftVoucher({variant_id:'gv-100',recipient:{name:'Demo',email:'demo@example.test',message:'Darček'}}).ok,true);
  assert.equal(createMockApi(storage).getCart().lines[0].priceLabel,'100,00 €');
  assert.equal(api.applyGiftVoucher('DEMO-GIFT').error,'GIFT_VOUCHER_NOT_APPLICABLE');api.addToCart('DEMO-GEL');
  assert.equal(api.applyGiftVoucher('unknown').ok,false);const applied=api.applyGiftVoucher('DEMO-GIFT');assert.equal(applied.gift_voucher.amountLabel,'18,00 €');assert.equal(applied.cart.totalLabel,'0,00 €');
  assert.equal(JSON.stringify([...values.values()]).includes('example.test'),false);
  api.setQuantity('bio-sprchovy-gel',2);assert.equal(api.getCart().gift_voucher,null);
  api.applyGiftVoucher('DEMO-GIFT');assert.equal(api.removeGiftVoucher().gift_voucher,null);
});

test('customer centre shares account fixtures, keeps programs locked and never persists profile data',async()=>{
  const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};const api=createApi(storage);const center=await api.getCustomerCenter();
  assert.equal(center.mode,'mock');assert.equal(center.bookings.length,1);assert.equal(center.materials.length,3);center.profile.name='changed';assert.notEqual((await api.getCustomerCenter()).profile.name,'changed');
  assert.equal((await api.getEntitlements()).active,false);assert.equal((await api.saveCustomerProfile({email:'private@example.test'})).ok,true);assert.equal(JSON.stringify([...values.values()]).includes('private@example.test'),false);
  assert.ok((await api.addToCart(center.reorder[0].code)).ok);assert.equal((await api.getCart()).lines.length,1);
});
