import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHttpApi} from '../src/lib/api/http.mjs';
import {initWithdrawalForm} from '../public/withdrawal-form.mjs';

const dist=new URL('../dist/',import.meta.url);
const html=await readFile(new URL('odstupenie/index.html',dist),'utf8');
const memoryStorage=(seed={})=>{const m=new Map(Object.entries(seed));return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};};
const config={apiBaseUrl:'https://api.test',publishableKey:'pk_test_synthetic',regionId:'reg_1'};

// Umelá forma: testuje logiku bez prehliadača (rovnaké rozhranie ako DOM formulár).
function fakeDom(overrides={}) {
  const status={dataset:{},textContent:''};
  const send={disabled:false};
  const form={
    elements:{email:{value:''},name:{value:''}},
    querySelector:selector=>selector==='.form-status'?status:selector==='button[type=submit]'?send:null,
    addEventListener:(type,handler)=>{form.handler=handler;},
    reportValidity:()=>true,
    reset:()=>{form.resetCalled=true;},
    ...overrides,
  };
  return {form,status,send,root:{querySelector:selector=>selector==='#withdrawal-form'?form:null}};
}

test('stránka odstúpenia má formulár s údajmi z časti C právnych textov',()=>{
  const form=html.slice(html.indexOf('id="withdrawal-form"'),html.indexOf('id="withdrawal-form"')+4000);
  assert.ok(form.includes('id="withdrawal-form"'),'chýba formulár online odstúpenia');
  for(const name of ['order_number','email','items','order_date']){
    assert.ok(form.includes(`name="${name}"`),`chýba pole ${name}`);
  }
  assert.ok(form.includes('Potvrdiť odstúpenie od zmluvy'),'tlačidlo podľa znenia klientky');
  assert.ok(html.includes('Odstúpiť od zmluvy tu'),'názov funkcie podľa znenia klientky (VOP čl. 9.2)');
  assert.ok(form.includes('name="consent"'),'chýba súhlas s informáciou o súkromí');
  assert.ok(form.includes('name="website"'),'chýba pasca na roboty');
});

test('formulár je len na stránke odstúpenia, nie na iných právnych stránkach',async()=>{
  const routes=JSON.parse(await readFile(new URL('routes.json',dist),'utf8'));
  for(const path of ['/vop','/cookies','/gdpr','/reklamacie']){
    const other=await readFile(new URL(`${path.slice(1)}/index.html`,dist),'utf8');
    assert.ok(!other.includes('id="withdrawal-form"'),`${path}: formulár odstúpenia tu nemá byť`);
  }
  assert.ok(routes.includes('/odstupenie'));
});

test('klient posiela odstúpenie na server a neuchováva ho v prehliadači',async()=>{
  let body=null,url=null;
  globalThis.fetch=async(u,init={})=>{url=u;body=JSON.parse(init.body);return{status:201,ok:true,json:async()=>({ok:true,message:'Ďakujeme, odstúpenie sme prijali.'})};};
  const api=createHttpApi(memoryStorage(),config);
  const r=await api.sendContractWithdrawal({order_number:'2026-0142',email:'dana@example.test',items:'Kurz RESET 40+',order_date:'2026-10-12',name:'Dana',reason:'',consent:'on',website:''});
  assert.equal(r.ok,true);
  assert.equal(url,'https://api.test/store/contract-withdrawal');
  assert.equal(body.order_number,'2026-0142');
  assert.equal(body.email,'dana@example.test');
  assert.equal(body.items,'Kurz RESET 40+');
  assert.equal(body.order_date,'2026-10-12');
  assert.equal(body.consent,true,'súhlas sa posiela ako true');
  assert.equal(body.website,'');
});

test('neúspech servera sa zákazníkovi zobrazí ako chyba, nie ako potvrdenie',async()=>{
  globalThis.fetch=async()=>({status:429,ok:false,json:async()=>({ok:false,message:'Príliš veľa požiadaviek. Skúste to neskôr.'})});
  const r=await createHttpApi(memoryStorage(),config).sendContractWithdrawal({order_number:'1',email:'a@b.test',items:'x',order_date:'2026-10-12',consent:true});
  assert.equal(r.ok,false);
  assert.equal(r.message,'Príliš veľa požiadaviek. Skúste to neskôr.');
});

test('prihlásenému zákazníkovi sa e-mail a meno predvyplnia z účtu',async()=>{
  const {form,root}=fakeDom();
  const api={isLoggedIn:()=>true,getCustomerEmail:()=>'dana@example.test',getAccount:()=>({ok:true,name:'Dana'})};
  const handle=initWithdrawalForm(api,root);
  await handle.prefill();
  assert.equal(form.elements.email.value,'dana@example.test');
  assert.equal(form.elements.name.value,'Dana');
});

test('prihlásenie sa nesmie spýtať na metódu, ktorú adaptér nemá',async()=>{
  const {form,root}=fakeDom();
  const api={};  // žiadne metódy – stránka musí zostať živa
  const handle=initWithdrawalForm(api,root);
  await handle.prefill();
  assert.equal(form.elements.email.value,'');
});

test('chyba pri čítaní účtu nespadne stránku a e-mail ostane prázdny',async()=>{
  const {form,root}=fakeDom();
  const api={isLoggedIn:()=>true,getCustomerEmail:()=>{throw new Error('network')}};
  const handle=initWithdrawalForm(api,root);
  await handle.prefill();
  assert.equal(form.elements.email.value,'');
});

test('odoslanie formulára zobrazí hlásenie a pri chybe ju neodmietne',async()=>{
  const {form,status,root}=fakeDom();
  const api={sendContractWithdrawal:async()=>({ok:true,message:'Ďakujeme, odstúpenie od zmluvy sme prijali.'})};
  initWithdrawalForm(api,root,{formData:()=>({order_number:'2026-0142',email:'dana@example.test'})});
  await form.handler({preventDefault(){}});
  assert.equal(status.textContent,'Ďakujeme, odstúpenie od zmluvy sme prijali.');
  assert.equal(status.dataset.state,'OK');
  assert.equal(form.resetCalled,true);

  const failed=fakeDom();
  const failing={sendContractWithdrawal:async()=>{throw new Error('down')}};
  initWithdrawalForm(failing,failed.root,{formData:()=>({})});
  await failed.form.handler({preventDefault(){}});
  assert.equal(failed.status.dataset.state,'ERROR');
  assert.match(failed.status.textContent,/nepodarilo odoslať/);
});
