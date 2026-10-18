// Bezpečnostný audit proti lokálnemu backendu: RBAC admin/store, IDOR, webhooky, shop-prices, cenová manipulácia, idempotencia.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const API = 'http://127.0.0.1:9100';
const sql = (q) => execFileSync('psql', ['-h', '127.0.0.1', '-U', 'lucky', 'anastasia_launch_e2e', '-Atc', q]).toString().trim();
const PK = sql("select token from api_key where title='ANASTASIA storefront'");
const REGION = sql("select id from region where name='Slovensko'");
const results = [];
const rec = (step, ok, detail) => { results.push({ step, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', step, detail ? JSON.stringify(detail).slice(0, 400) : ''); };
async function call(path, { method = 'GET', body, token, pk = true, headers = {} } = {}) {
  const h = { 'content-type': 'application/json', ...headers };
  if (pk) h['x-publishable-api-key'] = PK;
  if (token) h.authorization = `Bearer ${token}`;
  const r = await fetch(API + path, { method, headers: h, body: body === undefined ? (method === 'GET' ? undefined : '{}') : (typeof body === 'string' ? body : JSON.stringify(body)) });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
async function customerToken(email) {
  await call('/auth/customer/magic-link', { method: 'POST', body: { email } });
  await new Promise(r => setTimeout(r, 1500));
  const u = new URL(sql(`select data->>'url' from notification where template='magic-link-sk' and data->>'url' like '%${encodeURIComponent(email)}%' order by created_at desc limit 1`));
  let t = (await call('/auth/customer/magic-link', { method: 'POST', body: { email, token: u.searchParams.get('token') } })).data?.token;
  if ((await call('/store/customers/me', { token: t })).status === 401) {
    await call('/store/customers', { method: 'POST', body: { email }, token: t });
    t = (await call('/auth/token/refresh', { method: 'POST', token: t })).data?.token;
  }
  return t;
}

const RUN = Date.now().toString(36);
const admin = (await call('/auth/user/emailpass', { method: 'POST', pk: false, body: { email: 'admin@anastasia.local', password: process.env.E2E_ADMIN_PASSWORD } })).data?.token;
const cust = await customerToken(`audit.${RUN}@example.com`);
rec('tokeny', !!admin && !!cust);

// 1) Všetky vlastné admin routy: bez prihlásenia a s tokenom zákazníčky musia vrátiť 401/403.
const routes = JSON.parse(execFileSync('python3', ['-c', `import json;d=json.load(open('/Users/lucky/anastasia-nexus-claude-integration/backend/docs/wp/admin-function-map.json'));print(json.dumps([[r['path'],r['methods']] for r in d['custom_routes'] if 'custom_routes' in d] if 'custom_routes' in d else [[r['path'],r['methods']] for r in d['routes']]))`]).toString());
const fill = p => p.replace(/:[a-z_]+/g, 'x_audit');
const leaks = [];
let adminChecked = 0;
for (const [path, methods] of routes.filter(([p]) => p.startsWith('/admin'))) {
  for (const m of methods) {
    for (const [who, token] of [['anon', null], ['customer', cust]]) {
      const r = await call(fill(path), { method: m, token, pk: who !== 'anon' });
      adminChecked++;
      if (![401, 403].includes(r.status)) leaks.push({ who, m, path, status: r.status });
    }
  }
}
rec('admin-rbac-vsetky-routy', leaks.length === 0, { checked: adminChecked, leaks });

// 2) Store routy so zákazníckymi dátami bez prihlásenia → 401.
const customerOnly = [['GET', '/store/memberships'], ['GET', '/store/entitlements'], ['GET', '/store/bookings'], ['GET', '/store/chat/status'], ['GET', '/store/chat/conversations'],
  ['POST', '/store/chat/conversations'], ['GET', '/store/customers/me/export'], ['POST', '/store/customers/me/erasure-request'], ['POST', '/store/memberships/x/stop'],
  ['GET', '/store/memberships/x/payment'], ['POST', '/store/bookings/x/cancel'], ['POST', '/store/orders/x/cancel'], ['POST', '/store/withdrawals'], ['POST', '/store/media-access'], ['GET', '/store/orders/x_audit'],
  ['POST', '/store/memberships/checkout']];
const anonLeaks = [];
for (const [m, p] of customerOnly) { const r = await call(p, { method: m }); if (![401, 403].includes(r.status)) anonLeaks.push({ m, p, status: r.status }); }
rec('store-zakaznicke-routy-bez-prihlasenia', anonLeaks.length === 0, { checked: customerOnly.length, anonLeaks });

// 3) IDOR: cudzia zákazníčka nesmie čítať/meniť cudzie záznamy.
const conv = sql('select id from chat_conversation order by created_at desc limit 1');
const mbr = sql("select id from membership where status='active' order by created_at desc limit 1");
const bkg = sql("select id from booking where status='confirmed' order by created_at desc limit 1");
const ord = sql('select id from "order" where customer_id is not null order by created_at desc limit 1');
const idor = [
  ['GET', `/store/chat/conversations/${conv}`], ['POST', `/store/chat/conversations/${conv}/messages`, { body: 'audit' }], ['POST', `/store/chat/conversations/${conv}/read`],
  ['GET', `/store/memberships/${mbr}/payment`], ['POST', `/store/memberships/${mbr}/stop`], ['POST', `/store/memberships/${mbr}/reconcile`],
  ['POST', `/store/bookings/${bkg}/cancel`], ['POST', `/store/bookings/${bkg}/cart`], ['POST', `/store/orders/${ord}/cancel`], ['GET', `/store/orders/${ord}`],
];
const idorLeaks = [];
for (const [m, p, body] of idor) { const r = await call(p, { method: m, token: cust, body }); if (r.status < 400) idorLeaks.push({ m, p, status: r.status }); }
const stillActive = sql(`select status from membership where id='${mbr}'`), stillBooked = sql(`select status from booking where id='${bkg}'`);
rec('idor-cudzie-zaznamy', idorLeaks.length === 0 && stillActive === 'active' && stillBooked === 'confirmed', { idorLeaks, stillActive, stillBooked });

// 4) Webhooky bez platného podpisu.
const hooks = [
  ['/hooks/payment/stripe_stripe', { 'stripe-signature': 't=1,v1=deadbeef' }, { type: 'payment_intent.succeeded', data: { object: { id: 'pi_fake' } } }],
  ['/hooks/payment/membership_stripe_membership', { 'stripe-signature': 't=1,v1=deadbeef' }, { type: 'payment_intent.succeeded', data: { object: { id: 'pi_fake' } } }],
  ['/hooks/nexus/booking-order', { 'x-nexus-timestamp': String(Math.floor(Date.now() / 1000)), 'x-nexus-signature': 'v1=deadbeef' }, { tenantId: 'anastasia' }],
  ['/hooks/nexus/booking-order', {}, { tenantId: 'anastasia' }],
  ['/hooks/ops/edge-events', { 'x-nexus-timestamp': String(Math.floor(Date.now() / 1000)), 'x-nexus-signature': 'v1=deadbeef' }, { events: [] }],
  ['/hooks/ops/edge-events', {}, { events: [] }],
];
const hookRes = [];
for (const [p, headers, body] of hooks) { const r = await call(p, { method: 'POST', pk: false, headers, body }); hookRes.push({ p, sig: Object.keys(headers).length > 0, status: r.status }); }
// Medusa payment webhook vracia 200 a podpis overuje asynchrónne v workflow – kontrolujeme, že nevznikla platba ani objednávka.
const fakeCaptured = sql("select count(*) from payment where data->>'id'='pi_fake'");
rec('webhooky-bez-podpisu', hookRes.filter(h => h.p.startsWith('/hooks/nexus') || h.p.startsWith('/hooks/ops')).every(h => [400, 401, 403, 503].includes(h.status)) && fakeCaptured === '0', { hookRes, fakeCaptured });

// 5) shop-prices: zákazníčka nie, admin len s presnou očakávanou cenou a platnou sumou.
const variant = sql("select pv.id from product_variant pv join product p on p.id=pv.product_id where p.title like 'E2E Ružový olej%' and pv.deleted_at is null order by pv.created_at desc limit 1");
const price = sql(`select pr.id||'|'||pr.amount from price pr join product_variant_price_set vps on vps.price_set_id=pr.price_set_id where vps.variant_id='${variant}' and pr.price_list_id is null and pr.deleted_at is null limit 1`).split('|');
const sp = async (body, token) => (await call(`/admin/shop-prices/${variant}`, { method: 'POST', pk: false, token, body })).status;
const spRes = {
  customer: await sp({ price_id: price[0], amount: 1, expected_amount: Number(price[1]) }, cust),
  negative: await sp({ price_id: price[0], amount: -1, expected_amount: Number(price[1]) }, admin),
  threeDecimals: await sp({ price_id: price[0], amount: 1.234, expected_amount: Number(price[1]) }, admin),
  extraField: await sp({ price_id: price[0], amount: 1, expected_amount: Number(price[1]), currency_code: 'czk' }, admin),
  staleExpected: await sp({ price_id: price[0], amount: 1, expected_amount: Number(price[1]) + 1 }, admin),
  wrongPriceId: await sp({ price_id: 'price_x', amount: 1, expected_amount: Number(price[1]) }, admin),
};
const unchanged = sql(`select amount from price where id='${price[0]}'`);
rec('shop-prices-ochrana', spRes.customer === 401 && spRes.negative === 400 && spRes.threeDecimals === 400 && spRes.extraField === 400 && spRes.staleExpected === 409 && spRes.wrongPriceId === 409 && Number(unchanged) === Number(price[1]), { spRes, before: price[1], after: unchanged });

// 6) Cenová manipulácia zo storefrontu: unit_price / metadata v line-iteme, vlastná cena v nexus-cart.
const cart = (await call('/store/carts', { method: 'POST', body: { region_id: REGION } })).data?.cart?.id;
const li = await call(`/store/carts/${cart}/line-items`, { method: 'POST', body: { variant_id: variant, quantity: 1, unit_price: 1, metadata: { unit_price: 1, nexus_price: 1 } } });
const li2 = await call(`/store/carts/${cart}/line-items`, { method: 'POST', body: { variant_id: variant, quantity: 1, metadata: { unit_price: 1, nexus_price: 1 } } });
const nx = await call('/store/nexus-cart', { method: 'POST', token: cust, body: { cart_id: cart, couponCode: '', unitPrice: 1, lines: [{ variant_id: variant, unit_price: 1 }] } });
const unitAfter = sql(`select unit_price from cart_line_item where cart_id='${cart}' and deleted_at is null`);
rec('cena-nejde-podvrhnut-z-klienta', li.status === 400 && li2.status < 300 && unitAfter !== '' && Number(unitAfter) === Number(price[1]), { unitPriceRejected: li.status, lineItemStatus: li2.status, nexusStatus: nx.status, unitAfter, server: price[1] });

// 7) Idempotencia: replay toho istého Stripe eventu nevytvorí druhú objednávku ani druhú platbu.
writeFileSync('/Users/lucky/.claude/jobs/223fc22a/tmp/launch/evidence/audit-sec.json', JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
