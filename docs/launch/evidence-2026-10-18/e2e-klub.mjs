// Browser E2E č. 4: admin založí produkt členstva a zaradí ho do Klubu → zákazníka kúpi členstvo s 3DS → účet → admin Klub.
// Parametre: E2E_CARD (predvolene 4000002500003155 = 3DS pri nákupe, potom off-session bez overenia).
import { chromium } from '/Users/lucky/hra-studio54/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = '/Users/lucky/.claude/jobs/223fc22a/tmp/launch/evidence';
const ADMIN = 'http://127.0.0.1:4178', SF = 'http://127.0.0.1:4173';
const RUN = Date.now().toString(36);
const card = process.env.E2E_CARD || '4000002500003155';
const email = `e2e.klub.${RUN}@example.com`;
const sql = (q) => execFileSync('psql', ['-h', '127.0.0.1', '-U', 'lucky', 'anastasia_launch_e2e', '-Atc', q]).toString().trim();
const results = [];
const rec = (step, ok, detail) => { results.push({ step, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', step, detail ? JSON.stringify(detail) : ''); };

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctxA = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const admin = await ctxA.newPage();
admin.on('dialog', d => d.accept());
const ctxS = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'sk-SK' });
const page = await ctxS.newPage();
page.on('dialog', d => d.accept());
const consoleErrors = [];
for (const p of [admin, page]) { p.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message.slice(0, 300))); }
const calls = [];
page.on('response', r => { const u = new URL(r.url()); if (u.port === '9100' && r.request().method() !== 'OPTIONS') calls.push(`${r.request().method()} ${u.pathname} ${r.status()}`); });
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
const title = `E2E Klub mesačný ${RUN}`;

async function authorize3ds(p, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    for (const f of p.frames()) {
      const b = await f.$('#test-source-authorize-3ds').catch(() => null);
      if (b) { await b.click(); return true; }
    }
    await p.waitForTimeout(500);
  }
  return false;
}

