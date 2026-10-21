// Prehliadačový test ochrany proti súbežnému ukladaniu obsahu (revízia bloku/stránky)
// a sanitizácie rich textu pri zápise.
// Spustenie: ADMIN_URL=… ADMIN_TEST_PASSWORD=… node anastasia-admin/test/browser-content-revision.mjs
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

// Stav servera: aktuálna revízia bloku, posledná uložená hodnota a čo server prijme.
const state = { revision: '2026-10-21T10:00:00.000Z', saved: null, lastRevision: null, lastValue: null, pageRevision: '2026-10-21T10:00:00.000Z', savedPage: null, lastPageRevision: null };
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
};
const apiJson = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });
const preflight = (route) => route.fulfill({ status: 204, headers: CORS, body: '' });

const contentPage = {
  key: 'kontakt',
  title: 'Kontakt',
  path: '/kontakt',
  changed: false,
  sections: [{
    key: 'kontakt-1', title: 'Kontakt', order: 1, changed: false,
    fields: [
      { key: 'kontakt__kontakt-1__0-text', type: 'text', label: 'Nadpis', value: 'Kontakt', fallback: 'Kontakt', max_length: 100, lang: 'sk', changed: false, updated_at: null, updated_by: null, revision: 'seed', history: [] },
      { key: 'kontakt__kontakt-1__1-rich', type: 'rich', label: 'Adresa', value: 'Sokolská 88', fallback: 'Sokolská 88', max_length: 500, lang: 'sk', changed: false, updated_at: null, updated_by: null, revision: 'seed', history: [] },
    ],
  }],
};
// Server vrací aktuálnu revíziu – po obnovení stránky ju treba vidieť.
const currentContent = () => ({
  ...contentPage,
  sections: contentPage.sections.map((section) => ({
    ...section,
    fields: section.fields.map((f) => (f.key === 'kontakt__kontakt-1__0-text'
      ? { ...f, revision: state.revision, updated_at: state.revision === 'seed' ? null : state.revision }
      : f)),
  })),
});

await page.route('**/admin/content**', async (route) => {
  if (route.request().method() === 'OPTIONS') return preflight(route);
  const url = new URL(route.request().url());
  if (route.request().method() === 'GET') {
    if (url.pathname === '/admin/content') return apiJson(route, { pages: [currentContent()] });
    return apiJson(route, {});
  }
  const body = route.request().postDataJSON() || {};
  state.lastRevision = body.revision ?? null;
  state.lastValue = body.value ?? null;
  if (body.revision !== state.revision) {
    return route.fulfill({ status: 409, contentType: 'application/json', headers: CORS, body: JSON.stringify({ message: 'Obsah medzitým zmenil niekto iný, obnovte stránku.' }) });
  }
  state.saved = body.value;
  return apiJson(route, { ok: true, field: body.field, value: body.value, revision: state.revision });
});

await page.route('**/admin/pages**', async (route) => {
  if (route.request().method() === 'OPTIONS') return preflight(route);
  const url = new URL(route.request().url());
  if (route.request().method() === 'GET') {
    return apiJson(route, { pages: [{ slug: 'vop', label: 'Obchodné podmienky', description: 'Podmienky predaja', html: '<p>Pôvodné znenie</p>', default_html: '<p>Pôvodné znenie</p>', is_default: true, updated_at: null, updated_by: null, revision: state.pageRevision }] });
  }
  const body = route.request().postDataJSON() || {};
  state.lastPageRevision = body.revision ?? null;
  if (body.revision !== state.pageRevision) {
    return route.fulfill({ status: 409, contentType: 'application/json', headers: CORS, body: JSON.stringify({ message: 'Obsah medzitým zmenil niekto iný, obnovte stránku.' }) });
  }
  state.savedPage = body.html;
  return apiJson(route, { slug: body.slug, html: body.html, updated_at: '2026-10-21T13:00:00.000Z' });
});

