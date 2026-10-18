// Browser E2E č. 1: admin → kategorie → produkt (cena, obrázek, kanál, sklad, publikace) → změna ceny přes shop-prices.
import { chromium } from '/Users/lucky/hra-studio54/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = '/Users/lucky/.claude/jobs/223fc22a/tmp/launch/evidence';
mkdirSync(OUT, { recursive: true });
const ADMIN = 'http://127.0.0.1:4178';
const RUN = Date.now().toString(36);
const results = [];
const rec = (step, ok, detail) => { results.push({ step, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', step, detail ? JSON.stringify(detail) : ''); };

// Syntetický 64×64 PNG (zlatá plocha).
function png() {
  const w = 64, h = 64, raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 201; raw[o + 1] = 163; raw[o + 2] = 85; } }
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let r = 0xffffffff; for (const x of b) r = t[(r ^ x) & 0xff] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('dialog', d => d.accept());
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
const api = [];
page.on('response', r => { const u = r.url(); if (u.includes(':9100/admin/') && r.request().method() !== 'GET') api.push(`${r.request().method()} ${new URL(u).pathname} ${r.status()}`); });

try {
  await page.goto(ADMIN + '/');
  await page.fill('#l-pass', process.env.E2E_ADMIN_PASSWORD);
  await page.click('#lf button[type=submit]');
  await page.waitForSelector('#logout', { timeout: 15000 });
  rec('admin-login', true);
  await shot('01-admin-prehlad');

  // Kategorie
  await page.goto(ADMIN + '/#/kategorie'); await page.waitForSelector('#cat-new');
  await page.click('#cat-new'); await page.waitForSelector('#c-name');
  const catName = `E2E Rituály ${RUN}`;
  await page.fill('#c-name', catName); await page.fill('#c-handle', `e2e-ritualy-${RUN}`);
  await page.click('#c-save');
  await page.waitForSelector(`text=${catName}`, { timeout: 10000 });
  rec('kategorie-vytvorena', true, { catName });

  // Produkt
  await page.goto(ADMIN + '/#/produkty'); await page.waitForSelector('#p-new');
  await page.click('#p-new'); await page.waitForSelector('#pn-title');
  const title = `E2E Ružový olej ${RUN}`;
  await page.fill('#pn-title', title); await page.fill('#pn-price', '24.90');
  await page.selectOption('#pn-status', 'draft');
  rec('sku-predvyplnene', /^E2E-RUZOVY-OLEJ-/.test(await page.inputValue('#pn-sku')), { sku: await page.inputValue('#pn-sku') });
  await page.selectOption('#pn-ship', { label: 'Fyzický tovar (doprava kuriérom)' });
  await page.click('#pn-save');
  await page.waitForSelector('#p-save', { timeout: 15000 });
  rec('produkt-vytvoreny-koncept', true, { title, cena: 24.9 });

  // Obrázek
  await page.click('[data-tab="o"]');
  await page.setInputFiles('#p-file', { name: 'e2e.png', mimeType: 'image/png', buffer: png() });
  await page.waitForSelector('#pmsg .notice, #pmsg .err', { timeout: 15000 });
  const upMsg = await page.textContent('#pmsg');
  rec('obrazek-nahrany', /nahraté/.test(upMsg), { upMsg: upMsg.trim() });
  // Kategorie + kanál
  await page.click('[data-tab="k"]');
  await page.locator('label', { hasText: catName }).locator('input').check();
  await page.click('[data-tab="s"]');
  const chs = await page.$$('[data-ch]'); for (const c of chs) await c.check();
  // Sklad: zapnout sledování, uložit, pak doplnit počet
  await page.click('[data-tab="sk"]'); await page.check('#p-inv');
  await page.click('[data-tab="z"]'); await page.selectOption('#p-status', 'published');
  await page.click('#p-save');
  await page.waitForSelector('#pmsg .notice, #pmsg .err', { timeout: 15000 });
  const save1 = (await page.textContent('#pmsg')).trim();
  rec('produkt-ulozeny-publikovany', save1 === 'Uložené.', { save1 });
  await page.waitForTimeout(1500); await page.waitForSelector('#p-save');
  await page.click('[data-tab="sk"]');
  await page.waitForSelector('[data-loc]', { timeout: 10000 });
  await page.fill('[data-loc]', '12');
  // Změna ceny přes shop-prices
  await page.click('[data-tab="c"]'); await page.fill('#p-price', '26.50');
  await page.click('#p-save');
  await page.waitForSelector('#pmsg .notice, #pmsg .err', { timeout: 15000 });
  const save2 = (await page.textContent('#pmsg')).trim();
  rec('cena-a-sklad-ulozene', save2 === 'Uložené.', { save2 });
  await page.waitForTimeout(1500); await page.waitForSelector('#p-save');
  await page.click('[data-tab="sk"]');
  const stock = await page.inputValue('[data-loc]');
  await page.click('[data-tab="c"]');
  const priceNow = await page.inputValue('#p-price');
  const checks = (await page.textContent('#p-checks')).trim();
  const imgOk = await page.evaluate(async () => { await new Promise(r => setTimeout(r, 500)); const i = document.querySelector('#p-imgs img'); return !!i && i.complete && i.naturalWidth > 0; });
  rec('stav-po-reloadu', stock === '12' && Number(priceNow) === 26.5 && /✓ Typ produktu/.test(checks), { stock, priceNow, checks });
  rec('obrazek-viditelny-v-adminu', imgOk);
  await shot('02-admin-produkt');
  writeFileSync(`${OUT}/product.json`, JSON.stringify({ title, catName, run: RUN }, null, 2));
} catch (e) {
  rec('chyba', false, { message: e.message.split('\n')[0] });
  await shot('admin-chyba').catch(() => {});
} finally {
  writeFileSync(`${OUT}/e2e-admin-product.json`, JSON.stringify({ at: new Date().toISOString(), results, api, consoleErrors }, null, 2));
  console.log('API:', api.join('\n'));
  console.log('Console errors:', consoleErrors.slice(0, 10));
  await browser.close();
}
