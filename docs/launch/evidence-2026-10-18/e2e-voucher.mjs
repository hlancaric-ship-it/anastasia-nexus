// Browser E2E č. 7: nákup darčekového poukazu (storefront, Stripe 4242) → vydanie a e-mail príjemkyni → uplatnenie kódu
// v košíku inej zákazníčky (čiastočné čerpanie) → admin Poukazy (detail, pohyby, zneplatnenie zostatku).
import { chromium } from '/Users/lucky/hra-studio54/node_modules/playwright/index.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = '/Users/lucky/.claude/jobs/223fc22a/tmp/launch/evidence';
const ADMIN = 'http://127.0.0.1:4178', SF = 'http://127.0.0.1:4173';
const RUN = Date.now().toString(36);
const buyer = `e2e.poukaz.kupuje.${RUN}@example.com`, recipient = `e2e.poukaz.dostane.${RUN}@example.com`;
const { title: productTitle } = JSON.parse(readFileSync(`${OUT}/product.json`, 'utf8'));
const sql = (q) => execFileSync('psql', ['-h', '127.0.0.1', '-U', 'lucky', 'anastasia_launch_e2e', '-Atc', q]).toString().trim();
const results = [];
const rec = (step, ok, detail) => { results.push({ step, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', step, detail ? JSON.stringify(detail) : ''); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const consoleErrors = [], calls = [];
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });

async function customerPage(email) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'sk-SK' });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message.slice(0, 300)));
  page.on('response', r => { const u = new URL(r.url()); if (u.port === '9100' && r.request().method() !== 'OPTIONS') calls.push(`${r.request().method()} ${u.pathname} ${r.status()}`); });
  await page.goto(SF + '/prihlasenie');
  await page.fill('#login-form [name=email]', email);
  await page.click('#login-form [type=submit]');
  await page.waitForFunction(() => document.querySelector('#login-form .form-status')?.textContent.trim().length > 0);
  await page.waitForTimeout(2000);
  const link = new URL(sql(`select data->>'url' from notification where template='magic-link-sk' and data->>'url' like '%${encodeURIComponent(email)}%' order by created_at desc limit 1`));
  await page.goto(SF + link.pathname + link.search);
  await page.waitForFunction(() => /Vitajte/.test(document.querySelector('#magic-confirm')?.textContent || ''), null, { timeout: 15000 });
  return page;
}
async function pay(page, email, { shipping }) {
  await page.goto(SF + '/pokladna');
  await page.waitForSelector('#checkout-form [name=firstName]');
  await page.fill('[name=firstName]', 'Eva'); await page.fill('[name=lastName]', 'Poukazová'); await page.fill('#checkout-form [name=email]', email);
  await page.click('[data-next="2"]');
  if (shipping) {
    await page.check('[name=delivery][value=shipping]');
    await page.fill('[name=street]', 'Testovacia 12'); await page.fill('[name=city]', 'Bratislava'); await page.fill('[name=postalCode]', '811 01');
  } else await page.check('[name=delivery][value=digital]');
  await page.click('[data-next="3"]');
  await page.waitForSelector('#stripe-payment-element iframe', { timeout: 30000 }).catch(async () => { throw new Error('Payment Element: ' + (await page.textContent('#checkout-form')).replace(/\s+/g, ' ').slice(-200)); });
  const summary = (await page.textContent('#checkout-summary')).replace(/\s+/g, ' ');
  await page.waitForTimeout(2500);
  const frame = page.frameLocator('#stripe-payment-element iframe').first();
  for (let i = 0; i < 3; i++) {
    await frame.locator('[name=number]').fill('', { timeout: 20000 });
    await frame.locator('[name=number]').pressSequentially('4242424242424242', { delay: 30 });
    if ((await frame.locator('[name=number]').inputValue()).replace(/\s/g, '') === '4242424242424242') break;
  }
  await frame.locator('[name=expiry]').fill('12 / 34');
  await frame.locator('[name=cvc]').fill('123');
  const postal = frame.locator('[name=postalCode]'); if (await postal.count() && await postal.isVisible()) await postal.fill('81101');
  const hit = await page.evaluate(() => [...document.querySelectorAll('[name=terms],[name=privacy]')].map(i => { i.scrollIntoView({ block: 'center' }); const r = i.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { checked: i.checked, disabled: i.disabled, hit: el === i ? 'self' : (el?.outerHTML || '').slice(0, 200) }; }));
  console.log('consent-hit', JSON.stringify(hit));
  await page.screenshot({ path: `${OUT}/pay-${email.slice(0, 20)}.png`, fullPage: true });
  await page.check('[name=terms]'); await page.check('[name=privacy]');
  await page.click('#checkout-form [type=submit]');
  await page.waitForFunction(() => ['ALLOW', 'ERROR', 'BLOCK'].includes(document.querySelector('#checkout-result')?.dataset.state || ''), null, { timeout: 90000 });
  return { summary, state: await page.getAttribute('#checkout-result', 'data-state'), msg: (await page.textContent('#checkout-result')).trim().slice(0, 160) };
}

