// Browser E2E č. 5: obnova s 3DS v účte členky → zastavenie obnovy v účte → zastavenie obnovy v admine → admin Obnovy platieb.
// Server beží s posunutými hodinami (deň obnovy). Členstvo a pokus o obnovu vznikli cez e2e-klub.mjs + renew-now.ts (NEEDS_ACTION).
import { chromium } from '/Users/lucky/hra-studio54/node_modules/playwright/index.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = '/Users/lucky/.claude/jobs/223fc22a/tmp/launch/evidence';
const ADMIN = 'http://127.0.0.1:4178', SF = 'http://127.0.0.1:4173';
const { email, membership, title } = JSON.parse(readFileSync(`${OUT}/klub-3184.json`, 'utf8'));
const otherMbr = process.env.OTHER_MBR; // členstvo, ktorému obnovu zastaví admin
const sql = (q) => execFileSync('psql', ['-h', '127.0.0.1', '-U', 'lucky', 'anastasia_launch_e2e', '-Atc', q]).toString().trim();
const results = [];
const rec = (step, ok, detail) => { results.push({ step, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', step, detail ? JSON.stringify(detail) : ''); };

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, locale: 'sk-SK' });
page.on('dialog', d => d.accept());
const consoleErrors = [];
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message.slice(0, 300)));
const calls = [];
page.on('response', r => { const u = new URL(r.url()); if (u.port === '9100' && r.request().method() !== 'OPTIONS') calls.push(`${r.request().method()} ${u.pathname} ${r.status()}`); });
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
async function authorize3ds(p, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    for (const f of p.frames()) { const b = await f.$('#test-source-authorize-3ds').catch(() => null); if (b) { await b.click(); return true; } }
    await p.waitForTimeout(500);
  }
  return false;
}
const mrow = (id) => sql(`select status||'|'||coalesce(snapshot->>'renew','?')||'|'||period_end from membership where id='${id}'`);

