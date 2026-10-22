import test from 'node:test';
import assert from 'node:assert/strict';
import {createHttpApi, decodeJwtPayload, tokenHasActor} from '../src/lib/api/http.mjs';

// Prihlásenie po registrácii: token musí byť viazaný na zákazníka (actor_id).
// Bez actor_id je token na chránené volania nepoužiteľný (401) – klient ho nesmie uložiť.
const memoryStorage=(seed={})=>{const m=new Map(Object.entries(seed));return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};};
const config={apiBaseUrl:'https://api.test',publishableKey:'pk_test_synthetic',regionId:'reg_1'};
const respond=(status,data)=>({status,ok:status>=200&&status<300,json:async()=>data});

const b64url=obj=>Buffer.from(JSON.stringify(obj)).toString('base64url');
// Podpis sa v klienti nekontroluje (overil ho server) – rozhoduje len payload.
const jwt=payload=>`${b64url({alg:'HS256',typ:'JWT'})}.${b64url(payload)}.sig`;
const ACTOR=jwt({actor_id:'cus_1',actor_type:'customer',auth_identity_id:'au_1'});
const NO_ACTOR=jwt({actor_id:'',actor_type:'customer',auth_identity_id:'au_1'});
const EMAIL='zakaznik@example.test';

function router(routes){
  const log=[];
  globalThis.fetch=async(url,init={})=>{
    const path=url.replace('https://api.test',''),method=init.method||'GET';
    const auth=(init.headers?.authorization||'').replace(/^Bearer /,'');
    log.push({call:`${method} ${path}`,method,path,auth});
    for(const [m,re,fn] of routes)if(m===method&&re.test(path))return fn(path,init.body?JSON.parse(init.body):undefined,auth,log);
    return respond(404,{});
  };
  return log;
}
const withLink=()=>{globalThis.location={search:`?email=${encodeURIComponent(EMAIL)}&token=odkaz`};};

test('dekodér JWT prečíta payload (base64url) bez overenia podpisu',()=>{
  const payload=decodeJwtPayload(ACTOR);
  assert.equal(payload.actor_id,'cus_1');
  assert.equal(payload.actor_type,'customer');
  assert.equal(decodeJwtPayload('nezmysel'),null);
  assert.equal(decodeJwtPayload(''),null);
  assert.equal(decodeJwtPayload(null),null);
  // Prázdny actor_id (token identity pri registrácii) nie je viazaný zákazník.
  assert.equal(tokenHasActor(ACTOR),true);
  assert.equal(tokenHasActor(NO_ACTOR),false);
  assert.equal(tokenHasActor(''),false);
});

test('registrácia: odkaz → založenie zákazníka → nový login token s actor_id',async()=>{
  withLink();
  let storedDuringCreate=null;
  const storage=memoryStorage();
  const log=router([
    ['POST',/^\/auth\/customer\/magic-link$/,()=>respond(200,{token:NO_ACTOR})],
    ['GET',/^\/store\/customers\/me$/,()=>respond(401,{})],
    ['POST',/^\/store\/customers$/,()=>{storedDuringCreate=storage.getItem('anastasia.jwt');return respond(200,{customer:{id:'cus_1'}});}],
    ['POST',/^\/auth\/token\/refresh$/,()=>respond(200,{token:ACTOR})],
  ]);
  const api=createHttpApi(storage,config);
  const r=await api.confirmMagicLink();
  assert.equal(r.ok,true);
  // Správne poradie: register → POST /store/customers → nový login token.
  assert.deepEqual(log.map(l=>l.call),[
    'POST /auth/customer/magic-link',
    'GET /store/customers/me',
    'POST /store/customers',
    'POST /auth/token/refresh',
  ]);
  // Založenie zákazníka ide s registračným tokenom, ktorý sa nikdy neukladá.
  assert.equal(log.find(l=>l.call==='POST /store/customers').auth,NO_ACTOR);
  assert.equal(storedDuringCreate,null,'registračný token sa neukladá ako prihlásenie');
  // Uložený je až nový login token s actor_id.
  assert.equal(storage.getItem('anastasia.jwt'),ACTOR);
  assert.equal(api.isLoggedIn(),true);
});

test('token bez actor_id: login sa zopakuje (max 2×) a použije sa viazaný token',async()=>{
  withLink();
  let refresh=0;
  const storage=memoryStorage();
  const log=router([
    ['POST',/^\/auth\/customer\/magic-link$/,()=>respond(200,{token:NO_ACTOR})],
    ['GET',/^\/store\/customers\/me$/,()=>respond(401,{})],
    ['POST',/^\/store\/customers$/,()=>respond(200,{customer:{id:'cus_1'}})],
    ['POST',/^\/auth\/token\/refresh$/,()=>{refresh++;return respond(200,{token:refresh<3?NO_ACTOR:ACTOR});}],
  ]);
  const api=createHttpApi(storage,config);
  const started=Date.now();
  const r=await api.confirmMagicLink();
  assert.equal(r.ok,true);
  assert.equal(refresh,3,'prvý pokus + 2 opakovania');
  assert.ok(Date.now()-started>=1100,'medzi pokusmi je pauza 300 ms a 800 ms');
  assert.equal(storage.getItem('anastasia.jwt'),ACTOR);
  // Zákazník sa nezakladá znova, opakuje sa len získanie tokenu.
  assert.equal(log.filter(l=>l.call==='POST /store/customers').length,1);
});

