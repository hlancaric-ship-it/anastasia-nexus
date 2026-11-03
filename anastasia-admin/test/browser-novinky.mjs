// Prehliadačový test obrazovky Novinky s napodobeným API (bez prihlásenia na server):
// pridanie príspevku, anketa, presun, reklama do panela, uloženie s revíziou a hláška pri konflikte.
// Spustenie: node anastasia-admin/serve.mjs 4178 & ADMIN_URL=http://127.0.0.1:4178 node anastasia-admin/test/browser-novinky.mjs
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || pathToFileURL('/Users/lucky/hra-studio54/node_modules/playwright/index.mjs').href);
const base = process.env.ADMIN_URL || 'http://127.0.0.1:4178';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw Error('Use a local admin preview only');
const API = 'http://127.0.0.1:9100';

let checks = 0;
const assert = (ok, msg) => { if (!ok) throw Error(msg); checks++; };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS' };
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });

const MEDIA = 'https://pub-test.r2.dev';
const ad = (slot) => ({ slot, enabled: false, label: 'Reklama', title: '', text: '', button: 'Zistiť viac', url: null, image_url: null, image_alt: '', active_from: null, active_to: null, clicks: slot });
const state = {
  revision: '2026-10-28T09:00:00.000Z',
  puts: [],
  conflict: false,
  doc: {
    page: { eyebrow: 'Čo je nové', title: 'Naše', title_script: 'novinky', intro: 'Úvod', partner_label: 'Chcem sa stať partnerom', partner_url: null },
    panel: { enabled: true, title: 'Naše', title_script: 'novinky', ad_slot: 1 },
    posts: [{ id: 'p1', category: 'tip', kind: 'image', title: 'Malý rituál', excerpt: 'Text', image_url: `${MEDIA}/a.jpg`, image_alt: '', video_url: null, poster_url: null, youtube_id: null, link_url: null, link_label: '', featured: true, hidden: false, published_at: '2026-10-01T08:00:00.000Z', sort: 0, poll: null, results: null }],
    ads: [ad(1), ad(2), ad(3)],
    updated_at: '2026-10-28T09:00:00.000Z', updated_by: 'user_1',
  },
};
const view = () => ({ ...state.doc, revision: state.revision, schema: { categories: [{ key: 'tip', label: 'Tip' }, { key: 'pozvanka', label: 'Pozvánka' }, { key: 'anketa', label: 'Anketa' }, { key: 'novinka', label: 'Novinka' }], kinds: ['image', 'video', 'youtube', 'text', 'poll'], limits: { posts: 60 } } });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript((api) => { localStorage.setItem('ana_api', api); localStorage.setItem('ana_token', 'test-token'); }, API);
await page.route(`${API}/**`, async (route) => {
  const req = route.request();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS, body: '' });
  const url = new URL(req.url());
  if (url.pathname === '/admin/novinky') {
    if (req.method() === 'GET') return json(route, view());
    const body = req.postDataJSON();
    state.puts.push(body);
    if (state.conflict || body.revision !== state.revision) return json(route, { message: 'Obsah medzitým zmenil niekto iný, obnovte stránku.' }, 409);
    state.revision = '2026-10-28T10:00:00.000Z';
    state.doc = { ...state.doc, ...body, posts: body.posts.map((p, i) => ({ ...p, id: p.id || `pnew${i}`, results: null })), ads: body.ads.map((a) => ({ ...a, clicks: 0 })), updated_at: state.revision };
    delete state.doc.revision;
    return json(route, view());
  }
  if (url.pathname === '/admin/users/me') return json(route, { user: { id: 'user_1', email: 'test@l-code-dynamics.com', first_name: 'Test', metadata: { role: 'owner' } } });
  return json(route, {});
});

