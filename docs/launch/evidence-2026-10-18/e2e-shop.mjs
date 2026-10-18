// Browser E2E č. 2: magic-link přihlášení → katalog → živý detail → košík (NEXUS) → pokladna (doprava, DPH, souhlas) → Stripe 4242 → objednávka.
import { chromium } from '/Users/lucky/hra-studio54/node_modules/playwright/index.mjs';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = '/Users/lucky/.claude/jobs/223fc22a/tmp/launch/evidence';
mkdirSync(OUT, { recursive: true });
const SF = 'http://127.0.0.1:4173';
const { title } = JSON.parse(readFileSync(`${OUT}/product.json`, 'utf8'));
const email = process.env.E2E_EMAIL || `e2e.nakup.${Date.now().toString(36)}@example.com`;
const card = process.env.E2E_CARD || '4242424242424242';
const sql = (q) => execFileSync('psql', ['-h', '127.0.0.1', '-U', 'lucky', 'anastasia_launch_e2e', '-Atc', q]).toString().trim();
const results = [];
const rec = (step, ok, detail) => { results.push({ step, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', step, detail ? JSON.stringify(detail) : ''); };

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, locale: 'sk-SK' });
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message.slice(0, 300)));
const calls = [];
page.on('response', r => { const u = new URL(r.url()); if (u.port === '9100' && r.request().method() !== 'OPTIONS') calls.push(`${r.request().method()} ${u.pathname} ${r.status()}`); });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
const imgLoaded = (sel) => page.evaluate(async (s) => { const i = document.querySelector(s); if (!i) return false; if (!i.complete) await new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 4000); }); return i.naturalWidth > 0 && !/brand-mark|product-jar/.test(i.src); }, sel);

