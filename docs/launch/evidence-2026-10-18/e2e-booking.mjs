// Browser E2E č. 6: admin API typ konzultácie + dostupnosť → zákazníka (store API) termín → košík → pokladňa storefrontu (digitálne, Stripe 4242)
// → booking confirmed → vlastný admin Konzultácie (detail, zrušenie). Termín, súbeh, košík a expirácia cez UI storefrontu.
import { chromium } from '/Users/lucky/hra-studio54/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = '/Users/lucky/.claude/jobs/223fc22a/tmp/launch/evidence';
const ADMIN = 'http://127.0.0.1:4178', SF = 'http://127.0.0.1:4173', API = 'http://127.0.0.1:9100';
const RUN = Date.now().toString(36);
const email = `e2e.konzultacia.${RUN}@example.com`;
const sql = (q) => execFileSync('psql', ['-h', '127.0.0.1', '-U', 'lucky', 'anastasia_launch_e2e', '-Atc', q]).toString().trim();
const results = [];
const rec = (step, ok, detail) => { results.push({ step, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', step, detail ? JSON.stringify(detail) : ''); };
const WEEK = process.env.WEEK || '2026-10-26';

async function adminApi(token, method, path, body) {
  const r = await fetch(API + path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, locale: 'sk-SK' });
page.on('dialog', d => d.accept());
const consoleErrors = [];
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message.slice(0, 300)));
const calls = [];
page.on('response', r => { const u = new URL(r.url()); if (u.port === '9100' && r.request().method() !== 'OPTIONS') calls.push(`${r.request().method()} ${u.pathname} ${r.status()}`); });
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
let bookingId = '';

try {
  // A) Admin API: typ a dostupnosť
  const login = await fetch(API + '/auth/user/emailpass', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@anastasia.local', password: process.env.E2E_ADMIN_PASSWORD }) }).then(r => r.json());
  const tok = login.token;
  const t = await adminApi(tok, 'POST', '/admin/booking/types', { title: `E2E konzultácia ${RUN}`, description: 'Syntetický test', duration_minutes: 60, buffer_minutes: 15, price_eur: 40, form: 'online', active: true });
  const type = t.data?.type || t.data?.consultation_type || t.data;
  rec('admin-typ-konzultacie', t.status < 300 && !!type?.id && !!type?.variant_id, { status: t.status, id: type?.id, variant: type?.variant_id, msg: t.data?.message });
  const av = await adminApi(tok, 'POST', '/admin/booking/availability', { week_start: WEEK, days: [{ date: WEEK, ranges: [{ start_time: '09:00', end_time: '17:00' }] }] });
  rec('admin-dostupnost-tyzdna', av.status === 200 && av.data?.days?.[0]?.ranges?.length === 1, { status: av.status, msg: av.data?.message, day0: av.data?.days?.[0] });

  const handle = sql(`select handle from product where id='${type.id}'`);
  const emailB = `e2e.konzultacia.b.${RUN}@example.com`;
  async function loginSf(p, mail) {
    await p.goto(SF + '/prihlasenie');
    await p.fill('#login-form [name=email]', mail);
    await p.click('#login-form [type=submit]');
    await p.waitForFunction(() => document.querySelector('#login-form .form-status')?.textContent.trim().length > 0);
    await p.waitForTimeout(2000);
    const link = new URL(sql(`select data->>'url' from notification where template='magic-link-sk' and data->>'url' like '%${encodeURIComponent(mail)}%' order by created_at desc limit 1`));
    await p.goto(SF + link.pathname + link.search);
    await p.waitForFunction(() => document.querySelector('#magic-confirm')?.textContent.trim().length > 0, null, { timeout: 15000 });
    return (await p.textContent('#magic-confirm')).trim();
  }
  const openSlots = async (p) => { await p.goto(`${SF}/konzultacie/rezervacia?typ=${encodeURIComponent(handle)}`); await p.waitForSelector('#booking-view .booking-slot, #booking-view .empty-state, #booking-view [data-state=ERROR]', { timeout: 30000 }); return p.locator('#booking-view .booking-slot').evaluateAll(b => b.map(x => x.dataset.slot)); };

  // B) Nepřihlásená zákazníka vidí termíny, pri výbere dostane prihlásenie s návratom
  const anonSlots = await openSlots(page);
  await page.locator('#booking-view .booking-slot').first().click();
  await page.waitForSelector('#booking-view a[href="/prihlasenie"], #booking-view .button', { timeout: 10000 });
  const anonTxt = (await page.textContent('#booking-view')).replace(/\s+/g, ' ');
  rec('ui-sloty-anonymne-a-vyzva-na-prihlasenie', anonSlots.length > 0 && /prihláste/i.test(anonTxt) && !!(await page.evaluate(() => localStorage.getItem('anastasia.return'))), { n: anonSlots.length, anonTxt: anonTxt.slice(0, 160) });
  const msgA = await loginSf(page, email);
  const cont = page.locator('main a', { hasText: 'Pokračovať v rezervácii' });
  rec('prihlasenie-a-navrat-do-rezervacie', /Vitajte/.test(msgA) && await cont.count() === 1, { msgA: msgA.slice(0, 160) });
  await cont.click();
  await page.waitForSelector('#booking-view .booking-slot', { timeout: 30000 });
  await shot(page, '49-rezervacia-sloty');

  // C) Súbeh: A aj B vyberú rovnaký termín, B rezervuje prvá
  const ctxB = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'sk-SK' });
  const pageB = await ctxB.newPage();
  pageB.on('pageerror', e => consoleErrors.push('B pageerror: ' + e.message.slice(0, 300)));
  await loginSf(pageB, emailB);
  const slotsB = await openSlots(pageB);
  const target = slotsB[0];
  await page.locator(`#booking-view .booking-slot[data-slot="${target}"]`).click();
  await page.waitForSelector('[data-booking-reserve]');
  await pageB.locator(`#booking-view .booking-slot[data-slot="${target}"]`).click();
  await pageB.click('[data-booking-reserve]');
  await pageB.waitForURL('**/pokladna', { timeout: 30000 });
  const bkB = sql(`select id||'|'||status from booking where starts_at='${target}' and status='held' order by created_at desc limit 1`);
  await page.click('[data-booking-reserve]');
  await page.waitForSelector('#booking-view [data-state=ERROR]', { timeout: 30000 });
  const conflictTxt = (await page.textContent('#booking-view [data-state=ERROR]')).trim();
  const slotsAfter = await page.locator('#booking-view .booking-slot').evaluateAll(b => b.map(x => x.dataset.slot));
  rec('subeh-druha-zakaznicka-dostane-409-a-novu-ponuku', /\|held$/.test(bkB) && /niekto iný|nie je voľný/.test(conflictTxt) && !slotsAfter.includes(target) && slotsAfter.length > 0, { bkB, conflictTxt, target, left: slotsAfter.length });
  await shot(page, '49b-rezervacia-obsadeny-termin');

  // A rezervuje iný termín cez UI → pokladňa
  const slotA = slotsAfter[0];
  await page.locator(`#booking-view .booking-slot[data-slot="${slotA}"]`).click();
  await page.click('[data-booking-reserve]');
  await page.waitForURL('**/pokladna', { timeout: 30000 });
  bookingId = sql(`select b.id from booking b where b.starts_at='${slotA}' and b.status='held' order by b.created_at desc limit 1`);
  const attached = sql(`select coalesce(metadata->>'booking_id','') from cart where metadata->>'booking_id'='${bookingId}' and completed_at is null limit 1`);
  rec('ui-rezervacia-podrzana-a-pripojena-ku-kosiku', !!bookingId && attached === bookingId, { bookingId, attached });

  // D) Pokladňa storefrontu (digitálne, bez dopravy)
  await page.goto(SF + '/pokladna');
  await page.waitForSelector('#checkout-form [name=firstName]');
  await page.fill('[name=firstName]', 'Eva'); await page.fill('[name=lastName]', 'Konzultačná'); await page.fill('#checkout-form [name=email]', email);
  await page.click('[data-next="2"]');
  const digital = page.locator('[name=delivery][value=digital]'); if (await digital.count()) await digital.check();
  await page.click('[data-next="3"]');
  await page.waitForSelector('#stripe-payment-element iframe', { timeout: 30000 }).catch(async () => { throw new Error('Payment Element: ' + (await page.textContent('#checkout-form').catch(() => '?')).replace(/\s+/g, ' ').slice(0, 300)); });
  const summary = (await page.textContent('#checkout-summary')).replace(/\s+/g, ' ');
  rec('pokladna-konzultacia-40', /40,00/.test(summary) && !calls.some(c => /nexus-cart 4/.test(c)) && !/Doprava ?[1-9]/.test(summary), { summary: summary.slice(0, 240) });
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
  await page.check('[name=terms]'); await page.check('[name=privacy]');
  await page.click('#checkout-form [type=submit]');
  await page.waitForFunction(() => ['ALLOW', 'ERROR', 'BLOCK'].includes(document.querySelector('#checkout-result')?.dataset.state || ''), null, { timeout: 90000 });
  const state = await page.getAttribute('#checkout-result', 'data-state');
  await shot(page, '50-konzultacia-zaplatena');
  await page.waitForTimeout(3000);
  const bk = sql(`select status||'|'||coalesce(order_id,'') from booking where id='${bookingId}'`);
  rec('platba-a-potvrdenie-terminu', state === 'ALLOW' && /^confirmed\|order_/.test(bk), { state, msg: (await page.textContent('#checkout-result')).trim().slice(0, 200), bk });

  // F) Zákazníka B: košík ukazuje termín bez množstva, odstránenie uvoľní termín
  await pageB.goto(SF + '/kosik');
  await pageB.waitForSelector('.cart-line', { timeout: 20000 });
  const lineB = (await pageB.textContent('.cart-line')).replace(/\s+/g, ' ');
  const qtyBtns = await pageB.locator('.cart-line .quantity').count();
  await pageB.click('.cart-line .remove-line');
  await pageB.waitForFunction(() => !document.querySelector('.cart-line'), null, { timeout: 20000 });
  const bkB2 = sql(`select status from booking where id='${bkB.split('|')[0]}'`);
  rec('kosik-termin-bez-mnozstva-odstranenie-uvolni', /Termín:/.test(lineB) && qtyBtns === 0 && bkB2 === 'canceled', { lineB: lineB.slice(0, 160), qtyBtns, bkB2 });
  const freeAgain = await openSlots(pageB);
  rec('uvolneny-termin-je-znova-v-ponuke', freeAgain.includes(target), { target });

  // G) Expirácia podržania: B rezervuje, podržanie vyprší, pokladňa nepustí k platbe
  await pageB.locator(`#booking-view .booking-slot[data-slot="${target}"]`).click();
  await pageB.click('[data-booking-reserve]');
  await pageB.waitForURL('**/pokladna', { timeout: 30000 });
  sql(`update booking set held_until=now()-interval '1 minute' where starts_at='${target}' and status='held'`);
  await pageB.waitForSelector('#checkout-form [name=firstName]');
  await pageB.fill('[name=firstName]', 'Bea'); await pageB.fill('[name=lastName]', 'Neskorá'); await pageB.fill('#checkout-form [name=email]', emailB);
  await pageB.click('[data-next="2"]');
  const dB = pageB.locator('[name=delivery][value=digital]'); if (await dB.count()) await dB.check();
  await pageB.click('[data-next="3"]');
  await pageB.waitForFunction(() => /vypršalo/.test(document.querySelector('#checkout-form')?.textContent || '') || !!document.querySelector('#stripe-payment-element iframe'), null, { timeout: 30000 });
  const expTxt = (await pageB.textContent('#checkout-form')).replace(/\s+/g, ' ');
  rec('expirovane-podrzanie-blokuje-platbu', /vypršalo/.test(expTxt) && await pageB.locator('#stripe-payment-element iframe').count() === 0, { expTxt: (expTxt.match(/.{0,60}vypršalo.{0,80}/) || [''])[0] });
  await shot(pageB, '49c-rezervacia-expirovana');
  await ctxB.close();

  // E) Vlastný admin: Konzultácie → detail → zrušenie
  const admin = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  admin.on('dialog', d => d.accept());
  admin.on('pageerror', e => consoleErrors.push('admin pageerror: ' + e.message.slice(0, 300)));
  await admin.goto(ADMIN + '/');
  await admin.fill('#l-pass', process.env.E2E_ADMIN_PASSWORD);
  await admin.click('#lf button[type=submit]');
  await admin.waitForSelector('#logout', { timeout: 15000 });
  await admin.goto(ADMIN + '/#/konzultacie');
  const row = admin.locator('.rc', { hasText: `E2E konzultácia ${RUN}` }).first();
  await row.waitFor({ timeout: 15000 });
  const rowTxt = (await row.textContent()).replace(/\s+/g, ' ');
  rec('admin-zoznam-konzultacii', /E2E konzultácia/.test(rowTxt) || /Konzultačná/.test(rowTxt), { rowTxt: rowTxt.slice(0, 200) });
  await row.click();
  await admin.waitForSelector('#b-back', { timeout: 15000 });
  const detTxt = (await admin.textContent('#view .card-b')).replace(/\s+/g, ' ');
  rec('admin-detail-zaplatenej-konzultacie', await admin.locator('#b-cancel').count() === 0 && /zrušením objednávky/.test(detTxt), { detTxt: detTxt.slice(0, 300) });
  await shot(admin, '51-admin-konzultacia-detail');
  await admin.locator('#view .card-b a[data-ord]', { hasText: 'otvoriť objednávku' }).click();
  await admin.waitForSelector('#o-cancel', { timeout: 15000 });
  await admin.click('#o-cancel');
  await admin.waitForSelector('#omsg .notice, #omsg .err', { timeout: 30000 });
  const omsg = (await admin.textContent('#omsg')).trim();
  await admin.waitForTimeout(3000);
  const bk2 = sql(`select status from booking where id='${bookingId}'`);
  const mails = sql(`select string_agg(template, ',') from notification where "to"='${email}'`);
  rec('admin-zrusenie-objednavky-zrusi-termin', /zrušená/.test(omsg) && bk2 === 'canceled' && /booking-cancel/.test(mails), { omsg, bk2, mails });
  await shot(admin, '52-admin-konzultacia-zrusena');
} catch (e) {
  rec('chyba', false, { message: e.message.split('\n')[0] });
  await shot(page, 'booking-chyba').catch(() => {});
} finally {
  writeFileSync(`${OUT}/e2e-booking.json`, JSON.stringify({ at: new Date().toISOString(), email, bookingId, results, calls, consoleErrors }, null, 2));
  console.log('calls:', calls.filter(c => !/ 20\d$/.test(c)).join(' | '));
  console.log('pageerrors:', consoleErrors.slice(0, 6));
  await browser.close();
}
