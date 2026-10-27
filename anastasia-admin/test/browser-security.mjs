// Prehliadačový test zabezpečenia administrácie: 2FA (QR z otpauth_url, overenie kódu,
// záložné kódy) a role vlastník/asistent (skrytie sekcií, ktoré asistent nespravuje).
// Spustenie: ADMIN_TEST_PASSWORD=… node anastasia-admin/test/browser-security.mjs
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

// Stav testu: rola prihláseného správcu a stav 2FA (serverové trasy v teste nahradzujeme).
const state = {
  role: 'owner',
  enrolled: false,
  factorId: '',
  secret: '',
  codes: [],
  calls: [],
};

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
  'access-control-max-age': '600',
};
const apiJson = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });
// Pre-flight (OPTIONS) musí prejsť, inak by prehliadač zablokoval požiadavku.
const preflight = (route) => route.fulfill({ status: 204, headers: CORS, body: '' });
const admins = () => ([
  { id: 'user_test', email: 'lucia@anastasia.sk', first_name: 'Lucia', last_name: 'Horská', role: state.role },
  { id: 'user_asistent', email: 'asistent@anastasia.sk', first_name: 'Peter', last_name: 'Novák', role: 'assistant' },
]);

await page.route('**/admin/nexus/admin-2fa**', async (route) => {
  const req = route.request();
  state.calls.push(`${req.method()} ${new URL(req.url()).pathname}`);
  const url = new URL(req.url());
  if (req.method() === 'GET') return apiJson(route, { enrolled: state.enrolled, provider: 'totp', factor_id: state.factorId || null, recovery_codes_remaining: state.codes.length, role: state.role });
  if (req.method() === 'POST' && url.pathname.endsWith('/verify')) {
    const body = req.postDataJSON() || {};
    if (String(body.code || '').trim() !== '123456') return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Kód sa nepodarilo overiť. Skúte to znova.' }) });
    state.enrolled = true; state.factorId = 'authmfa_test'; state.codes = ['A1B2-C3D4', 'E5F6-G7H8', 'I9J0-K1L2'];
    return apiJson(route, { enabled: true, recovery_codes: state.codes });
  }
  if (req.method() === 'POST' && url.pathname.endsWith('/recovery-codes')) {
    const body = req.postDataJSON() || {};
    if (String(body.code || '').trim() !== '123456') return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'Kód z aplikácie sa nepodarilo overiť.' }) });
    state.codes = ['N1EW-C0DE', 'V2AL-UE01', 'X3MP-LE02'];
    return apiJson(route, { recovery_codes: state.codes });
  }
  if (req.method() === 'POST') {
    state.factorId = 'authmfa_test'; state.secret = 'JBSWY3DPEHPK3PXP';
    return apiJson(route, { factor_id: state.factorId, secret: state.secret, otpauth_url: 'otpauth://totp/ANASTASIA:lucia@anastasia.sk?secret=JBSWY3DPEHPK3PXP&issuer=ANASTASIA' });
  }
  if (req.method() === 'DELETE') {
    const body = req.postDataJSON() || {};
    if (String(body.code || '').trim() !== '123456') return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Kód sa nepodarilo overiť. Dvojfaktorové overenie zostáva zapnuté.' }) });
    state.enrolled = false; state.codes = [];
    return apiJson(route, { enabled: false });
  }
  return apiJson(route, {});
});
await page.route('**/admin/nexus/admin-roles**', async (route) => {
  const req = route.request();
  state.calls.push(`${req.method()} ${new URL(req.url()).pathname}`);
  if (req.method() === 'POST') {
    const body = req.postDataJSON() || {};
    if (body.role === 'assistant' && body.user_id === 'user_test') return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Posledného vlastníka administrácie nemožno znížiť na asistenta.' }) });
    return apiJson(route, { user_id: body.user_id, role: body.role });
  }
  return apiJson(route, { admins: admins(), roles: ['owner', 'assistant'], current_user_id: 'user_test' });
});