try {
  // A) Admin: produkt členstva
  await admin.goto(ADMIN + '/');
  await admin.fill('#l-pass', process.env.E2E_ADMIN_PASSWORD);
  await admin.click('#lf button[type=submit]');
  await admin.waitForSelector('#logout', { timeout: 15000 });
  await admin.goto(ADMIN + '/#/produkty'); await admin.waitForSelector('#p-new');
  await admin.click('#p-new'); await admin.waitForSelector('#pn-title');
  await admin.fill('#pn-title', title); await admin.fill('#pn-price', '19');
  await admin.selectOption('#pn-status', 'draft');
  await admin.selectOption('#pn-ship', { label: 'Digitálny produkt / služba (bez dopravy)' });
  await admin.click('#pn-save');
  await admin.waitForSelector('#p-save', { timeout: 15000 });
  await admin.click('[data-tab="s"]');
  for (const c of await admin.$$('[data-ch]')) { const lbl = await c.evaluate(el => el.parentElement.textContent); if (/ANASTASIA/.test(lbl)) await c.check(); }
  await admin.click('[data-tab="z"]'); await admin.selectOption('#p-status', 'published');
  await admin.click('#p-save');
  await admin.waitForSelector('#pmsg .notice, #pmsg .err', { timeout: 15000 });
  const saved = (await admin.textContent('#pmsg')).trim();
  rec('admin-produkt-clenstva', saved === 'Uložené.', { title, saved });

  await admin.goto(ADMIN + '/#/klub'); await admin.waitForSelector('[data-k="products"]');
  await admin.click('[data-k="products"]'); await admin.waitForSelector('#k-q');
  await admin.fill('#k-q', title); await admin.press('#k-q', 'Enter');
  await admin.locator('.rc', { hasText: title }).click({ timeout: 15000 });
  await admin.waitForSelector('#k-days');
  await admin.fill('#k-days', '30'); await admin.fill('#k-ver', `e2e-${RUN}`);
  await admin.click('#k-save');
  await admin.waitForSelector('#kmsg .notice, #kmsg .err', { timeout: 15000 });
  const kmsg = (await admin.textContent('#kmsg')).trim();
  rec('admin-zaradenie-do-klubu', kmsg === 'Uložené.', { kmsg });
  await shot(admin, '30-admin-klub-produkt');

  // B) Zákazníka: prihlásenie a nákup
  await page.goto(SF + '/prihlasenie');
  await page.fill('#login-form [name=email]', email);
  await page.click('#login-form [type=submit]');
  await page.waitForFunction(() => document.querySelector('#login-form .form-status')?.textContent.trim().length > 0);
  const link = new URL(sql(`select data->>'url' from notification where template='magic-link-sk' and data->>'url' like '%${encodeURIComponent(email)}%' order by created_at desc limit 1`));
  await page.goto(SF + link.pathname + link.search);
  await page.waitForFunction(() => document.querySelector('#magic-confirm')?.textContent.trim().length > 0, null, { timeout: 15000 });
  rec('klub-prihlasenie', /Vitajte/.test(await page.textContent('#magic-confirm')));

  await page.goto(SF + '/klub');
  const offer = page.locator('article.lesson', { hasText: title });
  await offer.waitFor({ timeout: 15000 });
  const offerTxt = (await offer.textContent()).replace(/\s+/g, ' ');
  rec('klub-ponuka-na-webe', /19,00/.test(offerTxt) && /30 DNÍ/.test(offerTxt), { offerTxt });
  await offer.locator('[data-klub-variant]').click();
  await page.waitForSelector('#klub-form:not([hidden])', { timeout: 15000 });
  await page.check('#klub-form [name=terms]'); await page.check('#klub-form [name=privacy]'); await page.check('#klub-form [name=auto_renew]');
  await page.click('#klub-submit');
  await page.waitForSelector('#klub-payment iframe', { timeout: 30000 }).catch(async () => { throw new Error('Klub platba: ' + (await page.textContent('#klub-result'))); });
  const frame = page.frameLocator('#klub-payment iframe').first();
  await frame.locator('[name=number]').fill(card, { timeout: 20000 });
  await frame.locator('[name=expiry]').fill('12 / 34');
  await frame.locator('[name=cvc]').fill('123');
  const country = frame.locator('select[name=country]'); if (await country.count()) await country.selectOption('SK').catch(() => {});
  const postal = frame.locator('[name=postalCode]'); if (await postal.count() && await postal.isVisible()) await postal.fill('81101');
  await shot(page, '31-klub-platba');
  console.log('HIT', await page.evaluate(() => { const b = document.querySelector('#klub-submit'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return (el === b ? 'self' : (el?.outerHTML || 'null').slice(0, 200)) + ' focus=' + (document.activeElement?.outerHTML || '').slice(0, 120); }));
  await page.click('#klub-submit');
  await page.waitForTimeout(4000);
  console.log('DBG', JSON.stringify(await page.evaluate(() => { const f = document.querySelector('#klub-form'); return { valid: f.checkValidity(), invalid: [...f.querySelectorAll(':invalid')].map(x => x.outerHTML.slice(0, 160)), res: document.querySelector('#klub-result').textContent, btn: document.querySelector('#klub-submit').disabled, frames: [...document.querySelectorAll('iframe')].map(i => (i.name || i.src).slice(0, 80)) }; })));
  const did3ds = await authorize3ds(page, 45000);
  rec('klub-3ds-overenie', did3ds);
  await page.waitForFunction(() => ['ALLOW', 'ERROR', 'BLOCK', 'UNKNOWN', 'NEEDS_REVIEW'].includes(document.querySelector('#klub-result')?.dataset.state || ''), null, { timeout: 90000 });
  const state = await page.getAttribute('#klub-result', 'data-state'), msg = (await page.textContent('#klub-result')).trim();
  rec('klub-nakup-aktivacia', state === 'ALLOW', { state, msg });
  await shot(page, '32-klub-vysledok');
  const cust = sql(`select id from customer where email='${email}' and deleted_at is null limit 1`);
  const mbr = sql(`select id||'|'||status||'|'||coalesce(snapshot->>'renew','?')||'|'||period_end from membership where customer_id='${cust}' order by created_at desc limit 1`);
  const mandate = sql(`select count(*) from membership_mandate where membership_id='${mbr.split('|')[0]}'`);
  rec('klub-clenstvo-v-db', /\|active\|true\|/.test(mbr) && Number(mandate) === 1, { mbr, mandate });

  // C) Účet: prehľad členstva
  await page.goto(SF + '/ucet#klub');
  await page.waitForSelector('#membership-view [data-membership]', { timeout: 20000 });
  const acc = (await page.textContent('#membership-view')).replace(/\s+/g, ' ');
  rec('ucet-clenstvo-aktivne', /Aktívne/.test(acc) && /automatická obnova zapnutá/.test(acc), { acc: acc.slice(0, 200) });
  await shot(page, '33-ucet-klub');

  // D) Admin Klub: členka viditeľná
  await admin.goto(ADMIN + '/#/'); await admin.goto(ADMIN + '/#/klub'); await admin.waitForSelector('#k-q');
  await admin.fill('#k-q', cust); await admin.press('#k-q', 'Enter');
  await admin.locator('.rc').first().click({ timeout: 15000 });
  await admin.waitForSelector('#k-back');
  const det = (await admin.textContent('.card-b')).replace(/\s+/g, ' ');
  rec('admin-klub-clenka', /aktívne/.test(det) && /zapnutá/.test(det) && new RegExp(title).test(det), { det: det.slice(0, 260) });
  await shot(admin, '34-admin-klub-clenka');
  writeFileSync(`${OUT}/klub.json`, JSON.stringify({ email, customer: cust, membership: mbr.split('|')[0], title, card }, null, 2));
} catch (e) {
  rec('chyba', false, { message: e.message.split('\n')[0] });
  await shot(page, 'klub-chyba').catch(() => {}); await shot(admin, 'klub-admin-chyba').catch(() => {});
} finally {
  writeFileSync(`${OUT}/e2e-klub-${card.slice(-4)}.json`, JSON.stringify({ at: new Date().toISOString(), email, results, calls, consoleErrors }, null, 2));
  console.log('calls:', calls.filter(c => !/ 20\d$/.test(c)).join(' | '));
  console.log('pageerrors:', consoleErrors.slice(0, 6));
  await browser.close();
}
