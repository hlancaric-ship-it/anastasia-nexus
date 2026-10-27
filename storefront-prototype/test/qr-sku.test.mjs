import test from 'node:test';
import assert from 'node:assert/strict';
import {createHttpApi} from '../src/lib/api/http.mjs';

// QR odkazy zo starého webu nesú kód produktu (SKU, napr. EP.002), nie adresu produktu.
const memoryStorage=()=>{const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};};
const config={apiBaseUrl:'https://api.test',publishableKey:'pk_test_synthetic',regionId:'reg_1'};
const respond=(status,data)=>({status,ok:status>=200&&status<300,json:async()=>data});

test('QR odkaz s kódom produktu nájde variant podľa SKU a pridá ho do košíka',async()=>{
  const calls=[];
  globalThis.fetch=async(url,init={})=>{
    const path=url.replace('https://api.test',''),method=init.method||'GET';
    calls.push(`${method} ${path.split('?')[0]}`);
    if(method==='GET'&&/^\/store\/products\?handle=/.test(path))return respond(200,{products:[]});
    if(method==='GET'&&/^\/store\/products\?limit=100/.test(path))return respond(200,{products:[
      {id:'prod_a',handle:'iny',variants:[{id:'var_a',sku:'KO.001'}]},
      {id:'prod_b',handle:'reset-40-plus',variants:[{id:'var_b',sku:'EP.002'}]}]});
    if(method==='POST'&&path==='/store/carts')return respond(200,{cart:{id:'cart_1'}});
    if(method==='POST'&&/line-items$/.test(path)){const body=JSON.parse(init.body);calls.push('variant '+body.variant_id);return respond(200,{cart:{id:'cart_1'}});}
    return respond(200,{cart:{id:'cart_1',items:[]}});
  };
  const api=createHttpApi(memoryStorage(),config);
  const r=await api.addToCart('EP.002',1);
  assert.ok(calls.includes('variant var_b'),calls.join(' | '));
  assert.equal(r.ok,true);
});

test('neznámy kód produktu vráti zrozumiteľnú hlášku a nič nepridá',async()=>{
  globalThis.fetch=async(url)=>url.includes('limit=100')?respond(200,{products:[]}):respond(200,{products:[]});
  const api=createHttpApi(memoryStorage(),config);
  const r=await api.addToCart('XX.999',1);
  assert.equal(r.ok,false);
});
