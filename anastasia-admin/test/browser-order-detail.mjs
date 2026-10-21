// Prehliadačový test: objednávka – fakturačná adresa, poznámky s autorom, úprava adries,
// zrušenie s dôvodom a dôvod vrátenia peňazí.
// Spustenie: ADMIN_URL=… ADMIN_TEST_PASSWORD=… node anastasia-admin/test/browser-order-detail.mjs
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || pathToFileURL('/Users/lucky/hra-studio54/node_modules/playwright/index.mjs').href);
const base = process.env.ADMIN_URL || 'http://127.0.0.1:4178';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw Error('Use a local admin preview only');
const pass = process.env.ADMIN_TEST_PASSWORD;
if (!pass) throw Error('Set ADMIN_TEST_PASSWORD for the local admin');
const email = process.env.ADMIN_TEST_EMAIL || process.env.ADMIN_EMAIL || 'admin@anastasia.local';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
let checks = 0;
const assert = (ok, msg) => { if (!ok) throw Error(msg); checks++; };

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
};
const apiJson = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });
const preflight = (route) => route.fulfill({ status: 204, headers: CORS, body: '' });

const state = { canceled: null, note: null, updated: null, refund: null };
const order = {
  id: 'order_1', display_id: '12', status: 'pending', payment_status: 'captured', fulfillment_status: 'not_fulfilled',
  total: 5000, currency_code: 'eur', created_at: '2026-10-20T10:00:00.000Z', email: 'zákaznik@anastasia.test',
  metadata: { anastasia_notes: [{ body: 'zákazník si želá zabalenie daru', by: 'user_1', by_email: 'lucia@anastasia.sk', at: '2026-10-20T12:00:00.000Z' }] },
  shipping_address: { first_name: 'Jozef', last_name: 'Kováč', address_1: 'Sokolská 88', postal_code: '960 01', city: 'Zvolen', country_code: 'SK', phone: '+421 900 000 000' },
  billing_address: { first_name: 'Jozef', last_name: 'Kováč', address_1: 'Obchodská 1', postal_code: '811 01', city: 'Bratislava', country_code: 'SK' },
  items: [{ id: 'item_1', title: 'Tvoj pleťový krém', quantity: 1, total: 5000, unit_price: 5000, variant_sku: 'EP.001' }],
  shipping_methods: [{ name: 'Kuriér', amount: 0, total: 0 }],
  payment_collections: [{ payments: [{ id: 'pay_1', provider_id: 'pp_stripe_stripe', amount: 5000, captured_at: '2026-10-20T10:05:00.000Z', captures: [{ amount: 5000 }], refunds: [] }] }],
  fulfillments: [],
};

const orderHandler = async (route) => {
  if (route.request().method() === 'OPTIONS') return preflight(route);
  const req = route.request();
  const url = new URL(req.url());
  if (req.method() === 'POST' && url.pathname === '/admin/nexus/orders/order_1/cancel') {
    state.canceled = req.postDataJSON() || {};
    return apiJson(route, { order_id: 'order_1', canceled: true, reason: state.canceled.reason, by: 'user_1', at: new Date().toISOString() });
  }
  if (req.method() === 'POST' && url.pathname === '/admin/nexus/orders/order_1/notes') {
    state.note = req.postDataJSON() || {};
    return apiJson(route, { note: { body: state.note.body, by: 'user_1', by_email: 'lucia@anastasia.sk', at: new Date().toISOString() } }, 201);
  }
  if (req.method() === 'POST' && url.pathname === '/admin/orders/order_1') {
    state.updated = req.postDataJSON() || {};
    return apiJson(route, { order: { ...order, ...state.updated } });
  }
  if (req.method() === 'POST' && /\/admin\/payments\/pay_1\/refund/.test(url.pathname)) {
    state.refund = req.postDataJSON() || {};
    return apiJson(route, { payment: { id: 'pay_1' } });
  }
  if (req.method() === 'GET' && /\/admin\/orders\/order_1$/.test(url.pathname)) return apiJson(route, { order });
  if (req.method() === 'GET') return apiJson(route, { orders: [order], count: 1 });
  return apiJson(route, {});
};
await page.route('**/admin/nexus/orders/**', orderHandler);
await page.route('**/admin/payments/**', orderHandler);
await page.route('**/admin/orders**', orderHandler);

