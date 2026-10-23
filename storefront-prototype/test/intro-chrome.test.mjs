// Regresní test úvodní homepage: skrytá hlavička, nápis ANASTASIA, pozice kategorií.
import test from 'node:test';
import assert from 'node:assert/strict';

const PLAYWRIGHT_MODULE = process.env.PLAYWRIGHT_MODULE;
const base = process.env.STOREFRONT_URL || 'http://127.0.0.1:4173';

let browser;
let context;
let page;

test.before(async () => {
  const playwrightPath = PLAYWRIGHT_MODULE 
    ? PLAYWRIGHT_MODULE 
    : 'file:///Users/lucky/hra-studio54/node_modules/playwright/index.mjs';
  
  const playwright = await import(playwrightPath);
  
  browser = await playwright.chromium.launch({channel: 'chrome', headless: true});
  context = await browser.newContext({viewport: {width: 1440, height: 1000}});
  page = await context.newPage();
});

test.after(async () => {
  if (page) await page.close();
  if (context) await context.close();
  if (browser) await browser.close();
});

test('intro-chrome: skrytá hlavička, nápis ANASTASIA, pozice kategorií', async () => {
  // Otevřeme homepage
  await page.goto(base + '/', {waitUntil: 'load'});
  
  // Čekáme na načtení fontů a animací
  await page.evaluate(() => document.fonts.ready);
  await new Promise(r => setTimeout(r, 1000));
  
  // --- Test 1: .lh-top je skrytá na .lh-intro-page dokud nemá lh-chrome-in ---
  const introPageHasClass = await page.evaluate(() => 
    document.body.classList.contains('lh-intro-page')
  );
  
  assert.ok(introPageHasClass, 'body má třídu lh-intro-page');
  
  // Získáme celý HTML obsah pro kontrolu CSS
  const htmlContent = await page.evaluate(() => document.documentElement.outerHTML);
  
  // Kontrolujeme, že v HTML je inline CSS s pravidlem pro skrytí hlavičky
  assert.ok(
    htmlContent.includes('.lh-intro-page:not(.lh-chrome-in) .lh-top') &&
    htmlContent.includes('opacity:0'),
    'HTML obsahuje pravidlo .lh-intro-page:not(.lh-chrome-in) .lh-top s opacity:0'
  );
  
  // --- Test 2: #lh-word-tint zhasne při zoomu (opacity 0 v GSAP timeline) ---
  const wordTint = await page.$('#lh-word-tint');
  assert.ok(wordTint, '#lh-word-tint prvek existuje');
  
  // Kontrolujeme CSS - třída motion by měla být přidána
  const hasMotionClass = await page.evaluate(() => 
    document.body.classList.contains('motion')
  );
  assert.ok(hasMotionClass, 'body má třídu motion (GSAP inicializován)');
  
  // Kontrolujeme, že CSS pravidlo pro #lh-word-tint obsahuje GSAP animaci
  // V motion.mjs je .to('#lh-word-tint', {opacity: 0, duration: 0.05, ease: 'none'}, 0.04)
  // To znamená, že po zoomu (scrollu) bude opacity 0
  // Zkontrolujeme, že prvek existuje a má CSS masku
  const wordTintHasMask = await page.evaluate(() => {
    const el = document.querySelector('#lh-word-tint');
    return el ? el.getAttribute('mask') === 'url(#lhWordInv)' : false;
  });
  assert.ok(wordTintHasMask, '#lh-word-tint má správnou masku pro animaci');

  // --- Test 2b: v motion.mjs je #lh-word-tint animován PŘED #lh-word-g (pořadí v timeline)
  const motionContent = await page.evaluate(() => {
    const scripts = [...document.querySelectorAll('script[src]')];
    return scripts.map(s => s.src);
  });
  // Načteme zdroj motion.mjs a ověříme pořadí animací v timeline
  const motionSource = await fetch(base + '/motion.mjs').then(r => r.text());
  assert.ok(motionSource.includes('.to(\'#lh-word-tint\', {opacity: 0'), 'motion.mjs obsahuje animaci #lh-word-tint na opacity 0');
  // Kontrola pořadí: #lh-word-tint musí být v timeline před #lh-word-g
  const tintIndex = motionSource.indexOf('.to(\'#lh-word-tint\', {opacity: 0');
  const gIndex = motionSource.indexOf('.to(\'#lh-word-g\', {scale: 110');
  assert.ok(tintIndex > 0 && gIndex > 0 && tintIndex < gIndex, 
    '#lh-word-tint je v motion.mjs animován PŘED #lh-word-g v timeline');
  
  // --- Test 3: .lh-cat na desktopu má top vypočítaný přes calc(50% + …) ---
  const cat1 = await page.$('.lh-cat--1');
  assert.ok(cat1, '.lh-cat--1 prvek existuje');
  
  // Kontrolujeme HTML pro CSS pravidlo desktop kategorie
  assert.ok(
    htmlContent.includes('.lh-cat--1') &&
    htmlContent.includes('top:calc(50%'),
    'HTML obsahuje pravidlo pro desktop kategorie s calc(50%'
  );
  
  // Kontrolujeme, že na desktopu je top vypočítaný
  const computedTop = await page.evaluate(() => {
    const cat = document.querySelector('.lh-cat--1');
    if (!cat) return null;
    const style = getComputedStyle(cat);
    return style.top;
  });
  
  // Top by mělo být vypočítané hodnotou (ne 'auto')
  assert.ok(
    computedTop && computedTop !== 'auto',
    '.lh-cat--1 má vypočítaný top: ' + computedTop
  );
});

test('intro-chrome: kontrola CSS ve zdrojovém kódu', async () => {
  // Otevřeme homepage
  await page.goto(base + '/', {waitUntil: 'load'});
  
  const cssContent = await page.evaluate(() => document.documentElement.outerHTML);
  
  assert.ok(
    cssContent.includes('.lh-intro-page:not(.lh-chrome-in) .lh-top') &&
    cssContent.includes('opacity:0'),
    'CSS obsahuje pravidlo pro skrytí hlavičky'
  );
  
  assert.ok(
    cssContent.includes('.lh-cat--1') &&
    cssContent.includes('top:calc(50%'),
    'CSS obsahuje pravidlo pro desktop kategorie s calc(50%'
  );
});
