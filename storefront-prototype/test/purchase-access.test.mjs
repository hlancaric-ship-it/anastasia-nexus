import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../src/lib/api/index.mjs';
import {createHttpApi} from '../src/lib/api/http.mjs';
const config={apiBaseUrl:'https://api.test',publishableKey:'pk_synthetic',regionId:'reg_synthetic'};
const storage=()=>{const m=new Map([['anastasia.jwt','jwt'],['anastasia.cart','cart']]);return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
test('missing runtime configuration fails instead of showing sample data',()=>{
 const previous=globalThis.__ANASTASIA_CONFIG__;try{delete globalThis.__ANASTASIA_CONFIG__;assert.throws(()=>createApi(storage()),/pripojenie/);}finally{globalThis.__ANASTASIA_CONFIG__=previous;}
});
test('a useMock flag cannot switch the customer site to invented data',()=>{
 const previous=globalThis.__ANASTASIA_CONFIG__;try{globalThis.__ANASTASIA_CONFIG__={...config,useMock:true};assert.equal(createApi(storage()).mode,'http');}finally{globalThis.__ANASTASIA_CONFIG__=previous;}
});
for(const paymentStatus of ['PAID','PENDING',undefined])test(`checkout preserves server payment status ${paymentStatus}`,async()=>{
 globalThis.fetch=async()=>({status:200,ok:true,json:async()=>({order:{id:'order'},paymentStatus})});
 const r=await createHttpApi(storage(),config).checkout();assert.equal(r.status,paymentStatus==='PAID'?'ALLOW':'PENDING');
});
