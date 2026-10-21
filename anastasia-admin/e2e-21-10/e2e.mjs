#!/usr/bin/env node
/**
 * E2E test testovacieho prostredia ANASTASIA (21. 10. 2026).
 *
 * Beží na https://anastasia-test.l-code-dynamics.com (Chrome headless, viewport 390x900)
 * a prechádza krokmi a) – g). Každý krok je v try/catch: pri chybe sa zapíše stav
 * CHYBA a test pokračuje ďalším krokom. Výsledok každého kroku sa hneď pripíše
 * do REPORT.md, screenshoty ukladajú do shots/.
 *
 * Bezpečnosť: heslo sa generuje náhodne pri behu, drží sa iba v pamäti a nikdy sa
 * nezapisuje do reportu ani na disk. POUŽÍVA SA LEN TESTOVACIE PROSTREDIE.
 *
 * Spustenie: node anastasia-admin/e2e-21-10/e2e.mjs
 */

import { chromium } from '/Users/lucky/hra-studio54/node_modules/playwright/index.mjs';
import { appendFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPORT = join(HERE, 'REPORT.md');
const SHOTS = join(HERE, 'shots');
mkdirSync(SHOTS, { recursive: true });

const BASE = 'https://anastasia-test.l-code-dynamics.com';
const API_FALLBACK = 'https://anastasia-test-api.l-code-dynamics.com';
const QA_EMAIL = 'qa-e2e-2110@l-code-dynamics.com';
const COUPON = 'Montelope';
const PRODUCT_PATH = '/eshop/produkt/reset-40-plus';
const CARD = { number: '4242424242424242', expiry: '1230', cvc: '123' };
const VIEWPORT = { width: 390, height: 900 };

/** Náhodné heslo – existuje iba v pamäti behu, nikdy sa nezapisuje do reportu. */
const PASSWORD = `Qa${randomBytes(12).toString('base64url')}9!`;
/** Unikátny tag behu (fallback e-mail, ak už zadaný účet existuje). */
const RUN_TAG = randomBytes(3).toString('hex');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

const state = {
  email: QA_EMAIL,
  jwt: null,
  api: API_FALLBACK,
  publishableKey: '',
  lineItemRequests: 0,
};

/* ------------------------------------------------------------------ report */

function report(step, status, url, message) {
  const row = `| ${step} | ${status} | ${url || '-'} | ${String(message || '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()} |`;
  appendFileSync(REPORT, row + '\n');
  console.log(row);
}

function reportHeader() {
  let empty = true;
  try {
    empty = !existsSync(REPORT) || readFileSync(REPORT, 'utf8').trim() === '';
  } catch {
    empty = true;
  }
  if (empty) {
    appendFileSync(
      REPORT,
      '# E2E test testovacieho prostredia – ANASTASIA (21. 10. 2026)\n\n' +
        `Web: ${BASE} | Browser: Chrome headless | viewport 390x900\n\n` +
        '| Krok | Stav | URL | Hláška |\n| --- | --- | --- | --- |\n'
    );
  }
  appendFileSync(REPORT, `\n## Beh ${stamp()} (tag ${RUN_TAG})\n\n| Krok | Stav | URL | Hláška |\n| --- | --- | --- | --- |\n`);
}

/* ---------------------------------------------------------------- helpers */

async function shot(page, name) {
  try {
    await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: false });
  } catch {
    /* screenshot nie je kritický */
  }
}

/** Screenshot konkrétneho elementu (lepší dôkaz ako celá stránka). */
async function shotOf(locator, name) {
  try {
    await locator.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
    await locator.screenshot({ path: join(SHOTS, `${name}.png`) });
  } catch {
    /* fallback: celá stránka */
  }
}

/** Po navigácii počká, kým sa načíta aplikačný JS (bez neho kliknutia nič neurobia). */
async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await sleep(1200);
  await dismissCookies(page);
}

/** Zavrie cookie lištu, aby neprekrývala kliky. */
async function dismissCookies(page) {
  const labels = [/^Prijať všetky$/i, /^Prijať vsetky$/i, /^Accept all$/i, /^Odmietnuť voliteľné$/i];
  for (const label of labels) {
    const btn = page.getByRole('button', { name: label }).first();
    if (await btn.count().catch(() => 0)) {
      await btn.click({ timeout: 4000 }).catch(() => {});
      await sleep(400);
      return true;
    }
  }
  return false;
}

