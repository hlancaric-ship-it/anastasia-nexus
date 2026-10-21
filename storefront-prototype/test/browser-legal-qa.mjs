// QA: cookie lišta + online formulár na odstúpenie od zmluvy proti lokálnemu backendu.
//
// Beží na lokálnom náhľade storefrontu (dist/) + lokálny backend (Medusa, port 9000).
// Screenshoty ukladá do anastasia-admin/qa-deploy/ (390 px a 1440 px).
// Reálny Stripe sa netýka, platby ani e-maily sa neposielajú – len overenie UI a API.
//
// Spustenie:
//   cd storefront-prototype
//   ANASTASIA_API_ORIGIN=http://localhost:9000 node serve.mjs 4187 &
//   node test/browser-legal-qa.mjs
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||pathToFileURL('/Users/lucky/hra-studio54/node_modules/playwright/index.mjs').href);

const SITE=process.env.QA_SITE_ORIGIN||'http://localhost:4187';
const OUT=process.env.QA_OUT_DIR||new URL('../../anastasia-admin/qa-deploy/',import.meta.url).pathname;
const API=process.env.ANASTASIA_API_ORIGIN||'http://localhost:9000';
const MOBILE={width:390,height:844};
const DESKTOP={width:1440,height:1000};

const checks=[];
const check=(name,fn)=>checks.push({name,fn});
const consoleErrors=[];

await mkdir(OUT,{recursive:true});
const launchBrowser=async()=>{try{return await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});}catch{return await chromium.launch({headless:true});}};
const browser=await launchBrowser();

