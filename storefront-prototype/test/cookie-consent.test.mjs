import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import content from '../src/legacy-content.json' with {type:'json'};

const dist=new URL('../dist/',import.meta.url);
const routes=JSON.parse(await readFile(new URL('routes.json',dist),'utf8'));
const htmlFor=path=>readFile(new URL((path==='/'?'':path.slice(1)+'/')+'index.html',dist),'utf8');
const cookieBlocks=content['/cookies'].blocks;
const paragraph=prefix=>cookieBlocks.find(b=>b.type==='p'&&b.text.startsWith(prefix))?.text??'';

// Texty lišty musia byť 1:1 z časti E právnych textov klientky – nič sa nevymýšľa.
const bannerText=paragraph('„Nevyhnutné cookies');
const buttonLine=paragraph('Tlačidlá:');
const buttonLabels=[...buttonLine.matchAll(/„([^“]+)“/g)].map(m=>m[1]);

test('každá stránka má lištu cookies s textom klientky a tromi tlačidlami',async()=>{
  assert.ok(buttonLabels.length===3,'dokument klientky musí obsahovať tri tlačidlá');
  for(const path of routes){
    const html=await htmlFor(path);
    assert.ok(html.includes('id="cookie-banner"'),`${path}: chýba lišta cookies`);
    assert.ok(html.includes('id="cookie-settings"'),`${path}: chýba panel nastavení`);
    assert.ok(html.includes(bannerText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')),`${path}: text lišty nie je 1:1`);
    for(const label of buttonLabels) assert.ok(html.includes(`>${label}</button>`),`${path}: chýba tlačidlo ${label}`);
  }
});

test('všetky tri tlačidlá majú rovnakú váhu (jedna trieda, žiadne zvýraznenie „prijať“)',async()=>{
  const html=await htmlFor('/');
  const banner=html.slice(html.indexOf('id="cookie-banner"'),html.indexOf('id="cookie-settings"'));
  const buttons=[...banner.matchAll(/<button[^>]*class="([^"]*)"[^>]*data-consent="([^"]+)"[^>]*>([^<]*)<\/button>/g)];
  assert.equal(buttons.length,3,'lišta má tri tlačidlá');
  const classes=new Set(buttons.map(b=>b[1]));
  assert.equal(classes.size,1,'tlačidlá musia mať rovnakú triedu (rovnaká váha)');
  assert.ok(!banner.includes('cookie-btn-primary'),'žiadne tlačidlo nesmie byť zvýraznené');
  assert.deepEqual(buttons.map(b=>b[2]),['none','settings','all']);
});

test('voliteľné kategórie sú vypnuté, kým zákazník nevyberie',async()=>{
  const html=await htmlFor('/');
  const panel=html.slice(html.indexOf('id="cookie-settings"'));
  const boxes=[...panel.matchAll(/<input type="checkbox" data-consent-category="([^"]+)"([^>]*)>/g)];
  const map=Object.fromEntries(boxes.map(b=>[b[1],b[2]]));
  assert.ok('necessary' in map&&'analytics' in map&&'marketing' in map,'panel má tri kategórie');
  assert.match(map.necessary,/checked/,'nevyhnutné je vždy zapnuté');
  assert.match(map.necessary,/disabled/,'nevyhnutné sa nedá vypnúť');
  assert.doesNotMatch(map.analytics,/checked/,'analytické je vypnuté');
  assert.doesNotMatch(map.marketing,/checked/,'marketingové je vypnuté');
});

test('pätička má odkaz „Nastavenia cookies“ na každej stránke',async()=>{
  for(const path of routes){
    const html=await htmlFor(path);
    const link=html.match(/<a href="\/cookies" data-cookie-settings>([^<]+)<\/a>/);
    assert.ok(link,`${path}: chýba odkaz Nastavenia cookies v pätičke`);
    assert.equal(link[1],'Nastavenia cookies',`${path}: názov odkazu`);
  }
});

test('lišta nezakrýva viac než 40 % displeja na mobilnom zobrazení',async()=>{
  const css=await readFile(new URL('styles.css',dist),'utf8');
  assert.match(css,/\.cookie-banner\{[^}]*max-height:40vh/,'lišta má limit 40 % výšky displeja');
  assert.match(css,/\.cookie-banner\{[^}]*max-height:40svh/,'lišta má limit 40 % aj na mobilnom displeji s adresným riadkom');
  assert.match(css,/\.cookie-banner\{[^}]*overflow-y:auto/,'prípadný prebytok sa listuje vnútri lišty');
});

test('platobná brána je nevyhnutná technológia: načíta sa v pokladni bez rozhodnutia o cookies',async()=>{
  const html=await htmlFor('/');
  const scripts=[...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m=>m[1]);
  const external=scripts.filter(src=>/^https?:/.test(src));
  assert.deepEqual(external,[],`webe sa nesmie načítať skript tretej strony: ${external.join(', ')}`);
  // Stripe (jediný externý skript) sa načíta dynamicky až v pokladni pri výbere platby kartou.
  const app=await readFile(new URL('app.mjs',dist),'utf8');
  assert.match(app,/js\.stripe\.com\/v3/,'Stripe sa načíta z adresy Stripe');
  assert.doesNotMatch(app,/await requireDecision\(\)/,'platba kartou nesmie čakať na rozhodnutie o cookies');
  assert.doesNotMatch(app,/dokončite nastavenia cookies/,'hlásenie o blokácii platby kartou je odstránené');
  // Súhlas s cookies sa nesmie vyžadovať pred platbou ani v pokladni.
  const consent=await readFile(new URL('consent.mjs',dist),'utf8');
  assert.doesNotMatch(consent,/requireDecision[\s\S]{0,120}js\.stripe\.com/,'brána Stripe nie je viazaná na rozhodnutie o cookies');
});

test('uložená voľba sa načíta späť a voliteľné kategórie zostávajú vypnuté',async()=>{
  const source=await readFile(new URL('../public/consent.mjs',import.meta.url),'utf8');
  assert.match(source,/const KEY = 'anastasia\.consent'/,'voľba sa ukladá do localStorage');
  assert.match(source,/analytics: false, marketing: false/,'výchozí stav je vypnutý');
  assert.match(source,/if \(!state\) return false/,'bez rozhodnutia nie je nič povolené');
});