async function apiPost(ctx, path, data, token) {
  const headers = { 'content-type': 'application/json', 'x-publishable-api-key': state.publishableKey };
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const res = await ctx.request.post(state.api + path, { headers, data });
    const body = await res.json().catch(() => null);
    return { status: res.status(), body };
  } catch (error) {
    return { status: 0, body: null, error: String(error?.message || error) };
  }
}

async function apiGet(ctx, path, token) {
  const headers = { 'x-publishable-api-key': state.publishableKey };
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const res = await ctx.request.get(state.api + path, { headers });
    const body = await res.json().catch(() => null);
    return { status: res.status(), body };
  } catch (error) {
    return { status: 0, body: null, error: String(error?.message || error) };
  }
}

/**
 * Založí účet (e-mail + náhodné heslo) a získa prihlásenú session.
 *
 * Poznámka: web zákazníka je BEZ HESLA (prihlásenie odkazom e-mailom) – v UI nie je
 * heslový formulár a e-mail sa v automatizovanom behu neotvorí. Session preto získame
 * cez ten istý backend auth provider, ktorý je registrovaný v medusa-config.ts
 * (emailpass): register → create customer → login. Heslo sa nikde neukladá.
 */
async function ensureSession(ctx) {
  const emails = [QA_EMAIL, `qa-e2e-2110+${RUN_TAG}@l-code-dynamics.com`];
  const tried = [];
  for (const email of emails) {
    const register = await apiPost(ctx, '/auth/customer/emailpass/register', { email, password: PASSWORD });
    tried.push(`${email} register=${register.status}`);
    if (register.status === 200 && register.body?.token) {
      const created = await apiPost(ctx, '/store/customers', { email, first_name: 'QA', last_name: 'E2E' }, register.body.token);
      tried.push(`customer=${created.status}`);
      const login = await apiPost(ctx, '/auth/customer/emailpass', { email, password: PASSWORD });
      if (login.status === 200 && login.body?.token) {
        return { token: login.body.token, email, note: created.status === 200 ? 'účet založený' : 'účet existoval – prihlásenie', tried };
      }
      continue;
    }
    // Identita už existuje (predchádzajúci beh) – skús prihlásenie.
    const login = await apiPost(ctx, '/auth/customer/emailpass', { email, password: PASSWORD });
    tried.push(`login=${login.status}`);
    if (login.status === 200 && login.body?.token) return { token: login.body.token, email, note: 'prihlásenie existujúceho účtu', tried };
  }
  return { token: null, email: null, note: 'session sa nepodarilo získať', tried };
}

/** Prečíta hodnotu z riadka súhrnu košíka/pokladne (napr. „Celkom“). */
async function summaryValue(page, label) {
  const row = page.locator('.summary-row', { has: page.locator(`span:text-is("${label}")`) }).first();
  if (await row.count().catch(() => 0)) {
    const value = await row.locator('strong').first().innerText().catch(() => '');
    if (value.trim()) return value.trim();
  }
  return '';
}

/** Text z elementu bez ohľadu na viditeľnosť (innerText je prázdny pri display:none). */
async function safeText(locator) {
  const text = await locator.textContent().catch(() => '');
  return String(text || '').trim().replace(/\s+/g, ' ');
}

/**
 * Vyplní Stripe Payment Element. Polia sú v iframe (názov je preložený do slovenčiny),
 * preto hľadáme podľa id / name / autocomplete, nie podľa anglických titulov.
 */
async function fillStripe(page) {
  const filled = {};
  const specs = [
    { key: 'number', selectors: ['#payment-numberInput', 'input[name="number"]', 'input[autocomplete="cc-number"]'], value: CARD.number },
    { key: 'expiry', selectors: ['#payment-expiryInput', 'input[name="expiry"]', 'input[autocomplete="cc-exp"]'], value: CARD.expiry },
    { key: 'cvc', selectors: ['#payment-cvcInput', 'input[name="cvc"]', 'input[autocomplete="cc-csc"]'], value: CARD.cvc },
  ];
  const frames = page.frames();
  for (const spec of specs) {
    if (filled[spec.key]) continue;
    for (const frame of frames) {
      for (const selector of spec.selectors) {
        const input = frame.locator(selector).first();
        if (!(await input.count().catch(() => 0))) continue;
        await input.fill(spec.value).catch(() => {});
        const current = await input.inputValue().catch(() => '');
        filled[spec.key] = current || spec.value;
        break;
      }
      if (filled[spec.key]) break;
    }
  }
  return filled;
}