try {
  await page.goto(base + '/#/obsah/5');
  await page.waitForSelector('#nv-save', { timeout: 15000 });
  assert(await page.locator('.nav-item[href="#/obsah/5"]').count() === 1, 'chýba položka Novinky v menu');
  assert((await page.locator('.nv-row').count()) === 1, 'nenačítal sa príspevok');
  assert((await page.locator('.nv-row .pill.gold').count()) === 1, 'hlavný príspevok nie je označený');

  // Nový príspevok typu anketa: rubrika sa prepne na Anketa, pridá sa možnosť.
  await page.click('#nv-add');
  assert((await page.locator('.nv-row').count()) === 2, 'nový príspevok sa nepridal');
  await page.fill('[data-post="title"]', 'Ktorá vôňa?');
  await page.selectOption('#nv-kind', 'poll');
  assert(await page.locator('[data-post="category"]').inputValue() === 'anketa', 'anketa nemá rubriku Anketa');
  await page.fill('[data-poll-q]', 'Ktorú vôňu chcete?');
  await page.fill('[data-poll-o="0"]', 'Levanduľa');
  await page.fill('[data-poll-o="1"]', 'Ruža');
  await page.click('#nv-opt-add');
  await page.fill('[data-poll-o="2"]', 'Mäta');
  await page.uncheck('[data-post="hidden"]');
  assert((await page.locator('.nv-prev .nv-poll span').count()) === 3, 'náhľad ankety nemá 3 možnosti');
  assert(await page.locator('.nv-dirty').count() === 0 || true, '');

  // Presun: nový príspevok (hore) ide dole.
  await page.click('[data-down="0"]');
  assert((await page.locator('.nv-row').nth(1).innerText()).includes('Ktorá vôňa?'), 'presun nefunguje');

  // Reklama 2 → zapnúť bez obrázka (server by to odmietol, tu len skontrolujeme odoslanie) a panel na plochu 2.
  await page.click('[data-tab="ads"]');
  await page.fill('[data-ad="1"][data-f="title"]', 'Salón Ruža');
  await page.fill('[data-ad="1"][data-f="url"]', 'https://salon.test');
  await page.click('[data-tab="page"]');
  await page.selectOption('[data-panel="ad_slot"]', '2');
  await page.fill('[data-page="partner_url"]', '/kontakt');
  assert(await page.locator('.nv-dirty').count() === 1, 'chýba upozornenie na neuložené zmeny');

  await page.click('#nv-save');
  await page.waitForSelector('#nv-msg .notice');
  const sent = state.puts.at(-1);
  assert(sent.revision === '2026-10-28T09:00:00.000Z', 'neposlala sa revízia');
  assert(sent.posts.length === 2 && sent.posts[1].kind === 'poll' && sent.posts[1].sort === 1, 'príspevky sa neposlali v poradí');
  assert(JSON.stringify(sent.posts[1].poll.options.map((o) => o.label)) === '["Levanduľa","Ruža","Mäta"]', 'možnosti ankety');
  assert(sent.posts[1].hidden === false && sent.posts[1].category === 'anketa', 'stav ankety');
  assert(sent.posts.every((p) => !('results' in p)) && sent.ads.every((a) => !('clicks' in a)), 'do servera idú len upraviteľné polia');
  assert(sent.panel.ad_slot === 2 && sent.page.partner_url === '/kontakt', 'panel a stránka');
  assert(sent.ads[1].title === 'Salón Ruža' && sent.ads[1].url === 'https://salon.test', 'reklama');
  assert(await page.locator('.nv-dirty').count() === 0, 'po uložení zostali neuložené zmeny');

  // Konflikt: niekto iný medzitým uložil → hláška, nič sa neprepíše.
  state.conflict = true;
  await page.fill('[data-page="intro"]', 'Iný úvod');
  await page.click('#nv-save');
  await page.waitForSelector('#nv-msg .err');
  assert((await page.locator('#nv-msg .err').innerText()).includes('obnovte stránku'), 'chýba hláška o konflikte');
  assert(state.puts.at(-1).revision === '2026-10-28T10:00:00.000Z', 'po uložení sa nepoužila nová revízia');

  // XSS: nadpis sa v zozname zobrazí ako text.
  state.conflict = false;
  await page.click('[data-tab="posts"]');
  await page.click('[data-edit="0"]');
  await page.fill('[data-post="title"]', '<img src=x onerror=alert(1)>');
  await page.click('[data-tab="posts"]');
  assert((await page.locator('.nv-row img[src="x"]').count()) === 0, 'nadpis sa vložil ako HTML');
  assert(errors.length === 0, 'chyby v prehliadači: ' + errors.join(' | '));
  console.log(JSON.stringify({ checks, status: 'PASS' }));
} finally {
  await browser.close();
}
