// Browser E2E: vlastný admin → nastavenie darčekových poukazov → storefront /darcekovy-poukaz ponúka nové hodnoty; potom návrat pôvodných.
import { chromium } from '/Users/lucky/hra-studio54/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = '/Users/lucky/.claude/jobs/223fc22a/tmp/launch/evidence';
const ADMIN = 'http://127.0.0.1:4178', SF = 'http://127.0.0.1:4173';
const sql = (q) => execFileSync('psql', ['-h', '127.0.0.1', '-U', 'lucky', 'anastasia_launch_e2e', '-Atc', q]).toString().trim();
const results = [];
const rec = (step, ok, detail) => { results.push({ step, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', step, detail ? JSON.stringify(detail) : ''); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const admin = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const errors = [];
admin.on('pageerror', e => errors.push('admin: ' + e.message.slice(0, 300)));
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
const before = sql(`select values_minor::text from gift_voucher_settings`);
const openSettings = async () => {
  await admin.goto(ADMIN + '/#/poukazy');
  await admin.waitForSelector('#actions .pill', { timeout: 15000 });
  await admin.locator('#actions .pill', { hasText: 'Nastavenie poukazov' }).click();
  await admin.waitForSelector('#vs-save', { timeout: 15000 });
};
const save = async () => { await admin.click('#vs-save'); await admin.waitForSelector('#vsmsg .notice, #vsmsg .err', { timeout: 20000 }); return (await admin.textContent('#vsmsg')).trim(); };
const sfOffer = async () => {
  const p = await browser.newPage();
  p.on('pageerror', e => errors.push('sf: ' + e.message.slice(0, 300)));
  await p.goto(SF + '/darcekovy-poukaz/');
  await p.waitForFunction(() => /€/.test(document.querySelector('main')?.innerText || '') && !/Načítav/.test(document.querySelector('main').innerText), null, { timeout: 20000 });
  const txt = await p.locator('main').innerText();
  await shot(p, '57-sf-poukaz-hodnoty'); await p.close();
  return txt;
};
try {
  await admin.goto(ADMIN + '/');
  await admin.fill('#l-pass', process.env.E2E_ADMIN_PASSWORD);
  await admin.click('#lf button[type=submit]');
  await admin.waitForSelector('#logout', { timeout: 15000 });
  await openSettings();
  const pills = await admin.locator('#actions .pill').allTextContents();
  const shown = await admin.inputValue('#vs-values');
  rec('admin-poukazy-nastavenie-nacitane', pills.includes('Nastavenie poukazov') && shown === '25; 50', { pills, shown, db: before });

  await admin.fill('#vs-values', '25; 25');
  const dup = await save();
  await admin.fill('#vs-values', '25; abc');
  const bad = await save();
  await admin.selectOption('#vs-scope', 'categories');
  await admin.fill('#vs-values', '25; 50');
  const noCat = await save();
  await admin.selectOption('#vs-scope', 'all');
  rec('admin-poukazy-validacia', /len raz/.test(dup) && /od 1 do 10 000/.test(bad) && /kategóriu/.test(noCat) && sql(`select values_minor::text from gift_voucher_settings`) === before, { dup, bad, noCat });

  await admin.fill('#vs-values', '25; 50; 75');
  const ok = await save();
  await shot(admin, '56-admin-nastavenie-poukazov');
  const db = sql(`select values_minor::text from gift_voucher_settings`);
  const variants = sql(`select string_agg(v.title, '|' order by v.title) from product_variant v join product p on p.id=v.product_id where p.metadata->>'gift_voucher'='true' and v.deleted_at is null`);
  rec('admin-poukazy-ulozenie', /uložené/.test(ok) && db === '[2500, 5000, 7500]', { ok, db, variants });
  const offer = await sfOffer();
  rec('storefront-poukaz-nova-hodnota', /75/.test(offer), { offer: offer.replace(/\s+/g, ' ').slice(0, 300) });
} catch (e) {
  rec('exception', false, { message: e.message.slice(0, 400) });
  await shot(admin, '56-admin-nastavenie-poukazov-fail').catch(() => {});
} finally {
  try {
    await openSettings(); await admin.fill('#vs-values', '25; 50'); const r = await save();
    rec('navrat-povodnych-hodnot', sql(`select values_minor::text from gift_voucher_settings`) === before, { r });
  } catch (e) { rec('navrat-povodnych-hodnot', false, { message: e.message.slice(0, 200) }); }
  console.log('errors:', JSON.stringify(errors));
  writeFileSync(`${OUT}/e2e-admin-voucher-settings.json`, JSON.stringify({ at: new Date().toISOString(), results, errors }, null, 2));
  await browser.close();
}