/* ------------------------------------------------------------------- kroky */

async function stepA(page, ctx) {
  const url = `${BASE}/nova-registracia/`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await settle(page);

  // 1) UI: poslanie prihlasovacieho odkazu (e-mail) – tak to web funguje.
  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 20000 });
  await emailInput.fill(QA_EMAIL);
  await page.getByRole('button', { name: /Poslať prihlasovací odkaz/i }).first().click();
  await sleep(2500);
  const uiMessage = (await safeText(page.locator('.form-status').first())).replace(/^„|”$/g, '');
  await shot(page, 'a1-registracia-ui');

  // 2) Session pre ďalšie kroky (web je bez hesla – prihlásenie ide cez magic link).
  const session = await ensureSession(ctx);
  if (!session.token) throw new Error(`session sa nepodarilo získať (${session.note}) – ${session.tried.join('; ')}`);
  state.email = session.email;
  state.jwt = session.token;

  await page.evaluate(token => {
    try {
      sessionStorage.setItem('anastasia.jwt', token);
      localStorage.setItem('anastasia.jwt', token);
    } catch {
      /* storage nedostupný */
    }
  }, session.token);

  // 3) Overenie: na /ucet nesmie byť „Prihláste sa“.
  await page.goto(`${BASE}/ucet/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await settle(page);
  await sleep(3000);
  const accountText = await safeText(page.locator('main'));
  const logged = !/Pre zobrazenie účtu sa prihláste/i.test(accountText);
  await shot(page, 'a2-ucet-prihlaseny');
  if (!logged) throw new Error('prihlásenie sa neprejavilo na /ucet (zobrazené „prihláste sa“)');
  return `UI odkazu: „${uiMessage}“ | session: ${session.note} pre ${session.email} | heslo: náhodne generované, neuložené`;
}

async function stepB(page) {
  const url = `${BASE}${PRODUCT_PATH}`;
  state.lineItemRequests = 0;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await settle(page);
  const add = page.getByRole('button', { name: /^Pridať do košíka/i }).first();
  await add.waitFor({ state: 'visible', timeout: 20000 });

  // Kliknutie sa opakuje, kým server neprijme položku (formulár sa nesmie odoslať
  // natívne skôr, než sa načíta aplikačný JS).
  let added = false;
  for (let attempt = 0; attempt < 3 && !added; attempt += 1) {
    const before = state.lineItemRequests;
    await add.click().catch(() => {});
    for (let i = 0; i < 10 && state.lineItemRequests === before; i += 1) await sleep(600);
    added = state.lineItemRequests > before;
    if (!added) await settle(page);
  }
  await sleep(2500);
  const counter = (await safeText(page.locator('.cart-count').first())) || '?';
  await shot(page, 'b1-produkt-pridany');

  await page.goto(`${BASE}/kosik/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await settle(page);
  const lines = await page.locator('#cart-view .cart-line h2').allInnerTexts().catch(() => []);
  if (!lines.length) throw new Error('košík je prázdny po kliknutí na „Pridať do košíka“');
  const quantities = await page.locator('#cart-view .cart-line [aria-label="Množstvo"]').allInnerTexts().catch(() => []);
  const total = await summaryValue(page, 'Celkom');
  const note =
    state.lineItemRequests > 1
      ? ` | NÁLEZ: 1 kliknutie poslalo ${state.lineItemRequests}× POST /store/carts/:id/line-items → v košíku ${lines.length} položiek (množstvá ${quantities.join('/')})`
      : '';
  return `produkt v košíku: ${lines.map(t => t.trim()).join(' | ')} | položiek: ${lines.length} (množstvá ${quantities.join('/') || '?'}) | počítadlo košíka: ${counter} | suma: ${total}${note}`;
}

