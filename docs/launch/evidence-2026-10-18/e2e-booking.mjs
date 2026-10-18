// Browser E2E č. 6: admin API typ konzultácie + dostupnosť → zákazníčka (store API) termín → košík → pokladňa storefrontu (digitálne, Stripe 4242)
// → booking confirmed → vlastný admin Konzultácie (detail, zrušenie). Storefront nemá UI rezervácie (P1), preto termín a košík cez store API.
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

  // B) Zákazníčka: prihlásenie magic-linkom
  await page.goto(SF + '/prihlasenie');
  await page.fill('#login-form [name=email]', email);
  await page.click('#login-form [type=submit]');
  await page.waitForFunction(() => document.querySelector('#login-form .form-status')?.textContent.trim().length > 0);
  await page.waitForTimeout(2000);
  const link = new URL(sql(`select data->>'url' from notification where template='magic-link-sk' and data->>'url' like '%${encodeURIComponent(email)}%' order by created_at desc limit 1`));
  await page.goto(SF + link.pathname + link.search);
  await page.waitForFunction(() => document.querySelector('#magic-confirm')?.textContent.trim().length > 0, null, { timeout: 15000 });
  rec('prihlasenie', /Vitajte/.test(await page.textContent('#magic-confirm')), { msg: (await page.textContent('#magic-confirm')).trim().slice(0, 120) });

  // C) Store API v kontexte prihlásenej zákazníčky: sloty → rezervácia → košík → pripojenie
  const store = await page.evaluate(async ({ API, productId, variantId, WEEK }) => {
    const cfg = globalThis.__ANASTASIA_CONFIG__ || {};
    const st = localStorage.getItem('anastasia.jwt') ? localStorage : sessionStorage; const jwt = st.getItem('anastasia.jwt');
    const h = { 'content-type': 'application/json', 'x-publishable-api-key': cfg.publishableKey, authorization: `Bearer ${jwt}` };
    const call = async (m, p, b) => { const r = await fetch(API + p, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined }); return { s: r.status, d: await r.json().catch(() => null) }; };
    const slots = await call('GET', `/store/booking-slots?product_id=${productId}&from=${WEEK}&to=${WEEK}`);
    const slot = slots.d?.slots?.[0];
    if (!slot) return { slots };
    const b = await call('POST', '/store/bookings', { product_id: productId, starts_at: slot.starts_at || slot.start });
    const taken = await call('GET', `/store/booking-slots?product_id=${productId}&from=${WEEK}&to=${WEEK}`);
    const cart = await call('POST', '/store/carts', { region_id: cfg.regionId });
    const cartId = cart.d?.cart?.id;
    const li = await call('POST', `/store/carts/${cartId}/line-items`, { variant_id: variantId, quantity: 1 });
    await call('POST', `/store/carts/${cartId}/customer`, {});
    const attach = await call('POST', `/store/bookings/${b.d?.booking?.id}/cart`, { cart_id: cartId });
    st.setItem('anastasia.cart', cartId);
    return { slotsN: slots.d?.slots?.length, slot, booking: b.s, bookingId: b.d?.booking?.id, bookingStatus: b.d?.booking?.status, takenN: taken.d?.slots?.length, cart: cart.s, cartId, li: li.s, attach: attach.s, attachD: attach.d };
  }, { API, productId: type.id, variantId: type.variant_id, WEEK });
  bookingId = store.bookingId || '';
  rec('store-sloty-a-rezervacia', store.slotsN > 0 && store.booking === 201 && store.takenN < store.slotsN, store);
  rec('store-pripojenie-ku-kosiku', store.li === 200 && store.attach === 200, { li: store.li, attach: store.attach, d: store.attachD });

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