try{
  const context=await browser.newContext({viewport:DESKTOP,locale:'sk-SK'});
  const page=await context.newPage();
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
  page.on('pageerror',e=>consoleErrors.push(String(e)));

  const goto=async path=>{await page.goto(SITE+path,{waitUntil:'domcontentloaded'});await page.waitForTimeout(250);};
  const fresh=async path=>{await goto(path);await page.evaluate(()=>{try{localStorage.clear();}catch{}});await page.reload({waitUntil:'domcontentloaded'});await page.waitForTimeout(250);};

  // --- 1. Cookie lišta: tri tlačidlá, uloženie voľby, panel nastavení, odkaz v pätičke ---
  await check('cookie lišta je na prvej návšteve viditeľná a má tri tlačidlá',async()=>{
    await fresh('/');
    const banner=page.locator('#cookie-banner');
    await banner.waitFor({state:'visible',timeout:5000});
    assert.equal(await banner.getAttribute('hidden'),null);
    const labels=await page.locator('#cookie-banner .cookie-btn').allTextContents();
    assert.deepEqual(labels.map(l=>l.trim()),['Odmietnuť voliteľné','Nastaviť','Prijať všetky']);
    const text=await page.locator('#cookie-banner .cookie-banner-text').textContent();
    assert.match(text,/Nevyhnutné cookies používame na fungovanie webu/);
  });

  await check('„Odmietnuť voliteľné“ schová lištu a voľba pretrvá po obnovení',async()=>{
    await page.getByRole('button',{name:'Odmietnuť voliteľné'}).click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator('#cookie-banner').getAttribute('hidden'),'');
    const stored=await page.evaluate(()=>localStorage.getItem('anastasia.consent')||localStorage.getItem('anastasia.cookie-consent'));
    assert.ok(stored,'voľba musí byť uložená v localStorage');
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForTimeout(250);
    assert.equal(await page.locator('#cookie-banner').getAttribute('hidden'),'');
  });

  await check('„Nastaviť“ otvorí panel s vypnutými voliteľnými kategóriami',async()=>{
    await fresh('/');
    await page.getByRole('button',{name:'Nastaviť'}).click();
    await page.waitForTimeout(200);
    const panel=page.locator('#cookie-settings');
    assert.equal(await panel.getAttribute('hidden'),null);
    assert.equal(await page.locator('[data-consent-category="necessary"]').isChecked(),true);
    assert.equal(await page.locator('[data-consent-category="necessary"]').isDisabled(),true);
    assert.equal(await page.locator('[data-consent-category="analytics"]').isChecked(),false);
    assert.equal(await page.locator('[data-consent-category="marketing"]').isChecked(),false);
  });

  await check('odkaz „Nastavenia cookies“ v pätičke otvorí ten istý panel',async()=>{
    await fresh('/');
    // Lišta je fixne dole a prekrýva pätičku – najprv sa rozhodne, potom sa klikne na odkaz.
    await page.getByRole('button',{name:'Odmietnuť voliteľné'}).click();
    await page.waitForTimeout(200);
    await page.locator('footer [data-cookie-settings]').first().scrollIntoViewIfNeeded();
    await page.locator('footer [data-cookie-settings]').first().click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator('#cookie-settings').getAttribute('hidden'),null);
  });

  await check('„Prijať všetky“ uloží súhlas a schová lištu',async()=>{
    await fresh('/');
    await page.getByRole('button',{name:'Prijať všetky'}).click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator('#cookie-banner').getAttribute('hidden'),'');
    const stored=await page.evaluate(()=>localStorage.getItem('anastasia.consent')||localStorage.getItem('anastasia.cookie-consent'));
    assert.ok(stored&&/analytics/.test(stored),'súhlas musí obsahovať voľbu kategórií');
  });

  // --- 2. Screenshoty: cookie lišta a formulár na odstúpenie ---
  await check('screenshoty: cookie lišta a formulár na odstúpenie (390 px a 1440 px)',async()=>{
    const shots=[];
    for(const [label,viewport] of [['390',MOBILE],['1440',DESKTOP]]){
      await page.setViewportSize(viewport);
      await fresh('/');
      shots.push(`${OUT}cookies-lista-${label}.png`);
      await page.screenshot({path:`${OUT}cookies-lista-${label}.png`});
      await fresh('/odstupenie/');
      const form=page.locator('#withdrawal-form');
      await form.waitFor({state:'visible',timeout:5000});
      shots.push(`${OUT}odstupenie-formular-${label}.png`);
      await form.screenshot({path:`${OUT}odstupenie-formular-${label}.png`});
      shots.push(`${OUT}odstupenie-stranka-${label}.png`);
      await page.screenshot({path:`${OUT}odstupenie-stranka-${label}.png`});
    }
    for(const file of shots)assert.ok(existsSync(file),'chýba screenshot '+file);
  });

  // --- 3. Formulár na odstúpenie: odoslanie proti lokálnemu backendu ---
  await check('formulár na odstúpenie odošle oznámenie a potvrdí prijatie',async()=>{
    await page.setViewportSize(DESKTOP);
    await fresh('/odstupenie/');
    const form=page.locator('#withdrawal-form');
    await form.locator('[name=order_number]').fill('QA-2026-0001');
    await form.locator('[name=order_date]').fill('2026-10-12');
    await form.locator('[name=items]').fill('RESET 40+ – 1 ks');
    await form.locator('[name=email]').fill('tester@l-code-dynamics.com');
    await form.locator('[name=name]').fill('QA Testovací');
    await form.locator('[name=reason]').fill('Automatizovaná QA kontrola');
    await form.locator('[name=consent]').check();
    await form.getByRole('button',{name:'Potvrdiť odstúpenie od zmluvy'}).click();
    await page.waitForTimeout(1500);
    const status=form.locator('.form-status');
    assert.match(await status.textContent(),/odstúpenie od zmluvy sme prijali/i);
    assert.equal(await status.getAttribute('data-state'),'OK');
    await page.screenshot({path:`${OUT}odstupenie-odoslane-1440.png`});
  });

  await check('záznam odstúpenia je v backende a má stav received',async()=>{
    // Opakované oznámenie s rovnakými údajmi musí vrátiť 200 + replayed (idempotencia, žiadny druhý záznam).
    const config=await readFile(new URL('../dist/config.mjs',import.meta.url),'utf8');
    const publishableKey=process.env.QA_PUBLISHABLE_KEY||config.match(/publishableKey:\s*w\.publishableKey\s*\|\|\s*"([^"]+)"/)?.[1];
    assert.ok(publishableKey,'nepodarilo sa prečítať publishable key z dist/config.mjs');
    const again=await fetch(`${API}/store/contract-withdrawal`,{
      method:'POST',
      headers:{'Content-Type':'application/json','x-publishable-api-key':publishableKey},
      body:JSON.stringify({order_number:'QA-2026-0001',email:'tester@l-code-dynamics.com',items:'RESET 40+ – 1 ks',order_date:'2026-10-12',name:'QA Testovací',reason:'Automatizovaná QA kontrola',consent:true,website:''}),
    });
    assert.equal(again.status,200,'opakované oznámenie musí vrátiť 200 (idempotencia)');
    const body=await again.json();
    assert.equal(body.ok,true);
    assert.equal(body.replayed,true,'rovnaké oznámenie sa nesmie zapísať dvakrát');
    assert.equal(body.withdrawal.status,'received');
  });

  await check('bez chýb v konzole prehliadača',async()=>{
    const relevant=consoleErrors.filter(e=>!/favicon|sourcemap/i.test(e));
    assert.deepEqual(relevant,[],'konzola: '+relevant.join(' | '));
  });

  // --- Spustenie kontrol (prehliadač musí byť ešte otvorený) ---
  let failed=0;
  for(const {name,fn} of checks){
    try{await fn();console.log('OK   '+name);}
    catch(e){failed++;console.log('FAIL '+name+'\n     '+String(e.message||e).split('\n')[0]);}
  }
  console.log('\n'+(failed?'FAIL '+failed+'/'+checks.length:'PASS '+checks.length+'/'+checks.length));
  console.log('Screenshoty: '+OUT);
  process.exitCode=failed?1:0;
} finally {
  await browser.close();
}
