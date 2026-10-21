// Prehliadačový test: nová správa zákazníkovi (Správy → Nová správa a tlačidlo v detaile zákazníka).
// Spustenie: ADMIN_URL=… ADMIN_TEST_PASSWORD=… node anastasia-admin/test/browser-new-message.mjs
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

const state = { sent: null, conversations: [] };
const customer = { id: 'cus_1', email: 'zákaznik@anastasia.test', first_name: 'Jozef', last_name: 'Kováč' };

await page.route('**/admin/customers**', async (route) => {
  if (route.request().method() === 'OPTIONS') return preflight(route);
  const url = new URL(route.request().url());
  if (url.pathname === '/admin/customers' && url.searchParams.get('q')) return apiJson(route, { customers: [customer], count: 1 });
  if (url.pathname !== '/admin/customers') return apiJson(route, { customer: { ...customer, has_account: true, created_at: new Date().toISOString(), groups: [] } });
  return apiJson(route, { customers: [customer], count: 1 });
});
await page.route('**/admin/chat/templates**', async (route) => {
  if (route.request().method() === 'OPTIONS') return preflight(route);
  return apiJson(route, { templates: [{ id: 'tpl_1', title: 'Pozvanie na odber noviniek', text: 'Zdraváme vás! Ak vás zaujímajú novinky, prihláste sa na náš newsletter.' }] });
});
await page.route('**/admin/chat/conversations**', async (route) => {
  if (route.request().method() === 'OPTIONS') return preflight(route);
  const req = route.request();
  const url = new URL(req.url());
  if (req.method() === 'POST' && url.pathname === '/admin/chat/conversations') {
    const body = req.postDataJSON() || {};
    state.sent = body;
    state.conversations = [{ id: 'chconv_1', subject: body.subject || 'Správa z administrácie', status: 'open', messages: [{ id: 'msg_1', author: 'lucia', body: body.body, created_at: new Date().toISOString() }] }];
    return apiJson(route, { conversation_id: 'chconv_1', message: { id: 'msg_1', author: 'lucia', body: body.body, created_at: new Date().toISOString() } }, 201);
  }
  if (req.method() === 'GET' && url.pathname === '/admin/chat/conversations/chconv_1') {
    return apiJson(route, {
      conversation: { id: 'chconv_1', subject: 'Správa z administrácie', status: 'open', customer: { id: customer.id, name: 'Jozef Kováč', email: customer.email } },
      messages: state.conversations[0]?.messages || [],
    });
  }
  if (req.method() === 'GET') return apiJson(route, { conversations: [], count: 0, unread: 0 });
  return apiJson(route, {});
});

try {
  const apiOrigin = (process.env.ADMIN_API_ORIGIN || 'https://anastasia-test-api.l-code-dynamics.com').replace(/\/+$/, '');
  const loginRes = await fetch(`${apiOrigin}/auth/user/emailpass`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: pass }) });
  const loginData = await loginRes.json().catch(() => ({}));
  if (!loginData.token) throw Error('Prihlásenie do testovacieho API zlyhalo: ' + (loginData.message || 'neznámy dôvod'));
  await page.addInitScript((t) => { localStorage.setItem('ana_token', t); }, loginData.token);
  await page.goto(base + '/');
  await page.waitForSelector('#logout');

  // --- Správy → Nová správa ---
  await page.goto(base + '/#/spravy');
  await page.waitForSelector('#sp-new');
  assert(await page.locator('#sp-new').count() === 1, 'chýba tlačidlo Nová správa');
  await page.click('#sp-new');
  await page.waitForSelector('#nm-search');
  // bez zákazníka sa nepošle
  await page.fill('#nm-body', 'Dobrý deň');
  await page.click('#nm-send');
  await page.waitForTimeout(400);
  assert((await page.locator('#nm-msg').innerText()).includes('vyberte zákazníka'), 'chýba upozornenie na výber zákazníka');

  // vyhľadanie a výber zákazníka
  await page.fill('#nm-search', 'kovac');
  await page.waitForSelector('#nm-results [data-c]', { timeout: 10000 });
  await page.locator('#nm-results [data-c]').first().click();
  await page.waitForTimeout(300);
  assert((await page.locator('#nm-chosen').innerText()).includes('Jozef Kováč'), 'zákazník sa nezobrazil');

  // šablóna odpovede sa vloží do textu
  await page.click('#nm-tpl');
  await page.waitForSelector('#nm-tpl-list [data-tpl]', { timeout: 10000 });
  await page.locator('#nm-tpl-list [data-tpl]').first().click();
  await page.waitForTimeout(200);
  assert((await page.locator('#nm-body').inputValue()).includes('newsletter'), 'šablóna sa nevložila');

  // odoslanie
  await page.fill('#nm-subject', 'Objednávka #12 – doprava');
  await page.click('#nm-send');
  await page.waitForSelector('#c-thread', { timeout: 10000 });
  assert(state.sent && state.sent.customer_id === customer.id, 'zákazník sa neposlal: ' + JSON.stringify(state.sent));
  assert(state.sent.body.includes('newsletter'), 'text správy sa neposlal');
  assert(state.sent.subject === 'Objednávka #12 – doprava', 'téma sa neposlala');
  const thread = await page.locator('#c-thread').innerText();
  assert(thread.includes('newsletter'), 'správa sa nezobrazila v konverzácii');

  // --- Detail zákazníka: tlačidlo Napísať správu ---
  await page.goto(base + '/#/zakaznicky');
  await page.waitForSelector('#view tbody tr[data-id]', { timeout: 15000 });
  await page.locator('#view tbody tr[data-id]').first().click();
  await page.waitForSelector('#cu-msg', { timeout: 10000 });
  await page.click('#cu-msg');
  await page.waitForSelector('#nm-search');
  await page.waitForTimeout(400);
  assert((await page.locator('#nm-chosen').innerText()).includes('Jozef Kováč'), 'zákazník nebol predvybraný');

  console.log(JSON.stringify({ checks, status: 'PASS' }));
} finally { await browser.close(); }
