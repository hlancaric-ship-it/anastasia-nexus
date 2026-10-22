import test from 'node:test';
import assert from 'node:assert/strict';
import {createHttpApi} from '../src/lib/api/http.mjs';
import {isMediaUrl} from '../src/lib/media-url.mjs';
const store=()=>createHttpApi({getItem:()=>null,setItem:()=>{}},{apiBaseUrl:'https://api.test',publishableKey:'pk_public_test',regionId:'reg_test'});
const record={id:'prod_real',handle:'real',title:'Skutočný produkt',metadata:{description_text:'Úplný text zo servera'},description:'<p>Úplný text zo servera</p>',thumbnail:'https://media.test/real.jpg',images:[{url:'https://media.test/real.jpg'}],categories:[{name:'BIOKOZMETIKA'},{name:'Kozmetika'}],variants:[{id:'var_real',calculated_price:{calculated_amount:9.37}}]};
test('real catalogue keeps server price, media and full description; canonical category wins over archive',async()=>{
 globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({products:[record,{...record,metadata:{gift_voucher:true}}]})});
 const products=await store().getProducts({category:'bio-kozmetika-bez-chemie'});assert.equal(products.length,1);const p=products[0];assert.equal(p.name,record.title);assert.match(p.priceLabel,/9,37/);assert.equal(p.image,record.thumbnail);assert.deepEqual(p.images,[record.thumbnail]);assert.equal(p.descriptionHtml,record.description);assert.equal(p.longDescription,record.metadata.description_text);assert.equal(p.category,'BIOKOZMETIKA');
});
test('unavailable catalogue rejects instead of returning mock products',async()=>{globalThis.fetch=async()=>({ok:false,status:503,json:async()=>({})});await assert.rejects(store().getProducts());});
test('only the three agreed categories are exposed even when server retains archived categories',async()=>{
 globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({product_categories:['BIOKOZMETIKA','AI ANASTASIA ACADEMY','Zdravé doplnky výživy','Programy a služby','Kozmetika','VETERINA'].map(name=>({name}))})});assert.deepEqual(await store().getCategories(),['AI ANASTASIA ACADEMY','BIOKOZMETIKA','Zdravé doplnky výživy']);
});
test('local preview media works without allowing unsafe media protocols or remote HTTP',()=>{
 for(const u of ['/assets/photo.avif','https://cdn.test/photo.jpg','http://127.0.0.1:9100/static.jpg','http://localhost:9100/static.jpg'])assert.equal(isMediaUrl(u),true,u);
 for(const u of ['//evil.test/p.jpg','javascript:alert(1)','data:image/svg+xml,x','http://evil.test/a.jpg','/a" onerror="x','/path\nfoo'])assert.equal(isMediaUrl(u),false,u);
});
