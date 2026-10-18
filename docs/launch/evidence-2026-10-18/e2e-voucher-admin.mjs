// Browser E2E č. 7b: admin Poukazy — zoznam s maskovaným kódom, detail s pohybmi (vydaný → použitý), zneplatnenie aktívneho poukazu.
import { chromium } from '/Users/lucky/hra-studio54/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const OUT = '/Users/lucky/.claude/jobs/223fc22a/tmp/launch/evidence', ADMIN = 'http://127.0.0.1:4178';
const sql = (q) => execFileSync('psql', ['-h', '127.0.0.1', '-U', 'lucky', 'anastasia_launch_e2e', '-Atc', q]).toString().trim();
const results = [], errors = [];
const rec = (step, ok, detail) => { results.push({ step, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', step, detail ? JSON.stringify(detail) : ''); };
const used = sql(`select id||'|'||code from gift_voucher where status='depleted' order by created_at desc limit 1`).split('|');
const act = sql(`select id||'|'||code from gift_voucher where status='active' order by created_at desc limit 1`).split('|');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const a = await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
  a.on('dialog', d => d.accept()); a.on('pageerror', e => errors.push(e.message.slice(0, 300)));
  await a.goto(ADMIN + '/'); await a.fill('#l-pass', process.env.E2E_ADMIN_PASSWORD); await a.click('#lf button[type=submit]'); await a.waitForSelector('#logout');
  await a.goto(ADMIN + '/#/poukazy');
  await a.click('#actions .pill:has-text("Darčekové poukazy")');
  await a.waitForSelector('.tabs .tab:has-text("Vyčerpané")');
  const onPill = await a.textContent('#actions .pill.on');
  const list = (await a.textContent('#view')).replace(/\s+/g, ' ');
  rec('admin-zoznam-maskovany', !list.includes(used[1]) && !list.includes(act[1]) && list.includes(used[1].slice(-4)) && onPill === 'Darčekové poukazy', { onPill, maskedTail: used[1].slice(-4) });
  await a.click('.tabs .tab:has-text("Vyčerpané")');
  await a.locator('.rc', { hasText: used[1].slice(-4) }).first().click();
  await a.waitForSelector('#v-back');
  const det = (await a.textContent('#view')).replace(/\s+/g, ' ');
  rec('admin-detail-a-pohyby', /vydaný · 50,00/.test(det) && /použitý v objednávke/.test(det) && /vyčerpaný/.test(det) && !det.includes(used[1]) && (await a.locator('#v-void').count()) === 0, { det: det.slice(0, 500) });
  await a.screenshot({ path: `${OUT}/64-admin-poukaz-detail.png`, fullPage: true });
  await a.click('#v-back');
  await a.click('.tabs .tab:has-text("Aktívne")');
  await a.locator('.rc', { hasText: act[1].slice(-4) }).first().click();
  await a.waitForSelector('#v-void');
  await a.click('#v-void');
  const noReason = (await a.textContent('#vmsg')).trim();
  await a.fill('#v-reason', 'E2E test zneplatnenia'); await a.click('#v-void');
  await a.waitForFunction(() => /zneplatnený/.test(document.querySelector('#vmsg')?.textContent || ''), null, { timeout: 15000 });
  const db = sql(`select status||'|'||balance from gift_voucher where id='${act[0]}'`);
  rec('admin-zneplatnenie', /Uveďte dôvod/.test(noReason) && /^void\|0$/.test(db), { noReason, db });
  await a.screenshot({ path: `${OUT}/65-admin-poukaz-zneplatneny.png`, fullPage: true });
  await a.click('#actions .pill:has-text("Kupóny a zľavy")'); await a.waitForTimeout(1500);
  rec('admin-prepnutie-spat-na-kupony', (await a.textContent('#actions .pill.on')) === 'Kupóny a zľavy');
} catch (e) { rec('chyba', false, { message: e.message.split('\n')[0], at: e.stack.split('\n').find(l => l.includes('e2e-voucher-admin')) }); }
finally { writeFileSync(`${OUT}/e2e-voucher-admin.json`, JSON.stringify({ at: new Date().toISOString(), results, errors }, null, 2)); console.log('pageerrors', errors); await browser.close(); }