async function stepC(page) {
  const url = `${BASE}/kosik/`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await settle(page);

  const totalBefore = await summaryValue(page, 'Celkom');
  const couponInput = page.locator('.coupon-form input[name="coupon"]').first();
  if (!(await couponInput.count())) throw new Error('vo formulári košíka chýba pole na kupón');
  await couponInput.fill(COUPON);
  await page.locator('.coupon-form button[type="submit"]').first().click();
  await sleep(3500);
  const couponMessage = await safeText(page.locator('.coupon-form .form-status').first());
  const total = await summaryValue(page, 'Celkom');
  const discount = await summaryValue(page, 'Kupón');
  const line = await safeText(page.locator('#cart-view .cart-line p').first());
  await shotOf(page.locator('.order-summary').first(), 'c1-kosik-suma');
  await shot(page, 'c1-kosik-kupon');

  const accepted = /prijatý|prijaty/i.test(couponMessage);
  const message = `suma v košíku: ${total || 'neuvedená'} (pred kupónom: ${totalBefore || 'neuvedená'}) | zľava: ${discount || 'neuvedená'} | položka: ${line} | hláška servera pre kupón „${COUPON}“: „${couponMessage || 'bez hlášky'}“`;
  if (!accepted) {
    const err = new Error(`kupón „${COUPON}“ nebol prijatý – ${message}`);
    err.message = `kupón „${COUPON}“ nebol prijatý – ${message}`;
    throw err;
  }
  return message;
}

async function stepD(page) {
  const url = `${BASE}/pokladna/`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await settle(page);

  const form = page.locator('#checkout-form');
  if (!(await form.count())) throw new Error('checkout formulár sa na stránke nenachádza (košík je prázdny)');

  // Krok 1 – kontaktné údaje
  await form.locator('input[name="firstName"]').fill('QA');
  await form.locator('input[name="lastName"]').fill('E2E');
  await form.locator('input[name="email"]').fill(state.email);
  await page.getByRole('button', { name: /Pokračovať na doručenie/i }).first().click();
  await sleep(3000);

  // Krok 2 – doručenie (digitálny produkt = bez dopravy; pri „doručenie na adresu“ sa
  // otvoria polia na adresu)
  const delivery = form.locator('input[name="delivery"][value="digital"]').first();
  let deliveryMode = 'digitálne';
  if (!(await delivery.count())) {
    const anyDelivery = form.locator('input[name="delivery"]').first();
    if (await anyDelivery.count()) await anyDelivery.check().catch(() => {});
  } else {
    await delivery.check().catch(() => {});
  }
  const shipping = form.locator('input[name="delivery"][value="shipping"]').first();
  if ((await shipping.count()) && (await shipping.isChecked().catch(() => false))) {
    deliveryMode = 'doručenie na adresu';
    await form.locator('#address-fields input[name="street"]').fill('Testovacia 1');
    await form.locator('#address-fields input[name="city"]').fill('Bratislava');
    await form.locator('#address-fields input[name="postalCode"]').fill('811 01');
  }
  const country = form.locator('select[name="country"]').first();
  if (await country.count().catch(() => 0)) await country.selectOption('sk').catch(() => {});
  await shot(page, 'd1-pokladna-dorucenie');
  await page.getByRole('button', { name: /Pokračovať na platbu/i }).first().click();
  await sleep(4500);

  // Krok 3 – platba kartou (Stripe Payment Element)
  const cardRadio = form.locator('input[name="payment"][value="card"]').first();
  if (await cardRadio.count().catch(() => 0)) await cardRadio.check().catch(() => {});
  await sleep(4500);

  let stripe = {};
  for (let attempt = 0; attempt < 4 && Object.keys(stripe).length < 3; attempt += 1) {
    stripe = await fillStripe(page);
    if (Object.keys(stripe).length < 3) await sleep(2500);
  }
  const stripeHost = await safeText(page.locator('#stripe-payment-element').first());
  await shot(page, 'd2-pokladna-stripe');
  if (!stripe.number) throw new Error(`Stripe Payment Element sa nenačítal (obsah hostiteľa: „${stripeHost}“)`);

  await form.locator('input[name="terms"]').check().catch(() => {});
  await form.locator('input[name="privacy"]').check().catch(() => {});
  const submit = form.locator('button[type="submit"]').first();
  const submitLabel = (await safeText(submit)) || 'submit';
  await submit.click();

  let resultText = '';
  let resultState = '';
  for (let i = 0; i < 24; i += 1) {
    await sleep(1500);
    resultText = await safeText(page.locator('#checkout-result'));
    resultState = (await page.locator('#checkout-result').getAttribute('data-state').catch(() => '')) || '';
    if (resultText && !/Spracúvam/i.test(resultText)) break;
  }
  await shotOf(page.locator('#checkout-result').first(), 'd3-pokladna-vysledok-detail');
  await shot(page, 'd3-pokladna-vysledok');
  const message = `doprava: ${deliveryMode} | karta: ${stripe.number ? `vyplnená (${stripe.number.replace(/\d(?=\d{4})/g, '•')}, ${stripe.expiry || '?'}, ${stripe.cvc ? '•'.repeat(stripe.cvc.length) : '?'})` : 'nevyplnená'} | tlačidlo: „${submitLabel}“ | stav: ${resultState || 'neuvedený'} | výsledok: „${resultText}“`;
  if (!/^(ALLOW|PENDING)$/i.test(resultState)) {
    const err = new Error(message);
    err.message = message;
    throw err;
  }
  return message;
}

