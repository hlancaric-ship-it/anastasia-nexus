import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHttpApi,JWT_KEY} from '../src/lib/api/http.mjs';
import {createMockApi} from '../src/lib/api/mock.mjs';
import {createApi} from '../src/lib/api/index.mjs';
import {customerCenter} from '../src/customer-center.mjs';
import {accountGuardBoot} from '../src/account-guard.mjs';

// Odhlásenie: token a údaje zákazníka nesmú v prehliadači prežiť odhlásenie.
// Kľúče sú tie, ktoré používa http adaptér (pozri src/lib/api/http.mjs).
const config={apiBaseUrl:'https://api.test',publishableKey:'pk_test_synthetic',regionId:'reg_1'};
const memoryStorage=(seed={})=>{const m=new Map(Object.entries(seed));return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};};
const respond=(status,data)=>({status,ok:status>=200&&status<300,json:async()=>data});
const CUSTOMER_KEYS=['anastasia.jwt','anastasia.cart','anastasia.coupon','anastasia.qrkeys','anastasia.gift','anastasia.booking','anastasia.membership.cart','anastasia.membership.checkout','anastasia.membership.offer','anastasia.return'];
const seeded=()=>memoryStorage(Object.fromEntries([...CUSTOMER_KEYS.map(key=>[key,'x']),['anastasia.jwt','jwt'],['anastasia.cart','cart_1']]));

test('odhlásenie vymaže token aj údaje zákazníka z prehliadača',async()=>{
  globalThis.fetch=async()=>respond(204,{});
  const storage=seeded();
  const api=createHttpApi(storage,config);
  const result=await api.signOut();
  assert.equal(result.ok,true);
  for(const key of CUSTOMER_KEYS)assert.equal(storage.getItem(key),null,`${key} zostal v prehliadači`);
  assert.equal(api.isLoggedIn(),false,'zákazník je odhlásený');
});

test('odhlásenie zruší serverovú reláciu tokenom zákazníka',async()=>{
  const calls=[];
  globalThis.fetch=async(url,init={})=>{calls.push({url:String(url),method:init.method||'GET',auth:init.headers?.authorization||''});return respond(204,{});};
  await createHttpApi(seeded(),config).signOut();
  assert.deepEqual(calls.map(call=>`${call.method} ${call.url.replace('https://api.test','')}`),['POST /store/nexus-auth/logout']);
  assert.equal(calls[0].auth,'Bearer jwt','relácia sa zruší tokenom zákazníka');
});

test('chyba servera odhlásenie neblokuje: lokálne údaje zmiznú vždy',async()=>{
  globalThis.fetch=async()=>{throw new Error('offline');};
  const storage=seeded();
  const result=await createHttpApi(storage,config).signOut();
  assert.equal(result.ok,true);
  assert.equal(storage.getItem('anastasia.jwt'),null,'token zmizne aj pri chybe servera');
  assert.equal(storage.getItem('anastasia.cart'),null,'košík zmizne aj pri chybe servera');
});

test('po odhlásení je košík prázdny a účet sa nedá otvoriť',async()=>{
  globalThis.fetch=async()=>respond(200,{cart:{id:'cart_1',items:[{id:'li_1',product_title:'Gél',quantity:2}],total:10}});
  const storage=seeded();
  const api=createHttpApi(storage,config);
  assert.equal((await api.getCart()).lines.length,1);
  await api.signOut();
  assert.deepEqual((await api.getCart()).lines,[],'košík je po odhlásení prázdny');
  assert.equal(api.isLoggedIn(),false);
});

test('mock adaptér: odhlásenie vymaže košík aj údaje zákazníka',()=>{
  const storage=memoryStorage({'anastasia.jwt':'jwt','anastasia.cart':'cart_1'});
  const api=createMockApi(storage);
  api.addToCart('bio-sprchovy-gel');
  assert.equal(api.getCart().lines.length,1);
  const result=api.signOut();
  assert.equal(result.ok,true);
  assert.equal(api.getCart().lines.length,0,'košík je prázdny');
  assert.equal(api.isLoggedIn(),false,'účet je odhlásený');
  assert.equal(storage.getItem('anastasia.jwt'),null);
  assert.equal(storage.getItem('anastasia.cart'),null);
});

