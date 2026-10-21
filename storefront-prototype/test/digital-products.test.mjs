import test from 'node:test';
import assert from 'node:assert/strict';
import {createHttpApi} from '../src/lib/api/http.mjs';
import {DIGITAL_GROUPS,digitalGroupLabel} from '../src/lib/api/catalog.mjs';

const store=(storage={})=>createHttpApi({getItem:(k)=>storage[k]??null,setItem:()=>{}},{apiBaseUrl:'https://api.test',publishableKey:'pk_public_test',regionId:'reg_test'});
const digital={id:'prod_digital',handle:'reset-40-plus',title:'RESET 40+',metadata:{},description:'',thumbnail:null,images:[],categories:[{name:'AI ANASTASIA ACADEMY'}],variants:[{id:'var_d',calculated_price:{calculated_amount:168}}],shipping_profile:{type:'digital'}};
const physical={id:'prod_physical',handle:'pletova-voda',title:'Tvoja pleťová voda',metadata:{},description:'',thumbnail:null,images:[],categories:[{name:'BIOKOZMETIKA'}],variants:[{id:'var_p',calculated_price:{calculated_amount:11}}],shipping_profile:{type:'default'}};

test('digitálny produkt určuje dopravný profil, nie kategória',async()=>{
  globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({products:[digital,physical]})});
  const products=await store().getProducts();
  assert.equal(products.find(p=>p.slug==='reset-40-plus').digital,true);
  assert.equal(products.find(p=>p.slug==='reset-40-plus').digitalGroup,'ACADEMY kurzy');
  assert.equal(products.find(p=>p.slug==='pletova-voda').digital,false);
});

test('filter Fyzické / Digitálne rozdeľuje katalóg',async()=>{
  globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({products:[digital,physical]})});
  assert.deepEqual((await store().getProducts({type:'digital'})).map(p=>p.slug),['reset-40-plus']);
  assert.deepEqual((await store().getProducts({type:'physical'})).map(p=>p.slug),['pletova-voda']);
  assert.equal((await store().getProducts({type:''})).length,2);
});

test('skupiny digitálnych produktov vychádzajú z existujúcich kategórií a nič sa nemazí',()=>{
  assert.deepEqual(DIGITAL_GROUPS.map(g=>g.label),['ACADEMY kurzy','Audio a meditácie','E-knihy a dokumenty','Konzultácie']);
  assert.equal(digitalGroupLabel(['AI ANASTASIA ACADEMY']),'ACADEMY kurzy');
  assert.equal(digitalGroupLabel(['Konzultácie']),'Konzultácie');
  assert.equal(digitalGroupLabel(['BIOKOZMETIKA']),'BIOKOZMETIKA');
  assert.equal(digitalGroupLabel([]),'Digitálne produkty');
});