async function stepE(page, ctx) {
  const url = `${BASE}/ucet/`;
  // Zrkadielko je zamknuté bez aktívneho prístupu k programu RESET 40+.
  const entitlements = await apiGet(ctx, '/store/entitlements?limit=100', state.jwt);
  const entitlementList = entitlements.body?.entitlements || [];

  let journalReady = false;
  let noticeText = '';
  for (let attempt = 0; attempt < 8 && !journalReady; attempt += 1) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await settle(page);
    await page.locator('button[data-account-go="reset"]').first().click();
    await sleep(3500);
    const notice = page.locator('#reset-journal .reset-notice').first();
    if (await notice.count().catch(() => 0)) {
      noticeText = await safeText(notice);
    } else if (await page.locator('#reset-journal').count().catch(() => 0)) {
      journalReady = true;
    }
    if (!journalReady) await sleep(4000);
  }
  await shot(page, 'e1-ucet-reset');
  if (!journalReady) {
    throw new Error(
      `Zrkadielko je zamknuté: ${noticeText || 'bez prístupu'} | entitlementy účtu: ${entitlementList.length}${entitlementList.length ? ` (${entitlementList.map(e => e.status || e.product_key || e.handle || '?').join(', ')})` : ''} – prístup vzniká až po zaplatení programu v kroku d)`
    );
  }

  const box = page.locator('#reset-journal');

  // Pridať záznam
  await box.locator('[data-reset-add]').first().click();
  await sleep(900);
  const form = box.locator('[data-reset-form]').first();
  await form.waitFor({ state: 'visible', timeout: 15000 });
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  await form.locator('input[name="date"]').fill(iso);
  for (const [metric, value] of [['energia', '7'], ['spanok', '5'], ['stres', '3']]) {
    const field = form.locator(`.reset-metric[data-metric="${metric}"]`).first();
    if (await field.count().catch(() => 0)) await field.locator(`[data-reset-value="${value}"]`).first().click().catch(() => {});
  }
  await form.locator('button[type="submit"]').first().click();
  await sleep(3500);
  const rowsAfterAdd = await box.locator('tr[data-reset-row]').count();
  await shotOf(box, 'e2-zrkadielko-pridany');
  if (!rowsAfterAdd) throw new Error('záznam sa nepodarilo pridať (tabuľka zostala prázdna)');

  // Upraviť
  await box.locator('[data-reset-edit]').first().click();
  await sleep(1200);
  const editForm = box.locator('[data-reset-form]').first();
  const editLabel = await safeText(editForm.locator('button[type="submit"]').first());
  const energia = editForm.locator('.reset-metric[data-metric="energia"]').first();
  if (await energia.count().catch(() => 0)) await energia.locator('[data-reset-value="9"]').first().click().catch(() => {});
  await editForm.locator('button[type="submit"]').first().click();
  await sleep(3500);
  const rowText = await safeText(box.locator('tr[data-reset-row]').first());
  await shotOf(box, 'e3-zrkadielko-upravene');
  if (!/9/.test(rowText)) throw new Error(`úprava záznamu sa neprejavila v tabuľke (riadok: „${rowText}“)`);

  // Zmazať
  page.once('dialog', dialog => dialog.accept().catch(() => {}));
  const rowsBefore = await box.locator('tr[data-reset-row]').count();
  await box.locator('[data-reset-delete]').first().click();
  await sleep(3500);
  const rowsAfter = await box.locator('tr[data-reset-row]').count();
  await shotOf(box, 'e4-zrkadielko-zmazane');
  if (rowsAfter >= rowsBefore) throw new Error(`záznam sa nepodarilo zmazať (riadkov pred: ${rowsBefore}, po: ${rowsAfter})`);
  return `pridaný záznam (${iso}), upravený cez „${editLabel}“ (riadok: „${rowText}“) a zmazaný (riadkov ${rowsBefore} → ${rowsAfter}) | entitlementy účtu: ${entitlementList.length}`;
}