let voucherId = '';
try {
  // A) Kupujúca: poukaz 50 € pre príjemkyňu
  const p1 = await customerPage(buyer);
  await p1.goto(SF + '/darcekovy-poukaz');
  await p1.waitForFunction(() => !document.querySelector('#gift-voucher-form select').disabled, null, { timeout: 15000 });
  const opts = await p1.$$eval('#gift-voucher-form select option', os => os.map(o => o.textContent));
  rec('ponuka-hodnot-z-backendu', opts.join('|') === '25 €|50 €', { opts });
  await p1.selectOption('#gift-voucher-form select', { label: '50 €' });
  await p1.fill('#gift-voucher-form [name=name]', 'Dana Obdarovaná'); await p1.fill('#gift-voucher-form [name=email]', recipient);
  await p1.fill('#gift-voucher-form [name=message]', 'Všetko najlepšie (E2E)');
  await p1.click('#gift-voucher-form [type=submit]');
  await p1.waitForFunction(() => /pridaný|nepodarilo|Skontrolujte/.test(document.querySelector('#gift-voucher-form .form-status')?.textContent || ''), null, { timeout: 15000 });
  rec('poukaz-do-kosika', /pridaný/.test(await p1.textContent('#gift-voucher-form .form-status')));
  await shot(p1, '60-poukaz-formular');
  const r1 = await pay(p1, buyer, { shipping: false });
  await shot(p1, '61-poukaz-zaplateny');
  await p1.waitForTimeout(4000);
  const order1 = sql(`select id from "order" where email='${buyer}' order by created_at desc limit 1`);
  const v = sql(`select id||'|'||status||'|'||coalesce(balance::text, '')||'|'||coalesce(recipient_email,'') from gift_voucher where source_order_id='${order1}' limit 1`).split('|');
  voucherId = v[0];
  rec('nakup-poukazu-a-vydanie', r1.state === 'ALLOW' && /Celkom ?50,00/.test(r1.summary) && v[1] === 'active', { r1, order1, voucher: v });
  const mail = sql(`select template||'|'||coalesce(data->>'code','') from notification where "to"='${recipient}' order by created_at desc limit 1`);
  const code = mail.split('|')[1];
  rec('email-prijemkyni-s-kodom', /voucher|poukaz/i.test(mail.split('|')[0]) && code.length >= 8, { template: mail.split('|')[0], codeLen: code.length });

  if (process.env.ONLY_ISSUE) { writeFileSync(`${OUT}/e2e-voucher-issue.json`, JSON.stringify({ at: new Date().toISOString(), results }, null, 2)); await browser.close(); process.exit(0); }
  // B) Príjemkyňa: tovar 2× (53 €) + doprava, uplatnenie 50 € poukazu
  const p2 = await customerPage(recipient);
  await p2.goto(SF + '/eshop');
  await p2.locator('.product-card h3 a', { hasText: productTitle }).first().click();
  await p2.waitForFunction((t) => document.querySelector('.detail-copy h1')?.textContent === t, productTitle, { timeout: 15000 });
  await p2.fill('.add-product [name=quantity]', '2'); await p2.click('.add-product [type=submit]');
  await p2.waitForFunction(() => /pridan/i.test(document.querySelector('.detail-copy .form-status')?.textContent || ''), null, { timeout: 15000 });
  await p2.goto(SF + '/kosik'); await p2.waitForSelector('#redeem-voucher-form');
  await p2.fill('#redeem-voucher-form [name=code]', code); await p2.click('#redeem-voucher-form [type=submit]');
  await p2.waitForFunction(() => (document.querySelector('#redeem-voucher-form .form-status')?.textContent || '').trim().length > 0, null, { timeout: 15000 });
  const applied = (await p2.textContent('#redeem-voucher-form .form-status')).trim();
  const cartSum = (await p2.textContent('.order-summary')).replace(/\s+/g, ' ');
  rec('uplatnenie-kodu-v-kosiku', /uplatnený/.test(applied) && /50,00/.test(cartSum), { applied, cartSum: cartSum.slice(0, 220) });
  await shot(p2, '62-kosik-s-poukazom');
  const r2 = await pay(p2, recipient, { shipping: true });
  await p2.waitForTimeout(4000);
  const order2 = sql(`select id from "order" where email='${recipient}' order by created_at desc limit 1`);
  const after = sql(`select status||'|'||coalesce(balance::text,'') from gift_voucher where id='${voucherId}'`);
  rec('platba-zvysku-a-cerpanie', r2.state === 'ALLOW' && /^depleted\|0$/.test(after) && /Celkom ?9,00/.test(r2.summary), { r2, order2, after });
  await shot(p2, '63-objednavka-s-poukazom');

  // C) Admin Poukazy
  const admin = await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
  admin.on('dialog', d => d.accept());
  admin.on('pageerror', e => consoleErrors.push('admin pageerror: ' + e.message.slice(0, 300)));
  await admin.goto(ADMIN + '/'); await admin.fill('#l-pass', process.env.E2E_ADMIN_PASSWORD); await admin.click('#lf button[type=submit]'); await admin.waitForSelector('#logout');
  await admin.goto(ADMIN + '/#/poukazy');
  await admin.click('#actions .pill:has-text("Darčekové poukazy")');
  await admin.click('.tabs .tab:has-text("Vyčerpané")');
  const row = admin.locator('.rc', { hasText: code.slice(-4) }).first();
  await row.waitFor({ timeout: 15000 });
  const rowTxt = (await row.textContent()).replace(/\s+/g, ' ');
  rec('admin-zoznam-poukazov', !rowTxt.includes(code), { rowTxt: rowTxt.slice(0, 220), codeMasked: !rowTxt.includes(code) });
  await row.click();
  await admin.waitForSelector('#v-back', { timeout: 15000 }).catch(() => admin.waitForSelector('#vmsg', { state: 'attached', timeout: 15000 }));
  const det = (await admin.textContent('#view')).replace(/\s+/g, ' ');
  rec('admin-detail-a-pohyby', /50,00/.test(det) && !det.includes(code), { det: det.slice(0, 400) });
  await shot(admin, '64-admin-poukaz-detail');
} catch (e) {
  rec('chyba', false, { message: e.message.split('\n')[0], stack: e.stack.split('\n').find(l => l.includes('e2e-voucher')) });
} finally {
  writeFileSync(`${OUT}/e2e-voucher.json`, JSON.stringify({ at: new Date().toISOString(), buyer, recipient, voucherId, results, calls, consoleErrors }, null, 2));
  console.log('calls:', calls.filter(c => !/ 20\d$/.test(c)).join(' | '));
  console.log('pageerrors:', consoleErrors.slice(0, 6));
  await browser.close();
}