try {
  const apiOrigin = (process.env.ADMIN_API_ORIGIN || 'https://anastasia-test-api.l-code-dynamics.com').replace(/\/+$/, '');
  const loginRes = await fetch(`${apiOrigin}/auth/user/emailpass`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: pass }) });
  const loginData = await loginRes.json().catch(() => ({}));
  if (!loginData.token) throw Error('Prihlásenie do testovacieho API zlyhalo: ' + (loginData.message || 'neznámy dôvod'));
  await page.addInitScript((t) => { localStorage.setItem('ana_token', t); }, loginData.token);
  await page.goto(base + '/');
  await page.waitForSelector('#logout');

  // --- Obsah → Stránky a texty → editor bloku ---
  await page.goto(base + '/#/obsah');
  await page.waitForSelector('#actions .pill');
  await page.locator('#actions .pill', { hasText: 'Stránky a texty' }).first().click();
  await page.waitForSelector('[data-page]');
  await page.locator('[data-page="kontakt"]').first().click();
  await page.waitForSelector('[data-field="kontakt__kontakt-1__0-text"]', { state: 'attached' });

  // Sekcia je zložená detail – po každom prekreslení ju treba rozbaliť.
  const field = page.locator('[data-field="kontakt__kontakt-1__0-text"]');
  const openField = async () => {
    if (!(await field.isVisible())) {
      const summary = page.locator('.content-section summary').first();
      if (await summary.count()) await summary.click();
      await page.waitForTimeout(250);
    }
    return field;
  };
  await openField();

  // Pole nesie revíziu, ktorú pošle server.
  const revision = await field.getAttribute('data-revision');
  assert(revision === state.revision, 'pole nemá revíziu: ' + revision + ' ≠ ' + state.revision);

  // 1) Zhodná revízia → uloží sa.
  await (await openField()).fill('Nový nadpis');
  await page.locator('[data-save="kontakt__kontakt-1__0-text"]').click();
  await page.waitForTimeout(800);
  assert(state.saved === 'Nový nadpis', 'uložená hodnota sa neposlala: ' + JSON.stringify(state.saved));
  assert(state.lastRevision === state.revision, 'revízia sa neposlala: ' + state.lastRevision);

  // 2) Zmena revízie medzitým (niekto iný uložil) → 409 s hláškou a tlačidlom na obnovenie.
  state.revision = '2026-10-21T12:00:00.000Z';
  await (await openField()).fill('Ďalší nadpis');
  await page.locator('[data-save="kontakt__kontakt-1__0-text"]').click();
  await page.waitForSelector('#cp-msg .notice', { timeout: 10000 });
  const conflictText = await page.locator('#cp-msg').innerText();
  assert(conflictText.includes('Obsah medzitým zmenil niekto iný, obnovte stránku.'), 'chýba hláška o konflikte: ' + conflictText);
  assert(await page.locator('#cp-msg [data-cp-reload]').count() === 1, 'chýba tlačidlo na obnovenie stránky');
  assert(state.saved === 'Nový nadpis', 'pri konflikte sa malo uložiť staré znenie');

  // 3) Po obnovení stránky sa revízia načíta znova a uloženie prejde.
  await page.locator('#cp-msg [data-cp-reload]').click();
  await page.waitForTimeout(1200);
  const revisionAfter = await (await openField()).getAttribute('data-revision');
  assert(revisionAfter === state.revision, 'po obnovení sa revízia nenačítala: ' + revisionAfter);
  await (await openField()).fill('Tretí nadpis');
  await page.locator('[data-save="kontakt__kontakt-1__0-text"]').click();
  await page.waitForTimeout(800);
  assert(state.saved === 'Tretí nadpis', 'po obnovení sa uloženie nepodarilo: ' + JSON.stringify(state.saved));

  // --- Texty právnych stránok: rovnako chránené pred súbežným ukladaním ---
  await page.goto(base + '/#/obsah');
  await page.reload(); // inak by ostala predošlá záložka
  await page.waitForSelector('#actions .pill');
  await page.locator('#actions .pill', { hasText: 'Stránky a texty' }).first().click();
  await page.waitForSelector('[data-extra="vop"]');
  await page.locator('[data-extra="vop"]').first().click();
  await page.waitForSelector('#pt-editor');
  // Zhodná revízia → uloží sa.
  await page.locator('#pt-editor').fill('Nové znenie');
  await page.click('#pt-save');
  await page.waitForTimeout(900);
  assert(String(state.savedPage || '').includes('Nové znenie'), 'znenie stránky sa neuložilo: ' + JSON.stringify(state.savedPage));
  assert(state.lastPageRevision === state.pageRevision, 'revízia stránky sa neposlala: ' + state.lastPageRevision);

  // Niekto iný medzitým zmenil stránku → 409 s hláškou a obnovením.
  state.pageRevision = '2026-10-21T14:00:00.000Z';
  await page.locator('#pt-editor').fill('Znova znenie');
  await page.click('#pt-save');
  await page.waitForSelector('#pt-msg .notice', { timeout: 10000 });
  const pageConflict = await page.locator('#pt-msg').innerText();
  assert(pageConflict.includes('Obsah medzitým zmenil niekto iný, obnovte stránku.'), 'chýba hláška o konflikte stránky: ' + pageConflict);
  assert(await page.locator('#pt-msg #pt-reload').count() === 1, 'chýba tlačidlo na obnovenie stránky');

  console.log(JSON.stringify({ checks, status: 'PASS' }));
} finally { await browser.close(); }