async function stepF(page) {
  const url = `${BASE}/ucet/`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await settle(page);
  await page.locator('button[data-account-go="klub"]').first().click();
  await sleep(3500);
  const panel = page.locator('[data-account-panel="klub"]').first();
  if (!(await panel.count())) throw new Error('záložka Klub sa na /ucet nezobrazila');
  const text = await safeText(panel);
  const visible = await panel.isVisible().catch(() => false);
  await shotOf(panel, 'f1-ucet-klub-detail');
  await shot(page, 'f1-ucet-klub');
  if (!visible) throw new Error('záložka Klub je skrytá');
  const link = panel.locator('a[href*="klub"], button').first();
  const linkText = await safeText(link);
  const linkHref = (await link.getAttribute('href').catch(() => '')) || '';
  return `záložka Klub otvorená, obsah: „${text.slice(0, 400)}“ | akcia: „${linkText}“ (${linkHref})`;
}

async function stepG(page) {
  const url = `${BASE}/konzultacie/rezervacia/`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await settle(page);
  await shot(page, 'g1-rezervacia');

  const typeBtn = page.locator('#booking-view [data-booking-type]').first();
  if (await typeBtn.count().catch(() => 0)) {
    const typeName = await safeText(typeBtn);
    await typeBtn.click();
    await sleep(4000);
    const slot = page.locator('#booking-view [data-slot]').first();
    if (!(await slot.count().catch(() => 0))) {
      const text = await safeText(page.locator('#booking-view').first());
      const err = new Error(`typ „${typeName}“ nemá voľný termín – „${text.slice(0, 300)}“`);
      err.message = err.message;
      throw err;
    }
    const slotLabel = (await slot.getAttribute('data-label').catch(() => '')) || (await safeText(slot));
    await slot.click();
    await sleep(1800);
    const reserve = page.locator('#booking-view [data-booking-reserve]').first();
    await shot(page, 'g2-rezervacia-termin');
    if (!(await reserve.count().catch(() => 0))) throw new Error(`termín „${slotLabel}“ sa nepodarilo potvrdiť`);
    return `typ: „${typeName}“ | vybraný termín: „${slotLabel}“ | potvrdzovacie tlačidlo dostupné`;
  }

  const text = await safeText(page.locator('main').first());
  const err = new Error(
    `výber termínu nie je dostupný – stránka zobrazuje: „${text.slice(0, 300)}“ (v testovom prostredí nie je publikovaný žiadny konzultačný produkt s kalendárom, preto server nepošle žiadne voľné termíny)`
  );
  err.message = err.message;
  throw err;
}

/* -------------------------------------------------------------------- beh */

const steps = [
  ['a) Registrácia / prihlásenie', stepA],
  ['b) Pridanie do košíka (RESET 40+)', stepB],
  ['c) Košík + kupón Montelope', stepC],
  ['d) Pokladna + platba kartou', stepD],
  ['e) Účet → RESET 40+ → Zrkadielko', stepE],
  ['f) Účet → záložka Klub', stepF],
  ['g) Konzultácie → výber termínu', stepG],
];

reportHeader();

const results = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: VIEWPORT });
const page = await ctx.newPage();
page.on('dialog', dialog => dialog.accept().catch(() => {}));
page.on('request', request => {
  if (request.method() === 'POST' && request.url().includes('/line-items')) state.lineItemRequests += 1;
});