try {
  // Prihlásenie robíme z Node (testovacie API nepustí prihlásenie z lokálnej adresy),
  // prehliadač dostane hotový token.
  const apiOrigin = (process.env.ADMIN_API_ORIGIN || 'https://anastasia-test-api.l-code-dynamics.com').replace(/\/+$/, '');
  const loginRes = await fetch(`${apiOrigin}/auth/user/emailpass`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: pass }) });
  const loginData = await loginRes.json().catch(() => ({}));
  if (!loginData.token) throw Error('Prihlásenie do testovacieho API zlyhalo: ' + (loginData.message || 'neznámy dôvod'));
  await page.addInitScript((t) => { localStorage.setItem('ana_token', t); }, loginData.token);
  await page.goto(base + '/');
  await page.waitForSelector('#logout');

  // --- Zabezpečenie: 2FA ---
  await page.goto(base + '/#/nastavenia');
  await page.waitForSelector('#actions .pill');
  assert(await page.locator('#actions .pill', { hasText: 'Zabezpečenie' }).count() === 1, 'chýba záložka Zabezpečenie');
  await page.locator('#actions .pill', { hasText: 'Zabezpečenie' }).first().click();
  await page.waitForSelector('#s-enroll');
  assert((await page.locator('#view').innerText()).includes('vypnuté'), 'stav 2FA sa nezobrazil');

  await page.click('#s-enroll');
  await page.waitForSelector('#s-verify');
  const qr = await page.locator('#view svg.qr-svg').count();
  assert(qr === 1, 'QR kód sa nevykreslil');
  const qrPath = await page.locator('#view svg.qr-svg path').getAttribute('d');
  assert(qrPath && qrPath.length > 500, 'QR kód nemá obsah');
  assert((await page.locator('#view').innerText()).includes(state.secret), 'tajomstvo sa nezobrazilo');

  // chybný kód → vecná hláška
  await page.fill('#s-code', '000000');
  await page.click('#s-verify button[type=submit]');
  await page.waitForTimeout(600);
  assert((await page.locator('#view').innerText()).includes('Kód sa nepodarilo overiť'), 'chybový kód bez hlásky');

  // správny kód → záložné kódy
  await page.fill('#s-code', '123456');
  await page.click('#s-verify button[type=submit]');
  await page.waitForSelector('#s-codes-download');
  const codesText = await page.locator('#view').innerText();
  for (const c of state.codes) assert(codesText.includes(c), 'záložný kód chýba: ' + c);
  assert(codesText.includes('Vytlačiť kódy'), 'chýba tlačenie záložných kódov');
  assert(codesText.includes('Stiahnuť kódy'), 'chýba stiahnutie záložných kódov');

  // nové záložné kódy
  await page.click('#s-newcodes');
  await page.waitForSelector('#s-newcodes-form:not([hidden])');
  await page.fill('#s-newcodes-code', '000000');
  await page.click('#s-newcodes-form button[type=submit]');
  await page.waitForTimeout(700);
  assert((await page.locator('#view').innerText()).includes('nepodarilo overiť'), 'nové kódy bez platného kódu neboli odmietnuté');
  await page.fill('#s-newcodes-code', '123456');
  await page.click('#s-newcodes-form button[type=submit]');
  await page.waitForTimeout(700);
  assert((await page.locator('#view').innerText()).includes('N1EW-C0DE'), 'nové záložné kódy sa nevygenerovali');

  // vypnutie bez kódu → chyba; s kódom → vypnuté
  await page.click('#s-disable');
  await page.waitForSelector('#s-disable-form:not([hidden])');
  await page.fill('#s-disable-code', '000000');
  await page.click('#s-disable-form button[type=submit]');
  await page.waitForTimeout(700);
  assert((await page.locator('#view').innerText()).includes('zostáva zapnuté'), 'vypnutie bez platného kódu nebolo odmietnuté');
  await page.fill('#s-disable-code', '123456');
  await page.click('#s-disable-form button[type=submit]');
  await page.waitForSelector('#s-enroll');
  assert((await page.locator('#view').innerText()).includes('vypnuté'), '2FA sa nevypnula');

  // --- role ---
  const roleRows = await page.locator('#view table tbody tr').count();
  assert(roleRows === 2, 'zoznam administrátorov má iný počet riadkov: ' + roleRows);
  assert(await page.locator('#role-user_asistent').count() === 1, 'chýba výber role pre asistenta');
  await page.selectOption('#role-user_asistent', 'owner');
  await page.locator('[data-save-role="user_asistent"]').click();
  await page.waitForTimeout(700);
  assert((await page.locator('#view').innerText()).includes('Rola je uložená'), 'uloženie role nepotvrdilo');
  // posledný vlastník: serverová chyba sa zobrazí
  await page.selectOption('#role-user_test', 'assistant');
  await page.locator('[data-save-role="user_test"]').click();
  await page.waitForTimeout(700);
  assert((await page.locator('#view').innerText()).includes('Posledného vlastníka'), 'chybová hláška pri poslednom vlastníkovi chýba');

  // --- asistent: skryté sekcie ---
  state.role = 'assistant';
  await page.goto(base + '/#/');
  await page.reload(); // rolu treba načítať znova (načíta sa pri štarte aplikácie)
  await page.waitForTimeout(1500);
  const nav = await page.locator('#sidebar .nav-item').allInnerTexts();
  assert(!nav.some(t => /Poukazy/.test(t)), 'asistent vidí sekciu Poukazy a zľavy: ' + nav.join('|'));
  assert(nav.some(t => /Objednávky/.test(t)), 'asistent nemá sekciu Objednávky');

  // priamy prechod na zakázanú sekciu → zablokovaná
  await page.goto(base + '/#/poukazy');
  await page.waitForTimeout(1200);
  assert((await page.locator('#view').innerText()).includes('nemáte prístup'), 'zakázaná sekcia sa otvorila');

  // Zabezpečenie a vernostné úrovne sa asistentovi nezobrazia
  await page.goto(base + '/#/nastavenia');
  await page.waitForSelector('#actions .pill');
  const pills = await page.locator('#actions .pill').allInnerTexts();
  assert(!pills.some(t => /Zabezpečenie/.test(t)), 'asistent vidí záložku Zabezpečenie');
  assert(!pills.some(t => /Vernostné/.test(t)), 'asistent vidí záložku Vernostné úrovne');

  // ceny v produkte sa asistentovi nezobrazia
  await page.goto(base + '/#/produkty');
  await page.waitForTimeout(1500);
  if (await page.locator('#view tbody tr[data-id]').count()) {
    await page.locator('#view tbody tr[data-id]').first().click();
    await page.waitForSelector('#p-save');
    assert(await page.locator('#p-price').count() === 0, 'asistent vidí pole na cenu');
    assert((await page.locator('#view').innerText()).includes('Ceny a akcie spravuje vlastník'), 'chýba vysvetlenie k cenám');
  }

  // pridanie úrovne zákazníkovi sa asistentovi nezobrazí
  await page.goto(base + '/#/zakaznicky');
  await page.waitForTimeout(1500);
  if (await page.locator('#view input[type=checkbox][data-pick]').count()) {
    await page.locator('#view input[type=checkbox][data-pick]').first().check();
    await page.waitForTimeout(400);
    assert(await page.locator('#cu-assign').count() === 0, 'asistent vidí priraďovanie úrovne');
  }

  // --- prihlásenie s kódom (2FA) ---
  // Jadro pri zapnutom 2FA vráti výzvu na kód; administrácia má pýtať kód a overiť ho.
  const clean = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const cleanPage = await clean.newPage();
  await cleanPage.route('**/auth/user/emailpass', async (route) => {
    if (route.request().method() === 'OPTIONS') return preflight(route);
    return apiJson(route, { mfa_required: true, mfa_challenge: { id: 'ch_test', methods: ['totp', 'recovery_code'] } });
  });
  await cleanPage.route('**/auth/mfa/challenges/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return preflight(route);
    const body = route.request().postDataJSON() || {};
    if (String(body.code || '').trim() !== '123456') return route.fulfill({ status: 401, contentType: 'application/json', headers: CORS, body: JSON.stringify({ message: 'Kód sa nepodarilo overiť.' }) });
    return apiJson(route, { token: loginData.token });
  });
  await cleanPage.goto(base + '/');
  await cleanPage.fill('#l-email', email);
  await cleanPage.fill('#l-pass', pass);
  await cleanPage.click('#lf button[type=submit]');
  await cleanPage.waitForSelector('#l-code', { timeout: 15000 });
  assert((await cleanPage.locator('#lf h1').innerText()).includes('Overenie'), 'krok s kódom sa nezobrazil');
  await cleanPage.fill('#l-code', '000000');
  await cleanPage.click('#lf button[type=submit]');
  await cleanPage.waitForTimeout(1200);
  assert((await cleanPage.locator('#lf').innerText()).includes('Kód sa nepodarilo overiť'), 'chybný kód pri prihlásení bez hlásky');
  await cleanPage.fill('#l-code', '123456');
  await cleanPage.click('#lf button[type=submit]');
  await cleanPage.waitForSelector('#logout', { timeout: 15000 });
  assert(true, 'prihlásenie s kódom prejde');
  await clean.close();

  console.log(JSON.stringify({ checks, status: 'PASS' }));
} finally { await browser.close(); }
