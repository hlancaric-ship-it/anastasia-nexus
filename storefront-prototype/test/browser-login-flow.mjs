import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, extname, sep } from 'node:path';

const playwright = await import(process.env.PLAYWRIGHT_MODULE || pathToFileURL('/Users/lucky/hra-studio54/node_modules/playwright/index.mjs').href);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const port = 4188;
const base = `http://127.0.0.1:${port}`;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const u = new URL(req.url, base);
    let f = resolve(root, '.' + decodeURIComponent(u.pathname));
    let s = await stat(f).catch(() => null);
    if (s && s.isDirectory()) {
      f = resolve(f, 'index.html');
      s = await stat(f).catch(() => null);
    }
    if (!s) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime[extname(f)] || 'application/octet-stream' });
    createReadStream(f).pipe(res);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(err.message);
  }
});

await new Promise(r => server.listen(port, '127.0.0.1', r));

const b64url = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
const jwt = payload => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`;
const ACTOR_JWT = jwt({ actor_id: 'cus_test_123', actor_type: 'customer', auth_identity_id: 'au_1' });
const UNBOUND_JWT = jwt({ actor_id: '', actor_type: 'customer', auth_identity_id: 'au_1' });

const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });

try {
  console.log('--- START BROWSER LOGIN FLOW TESTS ---');

  // Test 1: Kontrola čistého načítania prihlasovacej stránky bez TypeError a so správnymi atribútmi
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.route('**/*', route => {
      const u = new URL(route.request().url());
      if (u.origin === base) return route.fallback();
      if (u.pathname.startsWith('/store/') || u.pathname.startsWith('/auth/')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      }
      return route.abort();
    });
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('ERR_CONNECTION_REFUSED')) errors.push(msg.text());
    });

    await page.goto(`${base}/prihlasenie`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('#login-form button[type="submit"]') && !document.querySelector('#login-form button[type="submit"]').disabled);

    assert.equal(errors.length, 0, `Na stránke vznikli chyby: ${errors.join(', ')}`);

    const loginMethod = await page.locator('#login-form').getAttribute('method');
    assert.equal(loginMethod?.toLowerCase(), 'post', 'login-form musí mať method="post"');

    const regMethod = await page.locator('#registration-form').getAttribute('method');
    assert.equal(regMethod?.toLowerCase(), 'post', 'registration-form musí mať method="post"');

    const buttonsDisabled = await page.$$eval('#login-form button', btns => btns.map(b => b.disabled));
    assert.deepEqual(buttonsDisabled, [false, false], 'tlačidlá prihlásenia musia byť po incializácii povolené');

    const statusText = await page.locator('#login-form .form-status').textContent();
    assert.equal(statusText?.trim(), '', 'inicializačný loading status musí byť po načtení prázdny');

    await page.close();
    console.log('✔ Test 1: /prihlasenie načítané bez TypeError, method="post" na oboch formulároch, tlačidlá aktívne');
  }

  // Test 2: URL scrubbing – heslo z GET parametrov musí byť odstránené, ale email a redirect zachované
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const dirtyUrl = `${base}/prihlasenie?email=zakaznik%40anastasia.sk&password=tajneheslo123&heslo=ineheslo&redirect=%2Fucet`;
    await page.goto(dirtyUrl, { waitUntil: 'load' });
    await page.waitForTimeout(100);

    const currentUrl = new URL(page.url());
    assert.equal(currentUrl.searchParams.get('password'), null, 'heslo nesmie zostať v URL');
    assert.equal(currentUrl.searchParams.get('heslo'), null, 'heslo (alias) nesmie zostať v URL');
    assert.equal(currentUrl.searchParams.get('email'), 'zakaznik@anastasia.sk', 'email musí zostať zachovaný v URL');
    assert.equal(currentUrl.searchParams.get('redirect'), '/ucet', 'redirect musí zostať zachovaný v URL');

    await page.close();
    console.log('✔ Test 2: URL scrubbing odstránil heslo a zachoval email + redirect');
  }

  // Test 3: Magic link URL na /prihlasenie/potvrdit – email, token a redirect zostávajú neporušené
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const magicUrl = `${base}/prihlasenie/potvrdit?email=test%40example.sk&token=validToken123&redirect=%2Fucet%23programy`;
    
    // Zastavíme pred confirmMagicLink alebo overíme, že v momente načítania má URL parametre
    let initialUrlChecked = false;
    await page.route('**/auth/**', route => route.abort());
    
    await page.goto(magicUrl, { waitUntil: 'domcontentloaded' });
    const url = new URL(page.url());
    assert.equal(url.searchParams.get('email'), 'test@example.sk', 'magic link musí zachovať email');
    assert.equal(url.searchParams.get('token'), 'validToken123', 'magic link musí zachovať token');
    assert.equal(url.searchParams.get('redirect'), '/ucet#programy', 'magic link musí zachovať redirect');

    await page.close();
    console.log('✔ Test 3: Magic link potvrdzovacia URL zachováva email, token aj redirect');
  }

  // Test 4: Prihlásenie nesprávnym heslom (401)
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.route('**/auth/customer/emailpass', route => route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Invalid credentials' })
    }));

    await page.goto(`${base}/prihlasenie`, { waitUntil: 'load' });
    await page.fill('#login-form input[name="email"]', 'test@example.sk');
    await page.fill('#login-form input[name="password"]', 'ZleHeslo');
    await page.click('#login-form button[type="submit"]');

    await page.waitForFunction(() => document.querySelector('#login-form .form-status')?.textContent.includes('nesedí'));
    const status = await page.locator('#login-form .form-status').textContent();
    assert.ok(status.includes('E-mail alebo heslo nesedí'), 'musí zobraziť zrozumiteľnú chybu');

    const curUrl = new URL(page.url());
    assert.equal(curUrl.searchParams.get('password'), null, 'heslo sa nesmie dostať do URL pri submit');

    await page.close();
    console.log('✔ Test 4: Prihlásenie nesprávnym heslom zobrazí chybu bez úniku hesla do URL');
  }

  // Test 5: Prihlásenie správnym heslom s oneskoreným naviazaním identity (unbound -> refresh -> bound)
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    let refreshCalled = false;

    await page.route('**/auth/customer/emailpass', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: UNBOUND_JWT })
    }));

    await page.route('**/auth/token/refresh', route => {
      refreshCalled = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: ACTOR_JWT })
      });
    });

    await page.goto(`${base}/prihlasenie`, { waitUntil: 'load' });
    await page.fill('#login-form input[name="email"]', 'spravny@example.sk');
    await page.fill('#login-form input[name="password"]', 'SpravneHeslo123');
    await page.click('#login-form button[type="submit"]');

    await page.waitForFunction(() => {
      try { return localStorage.getItem('anastasia.jwt') !== null; } catch { return false; }
    }, { timeout: 3000 });

    const storedJwt = await page.evaluate(() => localStorage.getItem('anastasia.jwt'));
    assert.equal(storedJwt, ACTOR_JWT, 'uložený musí byť naviazaný JWT s actor_id');
    assert.equal(refreshCalled, true, '/auth/token/refresh musel byť zavolaný pre unbound token');

    await page.close();
    console.log('✔ Test 5: Prihlásenie správnym heslom úspešne obnovilo identity token na bound token s actor_id');
  }

  console.log('--- VŠETKY BROWSER TESTY PREŠLI ÚSPEŠNE ---');
} finally {
  await browser.close();
  server.close();
}
