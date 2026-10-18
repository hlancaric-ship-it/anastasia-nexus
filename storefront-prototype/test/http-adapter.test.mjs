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
