// Pokladňa: predvolená platba, stav tlačidla „Pokračovať“ a načítanie obsahu
// stránky bez zbytočnej 404 požiadavky.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {availablePaymentMethods,defaultPaymentMethod,nextButtonState,CHECKOUT_LOADING_CART,CHECKOUT_LOADING_OPTIONS} from '../public/checkout-ui.mjs';
import {contentPageKeys} from '../public/content.mjs';

const dist=new URL('../dist/',import.meta.url);
const read=async page=>readFile(new URL(page,dist),'utf8');
// Možnosti platby zo servera (poradie ako v praxi: dobierka môže prísť prvá).
const serverOptions=[
  {code:'cod',label:'Na dobierku',available:true,feeLabel:'2,00 €'},
  {code:'card',label:'Kartou online',available:true,feeLabel:'Zadarmo'},
  {code:'bank_transfer',label:'Prevodom na účet',available:true,feeLabel:'Zadarmo'},
];
const keysOf=html=>[...html.matchAll(/data-content="([^"]+)"/g)].map(m=>m[1]);
const rootWith=keys=>({querySelectorAll:()=>keys.map(content=>({dataset:{content}}))});

test('predvolená platba v pokladni je „Kartou online“, ak je dostupná',()=>{
  const list=availablePaymentMethods(serverOptions);
  assert.equal(list[0].code,'card','karta je prvá');
  assert.equal(defaultPaymentMethod(serverOptions),'card','predvolená platba je karta');
  assert.equal(defaultPaymentMethod(list),'card','predvolená platba je karta aj po zoradení');
});

test('poradie ostatných spôsobov platby ostáva také, ako ho poslal server',()=>{
  const list=availablePaymentMethods(serverOptions);
  assert.deepEqual(list.map(p=>p.code),['card','cod','bank_transfer']);
  assert.deepEqual(list.slice(1).map(p=>p.code),serverOptions.filter(p=>p.code!=='card').map(p=>p.code));
});

test('nedostupné spôsoby platby sa nezobrazia a bez karty ostane prvé dostupné',()=>{
  const list=availablePaymentMethods([
    {code:'cod',label:'Na dobierku',available:false},
    {code:'bank_transfer',label:'Prevodom na účet',available:true},
  ]);
  assert.deepEqual(list.map(p=>p.code),['bank_transfer']);
  assert.equal(defaultPaymentMethod([{code:'cod',label:'Na dobierku',available:false}]),null);
  assert.equal(defaultPaymentMethod([]),null);
});

test('tlačidlo „Pokračovať“ je neaktívne, kým sa nenačíta košík',()=>{
  const state=nextButtonState({cartReady:false,optionsReady:false});
  assert.equal(state.disabled,true);
  assert.equal(state.loading,CHECKOUT_LOADING_CART);
  assert.match(state.loading,/Načítavam košík/);
});

test('tlačidlo „Pokračovať“ je neaktívne, kým sa nenačítajú možnosti platby',()=>{
  const state=nextButtonState({cartReady:true,optionsReady:false});
  assert.equal(state.disabled,true);
  assert.equal(state.loading,CHECKOUT_LOADING_OPTIONS);
  assert.match(state.loading,/Načítavam dopravu a platbu/);
});

test('po načítaní košíka a možností je tlačidlo „Pokračovať“ aktívne',()=>{
  const state=nextButtonState({cartReady:true,optionsReady:true});
  assert.equal(state.disabled,false);
  assert.equal(state.loading,'');
});

test('stránka pokladne má tlačidlá „Pokračovať“ neaktívne a viditeľný stav načítania',async()=>{
  const html=await read('pokladna/index.html');
  const first=html.match(/<button[^>]*data-next="2"[^>]*>/);
  const second=html.match(/<button[^>]*data-next="3"[^>]*>/);
  assert.ok(first,'tlačidlo „Pokračovať na doručenie“ existuje');
  assert.ok(second,'tlačidlo „Pokračovať na platbu“ existuje');
  assert.match(first[0],/disabled/,'tlačidlo je v HTML neaktívne');
  assert.match(second[0],/disabled/,'tlačidlo je v HTML neaktívne');
  assert.match(html,/<p class="form-status" id="checkout-loading" role="status">Načítavam košík…<\/p>/,'viditeľný stav načítania');
});

test('runtime pokladne používa poradie platieb a stav tlačidiel z checkout-ui',async()=>{
  const app=await read('app.mjs');
  assert.match(app,/availablePaymentMethods/,'poradie platieb sa berie z checkout-ui');
  assert.match(app,/defaultPaymentMethod/,'predvolená platba sa berie z checkout-ui');
  assert.match(app,/nextButtonState/,'stav tlačidla „Pokračovať“ sa berie z checkout-ui');
  assert.match(app,/options\.payment/,'možnosti platby stále pochádzajú zo servera');
});

test('pokladňa si nežiada obsah stránky, ktorý nemá – žiadny 404 v konzole',async()=>{
  const html=await read('pokladna/index.html');
  // Hlavička a menu už nemajú texty z administrácie, pokladňa sa teda na obsah nepýta vôbec.
  assert.deepEqual(contentPageKeys(rootWith(keysOf(html))),[],'pokladňa nemá vlastný obsah – server sa neopýta');
  const app=await read('app.mjs');
  assert.match(app,/contentPageKeys\(document\)/,'runtime načíta len stránky, ktoré sa používajú');
  assert.doesNotMatch(app,/pageKeyOf\(location\.pathname\)/,'runtime už neháda stránku z adresy');
});

test('stránka s vlastným obsahom si ho z administrácie načíta',async()=>{
  const html=await read('eshop/index.html');
  assert.deepEqual([...contentPageKeys(rootWith(keysOf(html)))].sort(),['eshop']);
});