test('po 3 neúspešných pokusoch: zrozumiteľná hláška a žiadny uložený token',async()=>{
  withLink();
  let refresh=0;
  const storage=memoryStorage();
  router([
    ['POST',/^\/auth\/customer\/magic-link$/,()=>respond(200,{token:NO_ACTOR})],
    ['GET',/^\/store\/customers\/me$/,()=>respond(401,{})],
    ['POST',/^\/store\/customers$/,()=>respond(200,{customer:{id:'cus_1'}})],
    ['POST',/^\/auth\/token\/refresh$/,()=>{refresh++;return respond(200,{token:NO_ACTOR});}],
  ]);
  const api=createHttpApi(storage,config);
  const r=await api.confirmMagicLink();
  assert.equal(r.ok,false);
  assert.equal(r.message,'Registrácia prebehla, prihláste sa prosím.');
  assert.equal(refresh,3);
  assert.equal(storage.getItem('anastasia.jwt'),null,'token bez actor_id sa neuloží');
  assert.equal(api.isLoggedIn(),false);
});

test('bežné prihlásenie: token bez actor_id sa nedostane do úložiska',async()=>{
  withLink();
  let refresh=0;
  const storage=memoryStorage();
  const log=router([
    ['POST',/^\/auth\/customer\/magic-link$/,()=>respond(200,{token:NO_ACTOR})],
    ['GET',/^\/store\/customers\/me$/,()=>respond(200,{customer:{id:'cus_1'}})],
    ['POST',/^\/auth\/token\/refresh$/,()=>{refresh++;return respond(200,{token:refresh<2?NO_ACTOR:ACTOR});}],
  ]);
  const api=createHttpApi(storage,config);
  const r=await api.confirmMagicLink();
  assert.equal(r.ok,true);
  assert.equal(refresh,2);
  assert.equal(storage.getItem('anastasia.jwt'),ACTOR);
  // Existujúci zákazník sa nezakladá nanovo.
  assert.ok(!log.some(l=>l.call==='POST /store/customers'));
});

test('bežné prihlásenie: po 3 neúspešných pokusoch hláška a žiadny token',async()=>{
  withLink();
  let refresh=0;
  const storage=memoryStorage();
  router([
    ['POST',/^\/auth\/customer\/magic-link$/,()=>respond(200,{token:NO_ACTOR})],
    ['GET',/^\/store\/customers\/me$/,()=>respond(200,{customer:{id:'cus_1'}})],
    ['POST',/^\/auth\/token\/refresh$/,()=>{refresh++;return respond(200,{token:NO_ACTOR});}],
  ]);
  const api=createHttpApi(storage,config);
  const r=await api.confirmMagicLink();
  assert.equal(r.ok,false);
  assert.match(r.message,/naviazaný/);
  assert.equal(refresh,3);
  assert.equal(storage.getItem('anastasia.jwt'),null);
  assert.equal(api.isLoggedIn(),false);
});

test('bežné prihlásenie s viazaným tokenom: žiadny dodatočný login',async()=>{
  withLink();
  const storage=memoryStorage();
  const log=router([
    ['POST',/^\/auth\/customer\/magic-link$/,()=>respond(200,{token:ACTOR})],
    ['GET',/^\/store\/customers\/me$/,()=>respond(200,{customer:{id:'cus_1'}})],
  ]);
  const api=createHttpApi(storage,config);
  const r=await api.confirmMagicLink();
  assert.equal(r.ok,true);
  assert.equal(storage.getItem('anastasia.jwt'),ACTOR);
  assert.ok(!log.some(l=>l.call==='POST /auth/token/refresh'),'viazaný token sa nekúpi znova');
});

test('výpadok siete pri opakovaní nepretrží prihlásenie',async()=>{
  withLink();
  let refresh=0;
  const storage=memoryStorage();
  router([
    ['POST',/^\/auth\/customer\/magic-link$/,()=>respond(200,{token:NO_ACTOR})],
    ['GET',/^\/store\/customers\/me$/,()=>respond(200,{customer:{id:'cus_1'}})],
    ['POST',/^\/auth\/token\/refresh$/,()=>{refresh++;if(refresh===1)throw new Error('sieť padla');return respond(200,{token:ACTOR});}],
  ]);
  const api=createHttpApi(storage,config);
  const r=await api.confirmMagicLink();
  assert.equal(r.ok,true);
  assert.equal(refresh,2);
  assert.equal(storage.getItem('anastasia.jwt'),ACTOR);
});
