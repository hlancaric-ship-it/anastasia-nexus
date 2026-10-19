// Browser E2E č. 6: admin zastaví automatickú obnovu členke (Klub › Členky › detail).
import { chromium } from '/Users/lucky/hra-studio54/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const OUT = '/Users/lucky/.claude/jobs/223fc22a/tmp/launch/evidence', ADMIN = 'http://127.0.0.1:4178', mbr = process.env.MBR;
const sql = (q) => execFileSync('psql', ['-h', '127.0.0.1', '-U', 'lucky', 'anastasia_launch_e2e', '-Atc', q]).toString().trim();
const mrow = (id) => sql(`select status||'|'||coalesce(snapshot->>'renew','?')||'|'||period_end from membership where id='${id}'`);
const results = [], rec = (step, ok, detail) => { results.push({ step, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', step, detail ? JSON.stringify(detail) : ''); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const admin = await browser.newPage({ viewport: { width: 1360, height: 900 } });
admin.on('dialog', d => d.accept());
const errs = []; admin.on('pageerror', e => errs.push(e.message.slice(0, 200)));
try {
  const before = mrow(mbr);
  await admin.goto(ADMIN + '/'); await admin.fill('#l-pass', process.env.E2E_ADMIN_PASSWORD); await admin.click('#lf button[type=submit]');
  await admin.waitForSelector('#logout', { timeout: 15000 });
  await admin.goto(ADMIN + '/#/klub'); await admin.waitForSelector('#k-q');
  await admin.fill('#k-q', sql(`select customer_id from membership where id='${mbr}'`)); await admin.press('#k-q', 'Enter');
  await admin.waitForFunction((m) => [...document.querySelectorAll('.rc')].length === 1, mbr, { timeout: 15000 });
  await admin.locator('.rc').first().click();
  await admin.waitForSelector('#k-stop'); await admin.click('#k-stop');
  await admin.waitForSelector('#kmsg .notice, #kmsg .err', { timeout: 15000 });
  const msg = (await admin.textContent('#kmsg')).trim(), det = (await admin.textContent('.card-b')).replace(/\s+/g, ' '), after = mrow(mbr);
  rec('admin-zastavenie-obnovy', /zastavená/.test(msg) && /Automatická obnovazastavená/.test(det) && /^active\|false\|/.test(after) && after.split('|')[2] === before.split('|')[2], { msg, before, after, stopBtnGone: !(await admin.$('#k-stop')) });
  await admin.screenshot({ path: `${OUT}/44-admin-obnova-zastavena.png`, fullPage: true });
} catch (e) { rec('chyba', false, { message: e.message.split('\n')[0] }); await admin.screenshot({ path: `${OUT}/admin-stop-chyba.png` }).catch(() => {}); }
finally { writeFileSync(`${OUT}/e2e-admin-klub-stop.json`, JSON.stringify({ at: new Date().toISOString(), mbr, results, errs }, null, 2)); console.log('errs', errs); await browser.close(); }
