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
  
  // --- Test 2: paper mask leaves the word transparent so the video shows through. ---
  const paperMask = await page.evaluate(() => {
    const paper = document.querySelector('#lh-paper');
    return {mask: paper?.getAttribute('mask'), tint: document.querySelector('#lh-word-tint')};
  });
  assert.equal(paperMask.mask, 'url(#lhWord)', 'paper uses the text cutout mask');
  assert.equal(paperMask.tint, null, 'there is no solid tint layer over the video letters');

  const hasMotionClass = await page.evaluate(() => document.body.classList.contains('motion'));
  assert.ok(hasMotionClass, 'body má třídu motion (GSAP inicializován)');
  const motionSource = await fetch(base + '/motion.mjs').then(r => r.text());
  assert.ok(!motionSource.includes(".to('#lh-word-tint'"), 'motion does not animate a missing solid tint layer');

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