try {
  const apiOrigin = (process.env.ADMIN_API_ORIGIN || 'https://anastasia-test-api.l-code-dynamics.com').replace(/\/+$/, '');
  const loginRes = await fetch(`${apiOrigin}/auth/user/emailpass`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: pass }) });
  const loginData = await loginRes.json().catch(() => ({}));
  if (!loginData.token) throw Error('Prihlásenie do testovacieho API zlyhalo: ' + (loginData.message || 'neznámy dôvod'));
  await page.addInitScript((t) => { localStorage.setItem('ana_token', t); }, loginData.token);
  await page.goto(base + '/');
  await page.waitForSelector('#logout');

  await page.goto(base + '/#/objednavky');
  await page.waitForSelector('#view tbody tr[data-id]', { timeout: 15000 });
  await page.locator('#view tbody tr[data-id]').first().click();
  await page.waitForSelector('#o-save, #o-print-label', { timeout: 10000 });

  // 1) Fakturačná adresa je viditeľná
  const prehlad = await page.locator('#view').innerText();
  assert(prehlad.includes('Fakturačná adresa'), 'chýba fakturačná adresa');
  assert(prehlad.includes('Obchodská 1'), 'fakturačná adresa sa nezobrazila');
  assert(prehlad.includes('iná než doručovacia'), 'chýba rozlíšenie adries');

  // 2) Poznámky s autorom a časom
  assert(prehlad.includes('Poznámky k objednávke'), 'chýba sekcia poznámok');
  assert(prehlad.includes('zákazník si želá zabalenie daru'), 'poznámka sa nezobrazila');
  assert(prehlad.includes('lucia@anastasia.sk'), 'autor poznámky sa nezobrazil');

  // 3) Nová poznámka ide cez trasu s autorom
  await page.fill('#o-note', 'zákazník si zelá poslať cez DPDS');
  await page.click('#o-note-save');
  await page.waitForTimeout(900);
  assert(state.note && state.note.body === 'zákazník si zelá poslať cez DPDS', 'poznámka sa neposlala: ' + JSON.stringify(state.note));

  // 4) Úprava adries
  await page.locator('#view details summary', { hasText: 'Upraviť doručovaciu' }).first().click();
  await page.waitForSelector('#ad-1');
  await page.fill('#ad-1', 'Nová ulica 5');
  await page.uncheck('#ad-same');
  await page.waitForTimeout(200);
  await page.fill('#bf-1', 'Fakturačná 7');
  await page.click('#o-addr-save');
  await page.waitForTimeout(900);
  assert(state.updated && state.updated.shipping_address?.address_1 === 'Nová ulica 5', 'doručovacia adresa sa neposlala: ' + JSON.stringify(state.updated));
  assert(state.updated && state.updated.billing_address?.address_1 === 'Fakturačná 7', 'fakturačná adresa sa neposlala');

  // 5) Zrušenie objednávky: dôvod je povinný
  await page.click('#o-cancel');
  await page.waitForSelector('#o-cancel-reason');
  await page.click('#o-cancel-go');
  await page.waitForTimeout(500);
  assert((await page.locator('#omsg').innerText()).includes('dôvod zrušenia'), 'chýba upozornenie na dôvod zrušenia');
  assert(!state.canceled, 'objednávka sa zrušila bez dôvodu');

  page.on('dialog', (d) => d.accept());
  await page.fill('#o-cancel-reason', 'zákazník zrušil telefonicky');
  await page.click('#o-cancel-go');
  await page.waitForTimeout(900);
  assert(state.canceled && state.canceled.reason === 'zákazník zrušil telefonicky', 'dôvod zrušenia sa neposlal: ' + JSON.stringify(state.canceled));

  // 6) Dôvod vrátenia peňazí je povinný
  await page.locator('#view .tab', { hasText: 'Platby' }).first().click();
  await page.waitForTimeout(400);
  const refBtn = page.locator('[data-ref="pay_1"]');
  if (await refBtn.count()) {
    await refBtn.click();
    await page.waitForTimeout(400);
    assert((await page.locator('#omsg').innerText()).includes('dôvod vrátenia'), 'chýba upozornenie na dôvod vrátenia');
    assert(!state.refund, 'vrátenie prebehlo bez dôvodu');
    await page.fill('[data-refreason="pay_1"]', 'reklamácia – zákazník vracia tovar');
    await refBtn.click();
    await page.waitForTimeout(700);
    assert(state.refund && state.refund.note === 'reklamácia – zákazník vracia tovar', 'dôvod vrátenia sa neposlal: ' + JSON.stringify(state.refund));
  }

  console.log(JSON.stringify({ checks, status: 'PASS' }));
} finally { await browser.close(); }