try {
  // 1) Prihlásenie magic-linkom
  await page.goto(SF + '/prihlasenie');
  await page.fill('#login-form [name=email]', email);
  await page.click('#login-form [type=submit]');
  await page.waitForFunction(() => document.querySelector('#login-form .form-status')?.textContent.trim().length > 0);
  const link = new URL(sql(`select data->>'url' from notification where template='magic-link-sk' and data->>'url' like '%${encodeURIComponent(email)}%' order by created_at desc limit 1`));
  await page.goto(SF + link.pathname + link.search);
  await page.waitForFunction(() => document.querySelector('#magic-confirm')?.textContent.trim().length > 0, null, { timeout: 15000 });
  const loginMsg = (await page.textContent('#magic-confirm')).trim();
  rec('prihlasenie-magic-link-nova-zakaznicka', /založený|Vitajte/.test(loginMsg), { loginMsg });

  // 2) Katalóg
  await page.goto(SF + '/eshop');
  const cardL = page.locator('.product-card', { has: page.locator('h3', { hasText: title }) });
  await cardL.waitFor({ timeout: 15000 });
  await cardL.evaluate(el => el.setAttribute('data-e2e', '1'));
  const cardSel = '.product-card[data-e2e]';
  const cardPrice = (await page.textContent(`${cardSel} .product-caption p`)).trim();
  const cardImg = await imgLoaded(`${cardSel} img.image-below`);
  rec('katalog-zobrazuje-produkt', /26,50/.test(cardPrice) && cardImg, { cardPrice, cardImg });
  await shot('10-katalog');

  // 3) Živý detail
  await page.click(`${cardSel} h3 a`);
  await page.waitForFunction((t) => document.querySelector('.detail-copy h1')?.textContent === t, title, { timeout: 15000 });
  const detailPrice = (await page.textContent('.detail-price')).trim();
  const detailImg = await imgLoaded('.detail-image img');
  rec('detail-produktu-zivy', /26,50/.test(detailPrice) && detailImg, { url: page.url(), detailPrice, detailImg });
  await page.fill('.add-product [name=quantity]', '2');
  await page.click('.add-product [type=submit]');
  await page.waitForFunction(() => /pridan|nepodarilo|nenašiel/i.test(document.querySelector('.detail-copy .form-status')?.textContent || ''), null, { timeout: 15000 });
  const addMsg = (await page.textContent('.detail-copy .form-status')).trim();
  rec('pridanie-do-kosika', /pridaný/i.test(addMsg), { addMsg });
  await shot('11-detail');

  // 4) Košík
  await page.goto(SF + '/kosik');
  await page.waitForSelector('.cart-line', { timeout: 15000 });
  const cartTotal = (await page.textContent('.order-summary')).replace(/\s+/g, ' ');
  rec('kosik-prepocet-nexus', /53,00/.test(cartTotal) && calls.some(c => /POST \/store\/nexus-cart 200/.test(c)), { cartTotal });
  await shot('12-kosik');

  // 5) Pokladňa
  await page.goto(SF + '/pokladna');
  await page.waitForSelector('#checkout-form [name=firstName]');
  await page.fill('[name=firstName]', 'Eva'); await page.fill('[name=lastName]', 'Testová'); await page.fill('#checkout-form [name=email]', email);
  await page.click('[data-next="2"]');
  await page.check('[name=delivery][value=shipping]');
  await page.fill('[name=street]', 'Testovacia 12'); await page.fill('[name=city]', 'Bratislava'); await page.fill('[name=postalCode]', '811 01');
  await page.click('[data-next="3"]');
  await page.waitForSelector('#stripe-payment-element iframe', { timeout: 30000 }).catch(async () => { throw new Error('Payment Element: ' + (await page.textContent('#stripe-payment-element').catch(() => '?')) + ' cfg=' + await page.evaluate(() => JSON.stringify({ c: !!globalThis.__ANASTASIA_CONFIG__, k: !!globalThis.__ANASTASIA_CONFIG__?.stripePublishableKey, step: document.querySelector('fieldset:not([hidden])')?.dataset.step }))); });
  const summaryTxt = (await page.textContent('#checkout-summary')).replace(/\s+/g, ' ');
  const cartId = await page.evaluate(() => Object.entries(localStorage).find(([k, v]) => /^cart_/.test(v))?.[1] || '');
  const cartRow = sql(`select c.email, (select count(*) from cart_shipping_method m where m.cart_id=c.id and m.deleted_at is null), c.customer_id is not null from cart c where c.id='${cartId}'`);
  const st = summaryTxt.normalize('NFKC').replace(/[\u00a0\u202f\u200b]/g, ' ');
  rec('pokladna-doprava-a-suma', /Doprava ?6,00/.test(st) && /Celkom ?59,00/.test(st) && /DPH/.test(st), { summaryTxt, cartRow });
  const frame = page.frameLocator('#stripe-payment-element iframe').first();
  await frame.locator('[name=number]').fill(card, { timeout: 20000 });
  await frame.locator('[name=expiry]').fill('12 / 34');
  await frame.locator('[name=cvc]').fill('123');
  const postal = frame.locator('[name=postalCode]'); if (await postal.count()) await postal.fill('81101');
  const hit = await page.evaluate(() => [...document.querySelectorAll('[name=terms],[name=privacy]')].map(i => { i.scrollIntoView({ block: 'center' }); const r = i.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { w: r.width, h: r.height, hit: el === i ? 'self' : (el?.outerHTML || '').slice(0, 160), disabled: i.disabled }; }));
  console.log('checkbox-hit', JSON.stringify(hit));
  const peW = await page.evaluate(() => document.querySelector('#stripe-payment-element').getBoundingClientRect().width);
  rec('platobny-formular-sirka', peW >= 300, { peW });
  await page.check('[name=terms]'); await page.check('[name=privacy]');
  await shot('13-pokladna');
  await page.click('#checkout-form [type=submit]');
  await page.waitForFunction(() => ['ALLOW', 'ERROR', 'BLOCK'].includes(document.querySelector('#checkout-result')?.dataset.state || '') || /review/i.test(document.querySelector('#checkout-result')?.dataset.state || '') && !/Spracúvam/.test(document.querySelector('#checkout-result').textContent), null, { timeout: 90000 });
  const state = await page.getAttribute('#checkout-result', 'data-state');
  const msg = (await page.textContent('#checkout-result')).trim();
  rec('platba-a-objednavka', state === 'ALLOW', { state, msg });
  await shot('14-vysledok');
  const order = sql(`select o.id, o.display_id, o.email from "order" o where o.email='${email}' order by o.created_at desc limit 1`);
  writeFileSync(`${OUT}/order.json`, JSON.stringify({ email, order, cartId }, null, 2));
  rec('objednavka-v-db', !!order, { order });
} catch (e) {
  rec('chyba', false, { message: e.message.split('\n')[0] });
  await shot('shop-chyba').catch(() => {});
} finally {
  writeFileSync(`${OUT}/e2e-shop.json`, JSON.stringify({ at: new Date().toISOString(), email, results, calls, consoleErrors }, null, 2));
  console.log('calls:', calls.filter(c => !/ 200$/.test(c)).join(' | '));
  console.log('console:', consoleErrors.slice(0, 8));
  await browser.close();
}