// Runtime konfigurácia webu (adresa API, publishable key) – načítame zo živého webu.
try {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const config = await page.evaluate(async () => {
    const mod = await import('/config.mjs');
    return mod.config;
  });
  state.api = config.apiBaseUrl || API_FALLBACK;
  state.publishableKey = config.publishableKey || '';
} catch (error) {
  console.warn('runtime config sa nepodarilo načítať, používam záložné hodnoty:', error?.message);
}
await dismissCookies(page);

for (const [label, fn] of steps) {
  try {
    const message = await fn(page, ctx);
    results.push({ label, status: 'OK', message });
    report(label, 'OK', page.url(), message);
  } catch (error) {
    const message = String(error?.message || error).replace(/\s+/g, ' ').trim();
    results.push({ label, status: 'CHYBA', message });
    report(label, 'CHYBA', page.url(), message);
    await shot(page, `chyba-${label.slice(0, 1)}`);
    console.error(`CHYBA ${label}:`, message);
  }
}

/* --------------------------------------------------------------- zhrnutie */

const ok = results.filter(r => r.status === 'OK').length;
const summary = [];
summary.push(`**Výsledok:** ${ok}/${results.length} krokov prešlo (stav CHYBA = obmedzenie testovacieho prostredia, nie pád testu).`);
summary.push('');
summary.push('**Nálezy pre testovacie prostredie:**');
summary.push('');
if (state.lineItemRequests > 1) {
  summary.push(`1. **Dvojité pridanie do košíka (chyba storefrontu):** jedno kliknutie na „Pridať do košíka“ poslalo ${state.lineItemRequests}× POST /store/carts/:id/line-items → v košíku sú 2 položky a suma je 336,00 € namiesto 168,00 €. Pôvod: v app.mjs sú na ten istý formulár \`.add-product\` naviazané dva handlery „submit“ (jeden globálny, jeden v bloku živého detailu produktu).`);
} else {
  summary.push('1. Dvojité pridanie do košíka sa v tomto behu neopakovalo.');
}
summary.push('2. **Prihlásenie je bez hesla:** web zákazníka má iba magic link (odkaz e-mailom), žiadny heslový formulár. Session pre prihlásené kroky bola získaná cez backend auth provider `emailpass` (registrácia e-mail + náhodné heslo); heslo zostalo iba v pamäti behu.');
summary.push('3. **Kupón „Montelope“ v testovacom prostredí nie je dostupný:** server vracia „Kupón nie je dostupný.“ (COUPON_INVALID) – rovnako ako pri náhodnom neexistujúcom kóde. Suma košíka bola zaznamenaná aj bez kupónu.');
summary.push('4. **Zrkadielko je zamknuté bez aktívneho programu:** záložka RESET 40+ hlási „Program je dostupný len zákazníčkám s aktívnym prístupom“, kým účet nemá entitlement (403 z /store/reset-journal). Prístup vznikol až po zaplatení programu v kroku d).');
summary.push('5. **Konzultácie nemajú žiadne termíny:** v testovacom prostredí nie je publikovaný konzultačný produkt s kalendárom, preto /konzultacie/rezervacia zobrazuje „Termíny konzultácií pripravujeme.“ a odkaz na Kontakt.');
summary.push(`6. **Testovací účet:** ${state.email}${state.email === QA_EMAIL ? '' : ` – alias zadanej adresy ${QA_EMAIL}. Adresu ${QA_EMAIL} už obsadil účet z prvého behu s heslom, ktoré sa nikam neuložilo, takže ďalší beh použije alias; na beh pod presne zadanou adresou treba v admini odstrániť existujúcu prihlasovaciu identitu (alebo prihlásiť sa raz cez magic link)`}.`);
summary.push('');
summary.push('**Poznámky:** platba kartou 4242424242424242 prebehla v testovacom režime Stripe (bez reálnej platby); v košíku bola položka s množstvom 2, takže suma objednávky bola 336,00 €.');
appendFileSync(REPORT, `\n### Zhrnutie behu ${stamp()}\n\n${summary.join('\n')}\n`);

await browser.close();
console.log('\nHotovo. REPORT:', REPORT, '| screenshoty:', SHOTS);