test('asynchrónne rozhranie api odhlásenie podporuje',async()=>{
  const api=createApi(undefined,createMockApi());
  assert.equal(typeof api.signOut,'function');
  await api.signOut();
  assert.equal(await api.isLoggedIn(),false);
});

test('stráž účtu beží v hlave stránky účtu a presmeruje bez tokenu',async()=>{
  const script=accountGuardBoot(JWT_KEY);
  assert.match(script,new RegExp(`sessionStorage\\.getItem\\("${JWT_KEY}"\\)`),'stráž hľadá token zákazníka');
  assert.match(script,/location\.replace\(.*'\/prihlasenie'\)/);
  assert.match(script,/'\/prihlasenie\?mode=register'/,'registrácia z účtu otvorí formulár registrácie');
  const account=await readFile(new URL('../dist/ucet/index.html',import.meta.url),'utf8');
  assert.match(account,/<script src="\/account-guard\.js"><\/script>/,'účet má v hlave stráž účtu');
  const login=await readFile(new URL('../dist/prihlasenie/index.html',import.meta.url),'utf8');
  assert.ok(!login.includes('account-guard.js'),'prihlásenie stráž účtu nepotrebuje');
});

// Mobil (max-width:999.98px): v bočnom paneli sa skrývajú odkazy, ale odhlásenie musí zostať viditeľné.
const mediaBlocks=(css,query)=>{const out=[];const re=new RegExp('@media\\('+query+'\\)\\{','g');let match;while((match=re.exec(css))){let i=match.index+match[0].length,depth=1;while(i<css.length&&depth){if(css[i]==='{')depth++;else if(css[i]==='}')depth--;i++;}out.push(css.slice(match.index,i));}return out;};

test('odhlásenie je v HTML účtu raz a CSS ho na mobile neskrýva',async()=>{
  const html=await readFile(new URL('../dist/ucet/index.html',import.meta.url),'utf8');
  assert.equal((html.match(/data-sign-out/g)||[]).length,1,'v HTML účtu je práve jeden odkaz na odhlásenie');
  assert.equal((html.match(/<a [^>]*data-sign-out/g)||[]).length,1,'odhlásenie je jeden odkaz, nie zdvojené tlačidlo');
  for(const file of ['../public/styles.css','../dist/styles.css']){
    const css=await readFile(new URL(file,import.meta.url),'utf8');
    const mobile=mediaBlocks(css,'max-width:999\\.98px');
    assert.ok(mobile.length>0,file+': mobilné pravidlá existujú');
    assert.equal(mobile.filter(block=>/\.center-sidebar>a\{display:none\}/.test(block)).length,0,file+': CSS neskrýva všetky odkazy bočného panelu na mobile');
    assert.equal(mobile.filter(block=>/\.center-sidebar>a\[data-sign-out\]\{[^}]*display:(?!none)/.test(block)).length,1,file+': odhlásenie sa na mobile zobrazuje');
    assert.equal(mobile.filter(block=>/\.center-sidebar>a:not\(\[data-sign-out\]\)\{display:none\}/.test(block)).length,1,file+': odkaz „Potrebujete pomoc?“ zostáva na mobile skrytý');
  }
});

test('účet má jediné tlačidlo na odhlásenie a je previazané na signOut',async()=>{
  const html=customerCenter('<form id="chat-form"></form>');
  assert.equal((html.match(/data-sign-out/g)||[]).length,1,'jedno tlačidlo na odhlásenie, žiadne zdvojené');
  assert.equal((html.match(/Odhlásiť sa/g)||[]).length,1);
  assert.match(html,/data-sign-out[^>]*>Odhlásiť sa/);
  const app=await readFile(new URL('../public/app.mjs',import.meta.url),'utf8');
  assert.match(app,/\[data-sign-out\]/,'odhlásenie je previazané v aplikácii');
  assert.match(app,/api\.signOut\(\)/);
  assert.match(app,/location\.assign\('\/prihlasenie'\)/,'po odhlásení sa ide na prihlásenie');
  assert.match(app,/location\.replace\('\/prihlasenie'\)/,'stráž účtu presmeruje na prihlásenie');
});