try {
  const before = mrow(membership);
  await page.goto(SF + '/prihlasenie');
  await page.fill('#login-form [name=email]', email);
  await page.click('#login-form [type=submit]');
  await page.waitForFunction(() => document.querySelector('#login-form .form-status')?.textContent.trim().length > 0);
  const link = new URL(sql(`select data->>'url' from notification where template='magic-link-sk' and data->>'url' like '%${encodeURIComponent(email)}%' order by created_at desc limit 1`));
  await page.goto(SF + link.pathname + link.search);
  await page.waitForFunction(() => document.querySelector('#magic-confirm')?.textContent.trim().length > 0, null, { timeout: 15000 });

  await page.goto(SF + '/ucet#klub');
  const card = page.locator(`[data-membership="${membership}"]`);
  await card.waitFor({ timeout: 20000 });
  const accBefore = (await card.textContent()).replace(/\s+/g, ' ');
  rec('ucet-obnova-caka-na-overenie', /Obnovuje sa/.test(accBefore) && await card.locator('[data-membership-confirm]').count() === 1, { accBefore: accBefore.slice(0, 200), before });
  await shot(page, '40-ucet-potvrdit-v-banke');

  await card.locator('[data-membership-confirm]').click();
  await page.waitForTimeout(6000);
  console.log('FRAMES', page.frames().map(f => f.url().slice(0, 90)).join(' || '));
  await shot(page, '40b-3ds-okno');
  rec('obnova-3ds-overenie', await authorize3ds(page, 45000));
  await page.waitForTimeout(8000);
  console.log('AFTER', (await page.textContent('#membership-view')).replace(/\s+/g, ' ').slice(0, 300), page.frames().length);
  await shot(page, '40c-po-3ds');
  await page.waitForFunction(() => /potvrdená|overujeme|nepodarilo|nie je/i.test(document.querySelector('#membership-view')?.textContent || '') && !/Otváram overenie/.test(document.querySelector('#membership-view')?.textContent || ''), null, { timeout: 90000 });
  const accAfter = (await page.textContent('#membership-view')).replace(/\s+/g, ' ');
  const after = mrow(membership);
  const attempt = sql(`select stage||'|'||coalesce(order_id,'') from membership_billing_attempt where membership_id='${membership}' order by created_at desc limit 1`);
  rec('obnova-po-3ds-predlzena', /Platba je potvrdená/.test(accAfter) && /^active\|true\|/.test(after) && after.split('|')[2] !== before.split('|')[2] && /^settled\|order_/.test(attempt), { accAfter: accAfter.slice(0, 220), before, after, attempt });
  await shot(page, '41-ucet-obnova-potvrdena');

  // Zastavenie obnovy členkou
  await page.locator(`[data-membership="${membership}"] [data-membership-stop]`).click();
  await page.waitForFunction(() => /bez automatickej obnovy/.test(document.querySelector('#membership-view')?.textContent || ''), null, { timeout: 20000 });
  const stopped = mrow(membership);
  rec('zastavenie-obnovy-v-ucte', /^active\|false\|/.test(stopped), { stopped });
  await shot(page, '42-ucet-obnova-zastavena');

  // Admin: obnovy platieb + zastavenie obnovy inej členke
  const admin = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  admin.on('dialog', d => d.accept());
  admin.on('pageerror', e => consoleErrors.push('admin pageerror: ' + e.message.slice(0, 300)));
  await admin.goto(ADMIN + '/');
  await admin.fill('#l-pass', process.env.E2E_ADMIN_PASSWORD);
  await admin.click('#lf button[type=submit]');
  await admin.waitForSelector('#logout', { timeout: 15000 });
  await admin.goto(ADMIN + '/#/klub'); await admin.waitForSelector('[data-k="billing"]');
  await admin.click('[data-k="billing"]'); await admin.waitForSelector('#k-q');
  await admin.fill('#k-q', membership); await admin.press('#k-q', 'Enter');
  await admin.waitForFunction((m) => [...document.querySelectorAll('.rc')].some(r => r.textContent.includes(m)) || /Nič sa nenašlo/.test(document.querySelector('#view')?.textContent || ''), membership, { timeout: 15000 });
  const bill = (await admin.textContent('.rc-grid')).replace(/\s+/g, ' ');
  rec('admin-obnovy-platieb', /dokončen|zaplaten|uhraden|settled|vybaven/i.test(bill), { bill: bill.slice(0, 260) });
  await shot(admin, '43-admin-obnovy');

  if (otherMbr) {
    await admin.click('[data-k="memberships"]'); await admin.waitForSelector('#k-q');
    await admin.fill('#k-q', otherMbr); await admin.press('#k-q', 'Enter');
    await admin.locator('.rc').first().click({ timeout: 15000 });
    await admin.waitForSelector('#k-stop');
    await admin.click('#k-stop');
    await admin.waitForSelector('#kmsg .notice, #kmsg .err', { timeout: 15000 });
    const msg = (await admin.textContent('#kmsg')).trim(), det = (await admin.textContent('.card-b')).replace(/\s+/g, ' ');
    const o = mrow(otherMbr);
    rec('admin-zastavenie-obnovy', /zastavená/.test(msg) && /Automatická obnovazastavená/.test(det) && /^active\|false\|/.test(o), { msg, o });
    await shot(admin, '44-admin-obnova-zastavena');
  }
} catch (e) {
  rec('chyba', false, { message: e.message.split('\n')[0] });
  await shot(page, 'klub-renew-chyba').catch(() => {});
} finally {
  writeFileSync(`${OUT}/e2e-klub-renew.json`, JSON.stringify({ at: new Date().toISOString(), email, membership, results, calls, consoleErrors }, null, 2));
  console.log('calls:', calls.filter(c => !/ 20\d$/.test(c)).join(' | '));
  console.log('pageerrors:', consoleErrors.slice(0, 6));
  await browser.close();
}
