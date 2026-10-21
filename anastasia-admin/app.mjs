// ANASTASIA admin — vlastní SPA proti Medusa Admin API (NE Medusa /app).
// Vzhled dle backend/docs/wp/admin-design-preview.html. Slovensky. Theming tokeny v styles.css.
// Produkčný build (build.mjs) zapíše adresu jadra do <meta name="ana-api">; lokálne platí localStorage 'ana_api' alebo :9100.
const API = (document.querySelector('meta[name="ana-api"]')?.content || localStorage.getItem('ana_api') || 'http://localhost:9100').replace(/\/+$/, '');
const root = document.getElementById('root');
const $ = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };
const fmtEur = (a) => (a == null ? '—' : new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'eur' }).format(Number(a)));
const fmtDate = (d) => d ? new Date(d).toLocaleString('sk-SK', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Krátky, čitateľný kód zákazníka (prvých 8 znakov ID) – rovnaký sa používa v celom administrácii.
const custCode = (id) => { const s = String(id ?? ''); return s.length > 12 ? `${s.slice(0, 10)}…` : s; };

import { qrAgenda } from './qr.mjs';

import { TOUR, GUIDES, GUIDE_GROUPS, PAGE_HELP, SUPPORT_EMAIL } from './guide.mjs';
import { mountLibraryEditor } from './library-editor.mjs';
import { openPrintWindow, fillPrintWindow, openPrintHtml, PRINT_FIELDS } from './print.mjs';
import { voucherHtml, voucherListHtml, VOUCHER_CSS } from './voucher.mjs';
import { contentPages, contentPage, wireContentPage } from './content.mjs';

// --- API klient ---
let token = localStorage.getItem('ana_token') || '';
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) { token = ''; localStorage.removeItem('ana_token'); renderLogin('Prihlásenie vypršalo.'); throw new Error('401'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `${method} ${path} → ${res.status}`);
  return data;
}
async function login(email, password) {
  const res = await fetch(API + '/auth/user/emailpass', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.token) throw new Error(d?.message || 'Prihlásenie zlyhalo.');
  token = d.token; localStorage.setItem('ana_token', token);
}

// --- tlač štítka a dodacieho listu ---
// Okno sa otvorí SYCHRÓNNE v kliknutí (prehliadač inak zablokuje pop-up),
// údaje objednávok sa načítajú až potom z /admin/orders?id[]=…&fields=PRINT_FIELDS.
// 'label' = adresný štítok A6, 'slip' = dodací list A4.
const PRINT_KIND = { label: 'Štítok', slip: 'Dodací list' };
async function printOrders(ids, kind) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (!list.length) return;
  let w;
  try { w = openPrintWindow(`${PRINT_KIND[kind] || 'Štítok'} – ANASTASIA`); }
  catch (e) { alert(e.message); return; }
  const q = list.map(id => 'id[]=' + encodeURIComponent(id)).join('&');
  try {
    const { orders = [] } = await api(`/admin/orders?${q}&limit=${Math.min(list.length, 1000)}&fields=${encodeURIComponent(PRINT_FIELDS)}`);
    if (!orders.length) { w.document.body.innerHTML = '<p style="font:14px Arial">Pre tieto objednávky sa nepodarilo načítať údaje na tlač.</p>'; return; }
    fillPrintWindow(w, orders, kind);
  } catch (e) {
    w.document.body.innerHTML = `<p style="font:14px Arial">Údaje na tlač sa nepodarilo načítať: ${esc(e.message)}</p>`;
  }
}

// --- ikony (tenké line SVG zo schváleného návrhu admin-design-preview) ---
const ICONS = {
  home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
  bag: '<path d="M5 7h14l2 14H3Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
  box: '<path d="m3 7 9-4 9 4-9 5Z M3 7v10l9 4 9-4V7 M12 12v9 M7 5l10 5"/>',
  users: '<circle cx="9" cy="7" r="3"/><path d="M2 21v-3a7 7 0 0 1 14 0v3 M17 4a3 3 0 0 1 0 6 M21 21v-3a7 7 0 0 0-3-6"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v5 M17 3v5 M3 11h18 M7 15h3 M14 15h3"/>',
  chat: '<path d="M21 11a8 8 0 0 1-8 8H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z M7 8h10 M7 12h7"/>',
  gift: '<path d="M3 8h18v5H3Z M5 13v8h14v-8 M12 8v13"/><path d="M12 8H8a3 3 0 1 1 3-3Zm0 0h4a3 3 0 1 0-3-3Z"/>',
  doc: '<path d="M5 3h10l4 4v14H5Z M14 3v5h5 M9 12h6 M9 16h6"/>',
  cog: '<path d="M4 6h16 M4 12h16 M4 18h16"/><circle cx="8" cy="6" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/>',
  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8L12 3.5Z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 0c0 3-3 2-3 5 M12 17h.01"/>',
  arrow: '<path d="M5 12h14 M13 6l6 6-6 6"/>',
  plus: '<path d="M12 4v16 M4 12h16"/>',
  menu: '<path d="M3 6h18 M3 12h18 M3 18h18"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  out: '<path d="M14 4h5v16h-5 M10 8l-4 4 4 4 M6 12h10"/>',
};
const navIcon = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const LOGO = './logo-mark.png';
const brandHtml = (tag = 'div') => `<${tag} class="brand"${tag === 'a' ? ' href="#/"' : ''}><img src="${LOGO}" alt="" width="43" height="43"><div><div class="brand-name">ANASTASIA</div><small>PRIESTOR PRE VAŠU PRÁCU</small></div></${tag}>`;

// --- navigácia (štruktúra podľa schváleného návrhu admin-design-overview) ---
// ready:false = agenda je v admine, ale čaká na jadro → skrytá, kým sa nenapojí.
const NAV = [
  { k: '', label: 'Prehľad', icon: 'home', ready: true },
  { k: 'objednavky', label: 'Objednávky', icon: 'bag', ready: true, badge: 'orders' },
  { k: 'produkty', label: 'Produkty', icon: 'box', ready: true },
  { k: 'kategorie', label: 'Kategórie', icon: 'box', ready: true },
  { k: 'zakaznicky', label: 'Zákazníci', icon: 'users', ready: true },
  { k: 'konzultacie', label: 'Konzultácie', icon: 'cal', ready: true },
  { k: 'spravy', label: 'Správy', icon: 'chat', ready: true, badge: 'messages' },
  { k: 'poukazy', label: 'Poukazy a zľavy', icon: 'gift', ready: true },
  { k: 'ambasadori', label: 'Ambasádori', icon: 'star', ready: true, phase2: true },
  { k: 'obsah', label: 'Obsah a e-maily', icon: 'doc', ready: true },
];
let BADGES = {};

function shell(active, title, sub) {
  const cur = (k) => active === k ? ' active" aria-current="page' : '';
  const item = (n) => `<a class="nav-item${cur(n.k)}" href="#/${n.k}">${navIcon(n.icon)}<span>${esc(n.label)}</span>${n.phase2 ? '<span class="nav-phase">Fáza 2</span>' : ''}${n.badge ? `<span class="counter" data-badge="${n.badge}" ${BADGES[n.badge] ? '' : 'hidden'}>${BADGES[n.badge] || ''}</span>` : ''}</a>`;
  const nav = NAV.filter(n => n.ready).map(item).join('');
  const crumb = active === '' ? 'Prehľad' : (title || '');
  // Prehľad: dátum + pozdrav (meno dopĺňa setUserChip z /admin/users/me); ostatné agendy: názov a popis z ROUTES.
  const d = new Date(), today = `${d.toLocaleDateString('sk-SK', { weekday: 'long' })}, ${d.toLocaleDateString('sk-SK', { day: 'numeric', month: 'long' })}`;
  // Pomoc na stránke: tlačidlo „Ako to funguje“ pri nadpise + skrytý panel s vysvetlením (obsah z guide.mjs).
  const helpBtn = PAGE_HELP[active] ? `<button type="button" class="help-toggle" id="ctx-help-btn" aria-expanded="false" aria-controls="ctx-help">${navIcon('help')}<span>Ako to funguje</span></button>` : '';
  const head = active === ''
    ? `<p class="eyebrow">${esc(today)}</p><div class="heading"><div><h1 id="greet">Dobrý deň.</h1><p class="intro">Tu nájdete všetko, čo dnes potrebuje vašu pozornosť.</p></div><div class="head-actions">${helpBtn}<div id="actions"></div></div></div>`
    : `<p class="eyebrow">Váš obchod</p><div class="heading"><div><h1>${esc(title)}</h1>${sub ? `<p class="intro">${esc(sub)}</p>` : ''}</div><div class="head-actions">${helpBtn}<div id="actions"></div></div></div>`;
  return `<div class="app">
    <aside class="sidebar" id="sidebar" aria-label="Hlavná navigácia">
      ${brandHtml('a')}
      <div class="side-search">
        <input type="search" id="side-q" placeholder="Hľadať v celom obchode" aria-label="Hľadať v celom obchode">
        <div class="side-results" id="side-results" hidden></div>
      </div>
      <div class="nav-title">Váš obchod</div>
      <nav class="nav">${nav}</nav>
      <div class="sidebar-bottom">
        <a class="nav-item${cur('nastavenia')}" href="#/nastavenia">${navIcon('cog')}<span>Nastavenia</span></a>
        <a class="nav-item${cur('pomoc')}" href="#/pomoc">${navIcon('help')}<span>Potrebujete poradiť?</span></a>
        <div class="account"><span class="avatar" id="uava" aria-hidden="true"></span><div><strong id="uname">Váš účet</strong><small>Váš pracovný priestor</small></div></div>
      </div>
    </aside>
    <div class="scrim" id="scrim"></div>
    <div class="workspace">
      <header class="topbar">
        <div class="mobile-head"><button type="button" id="nav-toggle" aria-label="Otvoriť navigáciu" aria-expanded="false" aria-controls="sidebar">${navIcon('menu')}</button><img src="${LOGO}" alt="" width="28" height="28"><span>ANASTASIA</span></div>
        <span class="crumb">Váš obchod / ${esc(crumb)}</span>
        <div class="top-actions"><button type="button" class="subtle-link" id="logout">${navIcon('out')}Odhlásiť sa</button></div>
      </header>
      <main class="content" id="main">
        ${head}
        ${ctxHelpHtml(active)}
        <div id="view"></div>
      </main>
    </div>
  </div>`;
}
function wireMobileNav() {
  const sb = root.querySelector('#sidebar'), tg = root.querySelector('#nav-toggle'), scrim = root.querySelector('#scrim');
  if (!sb || !tg) return;
  const set = (open) => { sb.classList.toggle('mobile-open', open); scrim?.classList.toggle('on', open); tg.setAttribute('aria-expanded', String(open)); tg.setAttribute('aria-label', open ? 'Zavrieť navigáciu' : 'Otvoriť navigáciu'); };
  tg.onclick = () => set(!sb.classList.contains('mobile-open'));
  if (scrim) scrim.onclick = () => set(false);
  sb.querySelectorAll('a').forEach(a => a.addEventListener('click', () => set(false)));
  wireSideSearch();
}
// Vyhľadávanie v bočnom paneli: nájde objednávky, produkty a zákazníci a preskočí do správnej sekcie.
let PENDING_SEARCH = '';
/** Po preskokučení z bočného vyhľadávania doplní hľadaný výraz do vyhľadávacieho poľa aktuálnej sekcie. */
function applyPendingSearch(view) {
  if (!PENDING_SEARCH || !view) return;
  const term = PENDING_SEARCH; PENDING_SEARCH = '';
  const s = view.querySelector('.rc-search');
  if (s) { s.value = term; s.dispatchEvent(new Event('input', { bubbles: true })); }
}
function wireSideSearch() {
  const input = root.querySelector('#side-q'), box = root.querySelector('#side-results');
  if (!input || !box) return;
  let timer = null;
  const run = async () => {
    const q = input.value.trim();
    if (q.length < 2) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false; box.innerHTML = '<div class="muted">Hľadám…</div>';
    const [o, p, c] = await Promise.all([
      api(`/admin/orders?q=${encodeURIComponent(q)}&limit=5`).catch(() => null),
      api(`/admin/products?q=${encodeURIComponent(q)}&limit=5`).catch(() => null),
      api(`/admin/customers?q=${encodeURIComponent(q)}&limit=5`).catch(() => null),
    ]);
    const groups = [
      { label: 'Objednávky', hash: '#/objednavky', rows: (o?.orders || []).map(x => `#${x.display_id ?? ''} · ${x.email || ''}`) },
      { label: 'Produkty', hash: '#/produkty', rows: (p?.products || []).map(x => x.title) },
      { label: 'Zákazníci', hash: '#/zakaznicky', rows: (c?.customers || []).map(x => [x.first_name, x.last_name].filter(Boolean).join(' ') || x.email) },
    ].filter(g => g.rows.length);
    box.innerHTML = groups.length
      ? groups.map(g => `<div class="side-group"><b>${esc(g.label)} (${g.rows.length})</b>${g.rows.map(t => `<button type="button" data-go="${esc(g.hash)}">${esc(t)}</button>`).join('')}</div>`).join('')
      : '<div class="muted">Nič sa nenašlo.</div>';
    box.querySelectorAll('[data-go]').forEach(b => b.onclick = () => {
      PENDING_SEARCH = q;
      location.hash = b.dataset.go;
      box.hidden = true; input.value = '';
    });
  };
  input.oninput = () => { clearTimeout(timer); timer = setTimeout(run, 320); };
  input.onkeydown = (e) => { if (e.key === 'Escape') { input.value = ''; box.hidden = true; input.blur(); } };
}

// --- aktuálne prihlásená obsluha (pre pozdrav + avatar) ---
let ME = null;
async function loadMe() { if (ME) return ME; try { ME = (await api('/admin/users/me?fields=id,first_name,last_name,email')).user || null; } catch { ME = null; } return ME; }
function meName() { const m = ME || {}; return (m.first_name || (m.email ? m.email.split('@')[0] : '') || '').trim(); }
function meInitials() {
  const m = ME || {};
  const fl = [m.first_name, m.last_name].map(s => (s || '').trim()).filter(Boolean);
  if (fl.length >= 2) return (fl[0][0] + fl[1][0]).toUpperCase();
  const n = meName();
  return n ? n.slice(0, 2).toUpperCase() : '';
}
function setUserChip() {
  const name = meName(); const nm = document.querySelector('#uname'); const av = document.querySelector('#uava'); const gr = document.querySelector('#greet');
  if (nm) nm.textContent = name || 'Váš účet';
  if (av) av.textContent = meInitials();
  if (gr) gr.textContent = name ? `Dobrý deň, ${name}.` : 'Dobrý deň.';
}

// --- views ---
async function vDashboard(view) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam…</div>';
  setActions(`<a class="btn primary" href="#/produkty">${navIcon('plus')}Pridať produkt</a>`);
  const soft = (p) => api(p).catch(e => { if (e.message === '401') throw e; return null; });
  await loadMe(); setUserChip();
  const [ordersRes, chatRes, bookRes, readiness] = await Promise.all([
    soft('/admin/orders?fulfillment_status[]=not_fulfilled&status[]=pending&status[]=completed&status[]=requires_action&limit=1'),
    soft('/admin/chat/conversations?status=open&limit=200'),
    soft('/admin/bookings?status=confirmed&limit=200'),
    soft('/admin/readiness'),
  ]);
  const toFulfill = typeof ordersRes?.count === 'number' ? ordersRes.count : null;
  // Nové správy = neprečítané (neztlmené) otvorené konverzácie, ako ich počíta jadro.
  const unread = typeof chatRes?.unread === 'number' ? chatRes.unread : null;
  // Dnešné konzultácie: potvrdené rezervácie s termínom dnes. Zoznam je zoradený od najnovšieho termínu;
  // ak nepokrýva celý dnešok, číslo neukazujeme (radšej nič než nepresné).
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  let todayB = null;
  if (bookRes && Array.isArray(bookRes.bookings)) {
    const list = bookRes.bookings, oldest = list[list.length - 1];
    const complete = list.length >= (bookRes.count || 0) || (oldest && new Date(oldest.starts_at) < start);
    if (complete) todayB = list.filter(b => { const t = new Date(b.starts_at); return t >= start && t < end; }).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  }
  let names = null;
  if (todayB && todayB.length) { try { names = await namesFor(todayB.map(b => b.customer_id), todayB.map(b => b.product_id)); } catch (e) { if (e.message === '401') throw e; } }
  // Tržby, najpredávanejšie produkty a nízky sklad – údaje z jadra, výpočet len na zobrazenie.
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const [recentRes, invRes, prodRes] = await Promise.all([
    soft('/admin/orders?limit=200&order=-created_at&fields=id,status,payment_status,fulfillment_status,created_at,total,*items'),
    soft('/admin/inventory-items?limit=200&fields=id,sku,*inventory_levels'),
    soft('/admin/products?limit=100&fields=id,title,*variants.sku'),
  ]);
  const recent = recentRes?.orders || [];
  const paid = (o) => ['captured', 'paid', 'partially_captured'].includes(o.payment_status);
  const sumPaid = (from) => recent.filter(o => paid(o) && new Date(o.created_at) >= from).reduce((a, o) => a + Number(o.total || 0), 0);
  const revenue = { day: sumPaid(dayStart), week: sumPaid(weekStart), month: sumPaid(monthStart) };
  const revenuePartial = (Number(recentRes?.count) || 0) > recent.length;
  const counts = new Map();
  for (const o of recent) for (const it of o.items || []) {
    const key = it.title || it.product_title || '';
    if (!key) continue;
    const cur = counts.get(key) || { title: key, qty: 0, sum: 0 };
    cur.qty += Number(it.quantity || 0); cur.sum += Number(it.total || 0);
    counts.set(key, cur);
  }
  const top = [...counts.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
  const titleBySku = new Map((prodRes?.products || []).flatMap(p => (p.variants || []).map(v => [v.sku, p.title])));
  const lowStock = (invRes?.inventory_items || [])
    .map(i => ({ sku: i.sku, title: titleBySku.get(i.sku) || i.sku, stock: (i.inventory_levels || []).reduce((a, l) => a + Number(l.stocked_quantity || 0), 0) }))
    .filter(x => x.stock <= 5).sort((a, b) => a.stock - b.stock).slice(0, 5);
  const hm = (d) => new Date(d).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
  const now = Date.now(), next = todayB ? todayB.find(b => new Date(b.starts_at).getTime() >= now) : null;
  const plural = (n, one, few, many) => n === 1 ? one : n >= 2 && n <= 4 ? few : many;

  const stats = [];
  if (toFulfill != null) stats.push(['Na vybavenie', 'bag', toFulfill, toFulfill === 0 ? 'nič nečaká na vybavenie' : plural(toFulfill, 'objednávka čaká na vás', 'objednávky čakajú na vás', 'objednávok čaká na vás'), '#/objednavky']);
  if (unread != null) stats.push(['Nové správy', 'chat', unread, unread === 0 ? 'všetky správy sú prečítané' : plural(unread, 'zákazník čaká na odpoveď', 'zákazníci čakajú na odpoveď', 'zákazníkov čaká na odpoveď'), '#/spravy']);
  if (todayB) stats.push(['Dnešné konzultácie', 'cal', todayB.length, todayB.length === 0 ? 'na dnes nič naplánované' : next ? `najbližšia o ${hm(next.starts_at)}` : 'dnešné termíny už prebehli', '#/konzultacie']);

  const tasks = [];
  if (toFulfill > 0) tasks.push(['wine', 'bag', 'Pripravte objednávky na odoslanie', `${toFulfill} ${plural(toFulfill, 'objednávka čaká', 'objednávky čakajú', 'objednávok čaká')} na vybavenie.`, 'Pozrieť objednávky', '#/objednavky']);
  if (unread > 0) tasks.push(['green', 'chat', 'Odpovedzte zákazníkom', `${plural(unread, 'Máte jednu novú správu.', `Máte ${unread} nové správy.`, `Máte ${unread} nových správ.`)} Celú komunikáciu nájdete na jednom mieste.`, 'Prečítať správy', '#/spravy']);
  const taskHtml = ([tone, icon, t, d, cta, href]) => `<article class="task"><div class="task-icon ${tone}">${navIcon(icon)}</div><div class="task-copy"><h3>${esc(t)}</h3><p>${esc(d)}</p><a class="subtle-link" href="${esc(href)}">${esc(cta)} →</a></div></article>`;
  const ulohy = (n) => `${n} ${plural(n, 'úloha', 'úlohy', 'úloh')}`;

  const dnesTag = new Date().toLocaleDateString('sk-SK', { day: 'numeric', month: 'long' });
  const schedule = todayB == null ? '' : `<section class="panel" data-tour="schedule"><div class="panel-head"><h2>Dnes vás čaká</h2><span class="tag">${esc(dnesTag)}</span></div><div class="schedule">
    ${todayB.length ? todayB.slice(0, 4).map(b => `<article class="appointment"><span class="time">${esc(hm(b.starts_at))}</span><div><h3>${esc(names ? names.prod(b.product_id) : 'Konzultácia')}</h3><p>${esc(names ? names.cust(b.customer_id) : '')}${b.ends_at ? ` · ${Math.max(0, Math.round((new Date(b.ends_at) - new Date(b.starts_at)) / 60000))} min` : ''}</p><small>Rezervácia potvrdená</small></div></article>`).join('')
      : '<p class="empty-task">Na dnes nemáte žiadne potvrdené konzultácie.</p>'}
    <a class="subtle-link" href="#/konzultacie">${todayB.length > 4 ? `Pozrieť všetky ${todayB.length} konzultácie →` : 'Pozrieť konzultácie →'}</a>
  </div></section>`;

  view.innerHTML = `
  ${stats.length ? `<div class="stats" data-tour="stats" style="--n:${stats.length}">${stats.map(([l, icon, n, sub, href]) => `<a class="stat" href="${href}"><div class="stat-top">${esc(l)} ${navIcon(icon)}</div><strong>${n}</strong><small>${esc(sub)}</small></a>`).join('')}</div>` : ''}
  <div class="main-grid">
    <div>
      <section class="panel" data-tour="tasks"><div class="panel-head"><h2>Čomu sa venovať</h2>${tasks.length ? `<span class="tag">${ulohy(tasks.length)}</span>` : ''}</div>
        ${tasks.length ? tasks.map(taskHtml).join('') : `<p class="empty-task">${toFulfill == null && unread == null ? 'Úlohy sa teraz nedajú načítať. Skúste obnoviť stránku.' : 'Všetko máte vybavené. Nič nečaká na vašu pozornosť.'}</p>`}
      </section>
      <section class="panel"><div class="panel-head"><h2>Tržby</h2><span class="tag">zaplatené objednávky</span></div>
        <div class="stats" style="--n:3;margin:0 0 4px">
          <div class="stat"><div class="stat-top">Dnes ${navIcon('bag')}</div><strong>${fmtEur(revenue.day)}</strong><small>${revenue.day ? 'zaplatené dnes' : 'dnes zatiaľ nič'}</small></div>
          <div class="stat"><div class="stat-top">Tento týždeň ${navIcon('bag')}</div><strong>${fmtEur(revenue.week)}</strong><small>od pondelka</small></div>
          <div class="stat"><div class="stat-top">Tento mesiac ${navIcon('bag')}</div><strong>${fmtEur(revenue.month)}</strong><small>od 1. dňa mesiaca</small></div>
        </div>
        ${revenuePartial ? '<p class="muted" style="font-size:12px;margin:0">Ukazujeme posledných 200 objednávok – staršie nie sú započítané.</p>' : ''}
      </section>
      ${readinessCard(readiness)}
    </div>    <div>
      ${schedule}
      <section class="panel"><div class="panel-head"><h2>Najpredávanejšie produkty</h2></div>
        ${top.length ? `<div class="rc-grid">${top.map(p => `<div class="rc"><div class="rc-body"><div class="rc-title">${esc(p.title)}</div>
            <div class="rc-fields"><span class="rc-f"><em>Predané</em>${p.qty} ks</span><span class="rc-f"><em>Tržby</em>${fmtEur(p.sum)}</span></div></div></div>`).join('')}</div>`
          : '<p class="empty-task">Zatiaľ nemáme údaje o predaji produktov.</p>'}
      </section>
      <section class="panel"><div class="panel-head"><h2>Nízky sklad</h2></div>
        ${lowStock.length ? `<div class="rc-grid">${lowStock.map(p => `<div class="rc"><div class="rc-body"><div class="rc-title">${esc(p.title)}</div>
            <div class="rc-fields"><span class="rc-f"><em>Na sklade</em>${p.stock <= 0 ? '<span class="pill off">vypredané</span>' : `<span class="pill warn">${p.stock} ks</span>`}</span><span class="rc-f"><em>Kód</em>${esc(p.sku || '—')}</span></div></div></div>`).join('')}</div>`
          : '<p class="empty-task">Všetky produkty majú dostatok zásoby.</p>'}
      </section>
      ${notifyCard()}
      <aside class="help-card">${navIcon('help')}<h3>Všetko si nastavíte tu.</h3><p>Ceny, voľné termíny, poukazy aj texty e-mailov. Pri každom nastavení vysvetlíme, čo zmena ovplyvní.</p><a class="subtle-link" href="#/nastavenia">Otvoriť nastavenia →</a></aside>
      <div class="quick"><a class="btn" href="#/poukazy">${navIcon('gift')}Nastaviť poukazy</a><a class="btn" href="#/poukazy">${navIcon('plus')}Vytvoriť kupón</a></div>
    </div>
  </div>`;
}

// Upozornenia v prehliadači: nová objednávka alebo neprečítaná správa priebežne upozornia na ploche.
// Upozornenia sa zobrazujú len vtedy, keď je prehliadač otvorený a povolenie je udelené.
function notifyCard() {
  const supported = typeof Notification !== 'undefined';
  const state = supported ? Notification.permission : 'unsupported';
  const enabled = state === 'granted';
  return `<section class="panel"><div class="panel-head"><h2>Upozornenia v prehliadači</h2></div>
    <p class="empty-task" style="margin-bottom:10px">${!supported ? 'Tento prehliadač upozornenia nepodporuje.' : enabled ? 'Zapnuté – pri novej objednávke alebo správe dostanete upozornenie.' : 'Kdyď vám príde nová objednávka alebo správa, upozorní vás prehliadač, aj keď máte otvorenú inú kartu.'}</p>
    ${supported && !enabled ? '<button class="btn ghost sm" id="notify-on">Zapnúť upozornenia</button>' : ''}
    ${enabled ? '<button class="btn ghost sm" id="notify-test">Poslať skúšobné upozornenie</button>' : ''}
  </section>`;
}
function wireNotifyCard(view) {
  const on = view.querySelector('#notify-on');
  if (on) on.onclick = async () => {
    try {
      const p = await Notification.requestPermission();
      if (p === 'granted') { startNotifyPolling(); location.reload(); }
      else on.insertAdjacentHTML('afterend', '<div class="err" style="margin-top:8px">Prehliadač nepovolil upozornenia. Povoliť ich môžete v nastaveniach prehliadača.</div>');
    } catch { /* prehliadač nepodporuje */ }
  };
  const test = view.querySelector('#notify-test');
  if (test) test.onclick = () => { try { new Notification('ANASTASIA', { body: 'Takto vyzerá upozornenie na novú objednávku.' }); } catch {} };
}
let NOTIFY_TIMER = null;
let NOTIFY_BASE = null;
function startNotifyPolling() {
  if (NOTIFY_TIMER) return;
  const tick = async () => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
      const [o, c] = await Promise.all([
        api('/admin/orders?limit=1&order=-created_at').catch(() => null),
        api('/admin/chat/conversations?status=open&limit=1').catch(() => null),
      ]);
      const base = (Number(o?.count) || 0) + (Number(c?.unread) || 0);
      if (NOTIFY_BASE === null) { NOTIFY_BASE = base; return; }
      if (base > NOTIFY_BASE) {
        const diff = base - NOTIFY_BASE;
        new Notification('ANASTASIA', { body: diff === 1 ? 'Máte 1 novú objednávku alebo správu.' : `Máte ${diff} nových objednávok alebo správ.` });
      }
      NOTIFY_BASE = base;
    } catch { /* bez internetu nič */ }
  };
  NOTIFY_TIMER = setInterval(tick, 120000);
  tick();
}

// Klávesové skratky: „/“ hľadanie, „g“ + písmeno sekcia, „?“ nápoveda. V písacom poli skratky neplatia.
const SHORTCUT_SECTIONS = { o: '#/objednavky', p: '#/produkty', k: '#/kategorie', z: '#/zakaznicky', s: '#/spravy', n: '#/nastavenia', h: '#/pomoc' };
let shortcutG = false;
function wireShortcuts() {
  document.onkeydown = (e) => {
    const el = document.activeElement;
    const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    if (typing) {
      if (e.key === 'Escape') el.blur();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '/') {
      const s = document.querySelector('#view .rc-search, #view input[type=search]');
      if (s) { e.preventDefault(); s.focus(); s.select?.(); }
      return;
    }
    if (e.key === '?') { e.preventDefault(); location.hash = '#/pomoc'; return; }
    if (e.key === 'g') { shortcutG = true; setTimeout(() => { shortcutG = false; }, 1200); return; }
    if (shortcutG) {
      const target = SHORTCUT_SECTIONS[String(e.key).toLowerCase()];
      if (target) { e.preventDefault(); location.hash = target; }
      shortcutG = false;
    }
  };
}
// Pripravenosť obchodu: len z GET /admin/readiness (reálne dáta jadra). Čo sa nedá overiť, nikdy nevydávame za hotové.
function readinessCard(r) {  if (!r || !Array.isArray(r.checks)) return `<section class="panel" data-tour="readiness"><div class="panel-head"><h2>Pripravenosť obchodu</h2></div><p class="empty-task">Pripravenosť sa teraz nedá overiť. Skúste obnoviť stránku.</p></section>`;
  const open = r.checks.filter(c => c.status !== 'ok').sort((a, b) => (a.status === 'unknown') - (b.status === 'unknown') || (a.severity === 'blocker' ? -1 : 1) - (b.severity === 'blocker' ? -1 : 1));
  const ok = r.checks.length - open.length;
  const pill = (c) => c.status === 'unknown' ? '<span class="pill off">nedá sa overiť</span>' : c.severity === 'blocker' ? '<span class="pill off">bráni predaju</span>' : '<span class="pill warn">odporúčame doplniť</span>';
  const tone = (c) => c.status === 'unknown' ? '' : c.severity === 'blocker' ? 'wine' : '';
  const head = r.summary?.blockers ? `${r.summary.blockers} ${r.summary.blockers === 1 ? 'vec bráni' : 'veci bránia'} predaju.` : open.length ? 'Predaj je možný, niečo ešte odporúčame doplniť.' : 'Obchod je pripravený na predaj.';
  return `<section class="panel" data-tour="readiness"><div class="panel-head"><h2>Pripravenosť obchodu</h2><span class="tag">${ok} z ${r.checks.length} v poriadku</span></div>
    <p class="empty-task">${esc(head)}</p>
    ${open.map(c => `<article class="task"><div class="task-icon ${tone(c)}">${navIcon(c.status === 'unknown' ? 'help' : 'doc')}</div><div class="task-copy"><h3>${esc(c.title)}${c.count > 1 ? ` <span class="muted">(${c.count})</span>` : ''} ${pill(c)}</h3><p>${esc(c.hint)}</p>${c.href ? `<a class="subtle-link" href="${esc(c.href)}">Vyriešiť →</a>` : ''}</div></article>`).join('')}
  </section>`;
}

// Zoznamy ako prehľadná tabuľka (miniatúra, stĺpce, stavy, akcia). Stránky dodávajú buď `cols`, alebo `card(r)`
// v tvare .rc-media / .rc-title / .rc-f(em = názov stĺpca); z karty sa poskladá riadok tabuľky, takže všetky zoznamy
// vyzerajú rovnako ako Objednávky.
function listView(view, { cols, rows, title, onRow, empty, card, search = true }) {
  const genCard = (r) => {
    const cells = cols.map(c => ({ h: c.h, v: c.v(r) }));
    const head = cells.find(c => c.h) || cells[0] || { v: '' };
    const media = cells.find(c => !c.h);
    const rest = cells.filter(c => c !== head && c !== media && c.h);
    return `${media ? `<div class="rc-media">${media.v}</div>` : ''}<div class="rc-body"><div class="rc-title">${head.v}</div>
      <div class="rc-fields">${rest.map(c => `<span class="rc-f"><em>${esc(c.h)}</em>${c.v}</span>`).join('')}</div></div>`;
  };
  const tpl = document.createElement('template');
  const parsed = rows.map(r => {
    tpl.innerHTML = card ? card(r) : genCard(r);
    const root = tpl.content;
    const body = root.querySelector('.rc-body');
    const mediaEl = root.querySelector('.rc-media') || [...root.children].find(el => el !== body && !el.classList.contains('rc-body'));
    const fields = [...root.querySelectorAll('.rc-f')].map(f => { const em = f.querySelector('em'); const label = em ? em.textContent.trim() : ''; if (em) em.remove(); return { label, html: f.innerHTML }; });
    return { r, media: mediaEl ? mediaEl.innerHTML || mediaEl.outerHTML : '', title: root.querySelector('.rc-title')?.innerHTML || '', fields };
  });
  const labels = []; parsed.forEach(x => x.fields.forEach(f => { if (f.label && !labels.includes(f.label)) labels.push(f.label); }));
  const hasMedia = parsed.some(x => x.media);
  const titleHead = (cols && (cols.find(c => c.h) || {}).h) || 'Názov';
  const rowHtml = (x) => `<tr data-id="${esc(x.r.id ?? '')}"${onRow ? ' tabindex="0" role="link"' : ''}>${hasMedia ? `<td class="ot-img lv-media">${x.media}</td>` : ''}<td class="lv-title">${x.title}</td>${labels.map(l => `<td>${x.fields.find(f => f.label === l)?.html ?? '<span class="muted">—</span>'}</td>`).join('')}${onRow ? `<td class="ot-act"><button type="button" class="btn ghost sm">Otvoriť ${navIcon('arrow')}</button></td>` : ''}</tr>`;
  const colCount = (hasMedia ? 1 : 0) + 1 + labels.length + (onRow ? 1 : 0);
  const render = (list) => list.length ? list.map(rowHtml).join('') : `<tr><td colspan="${colCount}" class="empty">${esc(empty || 'Zatiaľ tu nič nie je.')}</td></tr>`;
  view.innerHTML = `<section class="card ot-card"><div class="ot-head"><h2>${esc(title)} <span class="muted">(${rows.length})</span></h2>
    ${search && rows.length > 6 ? '<input class="rc-search" type="search" placeholder="Hľadať…" aria-label="Hľadať">' : ''}</div>
    <div class="ot-wrap"><table class="ot lv"><thead><tr>${hasMedia ? '<th class="ot-img"><span class="sr-only">Obrázok</span></th>' : ''}<th>${esc(titleHead)}</th>${labels.map(l => `<th>${esc(l)}</th>`).join('')}${onRow ? '<th class="ot-act"><span class="sr-only">Akcia</span></th>' : ''}</tr></thead><tbody id="rc-wrap">${render(parsed)}</tbody></table></div></section>`;
  const wire = () => { if (onRow) view.querySelectorAll('#rc-wrap tr[data-id]').forEach(tr => { const open = () => onRow(rows.find(x => String(x.id) === tr.dataset.id) || rows[0]); tr.onclick = open; tr.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }; }); };
  wire();
  const s = view.querySelector('.rc-search');
  if (s) s.oninput = () => { const q = s.value.toLowerCase().trim(); const f = q ? parsed.filter(x => JSON.stringify(x.r).toLowerCase().includes(q)) : parsed; view.querySelector('#rc-wrap').innerHTML = render(f); wire(); };
}

// Prepínač podstránok (subnav) zostáva; podstránka mení len svoje tlačidlá vedľa neho.
function setActions(html) {
  const a = document.querySelector('#actions'); if (!a) return;
  const pills = a.querySelector(':scope > .pills');
  if (!pills) { a.innerHTML = html || ''; return; }
  let own = a.querySelector(':scope > .own-actions');
  if (!own) { own = document.createElement('span'); own.className = 'own-actions'; a.append(own); }
  own.innerHTML = html || '';
}

// --- záložky (kompaktne na jednu stránku) ---
function tabsHtml(tabs) {
  return `<div class="tabs">${tabs.map((t, i) => `<button class="tab ${i === 0 ? 'active' : ''}" data-tab="${t.id}">${esc(t.label)}</button>`).join('')}</div>
    <div>${tabs.map((t, i) => `<div class="tabpane ${i === 0 ? 'active' : ''}" data-pane="${t.id}">${t.html}</div>`).join('')}</div>`;
}
function wireTabs(scope) {
  scope.querySelectorAll('.tab').forEach(b => b.onclick = () => {
    scope.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === b));
    scope.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('active', p.dataset.pane === b.dataset.tab));
  });
}
// --- textový editor ako vo Worde (bez surových HTML tagov) ---
// Ukladá len bezpečný podmnožinový HTML: odseky, nadpisy, zoznamy, odkazy, citát, čiara, farba textu a zarovnanie.
// Vložený text z Wordu/webu sa vyčistí (mso štýly, triedy, fonty) rovnakou funkciou ako pri uložení.
const RT_TAGS = new Set(['P', 'H2', 'H3', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'UL', 'OL', 'LI', 'A', 'BLOCKQUOTE', 'BR', 'HR', 'SPAN']);
const RT_COLORS = ['#20271f', '#203b32', '#6f1d33', '#8a6a2b', '#657065'];
const RT_ALIGN = new Set(['left', 'center', 'right', 'justify']);
function cleanRichText(html) {
  const tpl = document.createElement('template'); tpl.innerHTML = String(html || '');
  const walk = (node) => {
    [...node.childNodes].forEach(n => {
      if (n.nodeType === 8) { n.remove(); return; }
      if (n.nodeType !== 1) return;
      let el = n;
      if (el.tagName === 'DIV') { const pEl = document.createElement('p'); pEl.append(...el.childNodes); el.replaceWith(pEl); el = pEl; }
      if (el.tagName === 'H1') { const h = document.createElement('h2'); h.append(...el.childNodes); el.replaceWith(h); el = h; }
      if (el.tagName === 'H4' || el.tagName === 'H5' || el.tagName === 'H6') { const h = document.createElement('h3'); h.append(...el.childNodes); el.replaceWith(h); el = h; }
      if (el.tagName === 'FONT') { const sp = document.createElement('span'); const c = el.getAttribute('color'); if (c) sp.style.color = c; sp.append(...el.childNodes); el.replaceWith(sp); el = sp; }
      if (!RT_TAGS.has(el.tagName)) { walk(el); el.replaceWith(...el.childNodes); return; }
      const color = el.style?.color, align = el.style?.textAlign, href = el.getAttribute('href');
      [...el.attributes].forEach(a => el.removeAttribute(a.name));
      if (el.tagName === 'A') { if (href && /^(https?:|mailto:|tel:|\/)/i.test(href.trim())) { el.setAttribute('href', href.trim()); if (/^https?:/i.test(href.trim())) { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener'); } } else { walk(el); el.replaceWith(...el.childNodes); return; } }
      if (color && el.tagName === 'SPAN') el.style.color = color;
      if (align && RT_ALIGN.has(align) && /^(P|H2|H3|BLOCKQUOTE|LI)$/.test(el.tagName)) el.style.textAlign = align;
      walk(el);
      if (el.tagName === 'SPAN' && !el.getAttribute('style')) el.replaceWith(...el.childNodes);
    });
  };
  walk(tpl.content);
  return tpl.innerHTML.replace(/<p>(\s|&nbsp;|<br>)*<\/p>/g, '').trim();
}
function wysiwygHtml(id, html) {
  const ic = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const b = (cmd, label, inner, val = '') => `<button type="button" data-cmd="${cmd}"${val ? ` data-val="${val}"` : ''} title="${label}" aria-label="${label}">${inner}</button>`;
  const sep = '<span class="rt-sep" aria-hidden="true"></span>';
  return `<div class="rt" data-rt="${id}"><div class="wysi-tb rt-tb" role="toolbar" aria-label="Formátovanie textu">
    ${b('undo', 'Späť (Ctrl+Z)', ic('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'))}${b('redo', 'Znova (Ctrl+Y)', ic('<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>'))}${sep}
    <select class="rt-block" aria-label="Štýl odseku"><option value="p">Normálny text</option><option value="h2">Nadpis 1</option><option value="h3">Nadpis 2</option><option value="blockquote">Citát</option></select>${sep}
    ${b('bold', 'Tučné (Ctrl+B)', '<b>B</b>')}${b('italic', 'Kurzíva (Ctrl+I)', '<i>I</i>')}${b('underline', 'Podčiarknuté (Ctrl+U)', '<u>U</u>')}${b('strikeThrough', 'Prečiarknuté', '<s>S</s>')}
    <span class="rt-colors" role="group" aria-label="Farba textu">${RT_COLORS.map(c => `<button type="button" data-cmd="foreColor" data-val="${c}" title="Farba textu" aria-label="Farba textu ${c}"><span style="background:${c}"></span></button>`).join('')}</span>${sep}
    ${b('justifyLeft', 'Zarovnať vľavo', ic('<path d="M4 6h16M4 12h10M4 18h14"/>'))}${b('justifyCenter', 'Na stred', ic('<path d="M4 6h16M7 12h10M5 18h14"/>'))}${b('justifyRight', 'Zarovnať vpravo', ic('<path d="M4 6h16M10 12h10M6 18h14"/>'))}${b('justifyFull', 'Do bloku', ic('<path d="M4 6h16M4 12h16M4 18h16"/>'))}${sep}
    ${b('insertUnorderedList', 'Odrážky', ic('<circle cx="5" cy="7" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="17" r="1"/><path d="M9 7h11M9 12h11M9 17h11"/>'))}${b('insertOrderedList', 'Číslovanie', ic('<path d="M10 7h10M10 12h10M10 17h10M4 6h1v4M4 10h2M4 15h2l-2 3h2"/>'))}${b('outdent', 'Zmenšiť odsadenie', ic('<path d="M20 6H10M20 12H10M20 18H10M7 9l-3 3 3 3"/>'))}${b('indent', 'Zväčšiť odsadenie', ic('<path d="M20 6H10M20 12H10M20 18H10M4 9l3 3-3 3"/>'))}${sep}
    ${b('createLink', 'Vložiť odkaz (Ctrl+K)', ic('<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>'))}${b('unlink', 'Odstrániť odkaz', ic('<path d="M10 14a4 4 0 0 0 5.66 0l1-1M14 10a4 4 0 0 0-5.66 0l-1 1M4 4l16 16"/>'))}${b('insertHorizontalRule', 'Vodorovná čiara', ic('<path d="M4 12h16"/>'))}${b('removeFormat', 'Vymazať formátovanie', ic('<path d="M6 4h12M12 4l-4 16M4 20l16-16"/>'))}
  </div>
  <div class="wysi rt-page" id="${id}" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Text popisu" spellcheck="true" lang="sk">${cleanRichText(html || '')}</div>
  <div class="rt-status" aria-live="polite"></div></div>`;
}
function wireWysiwyg(scope) {
  scope.querySelectorAll('.rt').forEach(box => {
    const ed = box.querySelector('.wysi'), tb = box.querySelector('.rt-tb'), st = box.querySelector('.rt-status'), blk = box.querySelector('.rt-block');
    try { document.execCommand('styleWithCSS', false, true); document.execCommand('defaultParagraphSeparator', false, 'p'); } catch {}
    const words = () => { const t = ed.innerText.trim(); st.textContent = `${t ? t.split(/\s+/).length : 0} slov · ${t.length} znakov`; };
    const states = () => {
      tb.querySelectorAll('button[data-cmd]').forEach(x => { let on = false; try { on = ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList', 'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'].includes(x.dataset.cmd) && document.queryCommandState(x.dataset.cmd); } catch {} x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
      let fb = ''; try { fb = String(document.queryCommandValue('formatBlock') || '').toLowerCase(); } catch {}
      blk.value = ['h2', 'h3', 'blockquote'].includes(fb) ? fb : 'p';
    };
    const run = (cmd, val) => {
      ed.focus();
      if (cmd === 'createLink') { const u = prompt('Adresa odkazu (https://… alebo /stranka):', 'https://'); if (!u || u === 'https://') return; val = u.trim(); }
      document.execCommand(cmd, false, val ?? null); states(); words();
    };
    tb.querySelectorAll('button[data-cmd]').forEach(x => x.onmousedown = (e) => { e.preventDefault(); run(x.dataset.cmd, x.dataset.val); });
    blk.onchange = () => run('formatBlock', `<${blk.value}>`);
    ed.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); run('createLink'); } });
    ed.addEventListener('paste', (e) => {
      const html = e.clipboardData?.getData('text/html'), text = e.clipboardData?.getData('text/plain');
      e.preventDefault();
      if (html) document.execCommand('insertHTML', false, cleanRichText(html));
      else if (text) document.execCommand('insertHTML', false, text.split(/\n{2,}/).map(par => `<p>${esc(par).replace(/\n/g, '<br>')}</p>`).join(''));
      words();
    });
    ['keyup', 'mouseup', 'input'].forEach(ev => ed.addEventListener(ev, () => { states(); if (ev === 'input') words(); }));
    document.addEventListener('selectionchange', () => { if (document.activeElement === ed) states(); });
    words();
  });
}
// --- akcia/výpredaj cez sale price list (engine číta calculated vs original) ---
const SALE_LIST_TITLE = 'ANASTASIA výpredaj';
async function getSaleListId() {
  const { price_lists } = await api('/admin/price-lists?limit=100&fields=id,title');
  const ex = (price_lists || []).find(p => p.title === SALE_LIST_TITLE);
  if (ex) return ex.id;
  const { price_list } = await api('/admin/price-lists', { method: 'POST', body: { title: SALE_LIST_TITLE, description: 'Akčné/výpredajové ceny spravované z administrácie ANASTASIA', type: 'sale', status: 'active' } });
  return price_list.id;
}
async function applyVariantSale(variantId, amount, ref) {
  const listId = (ref && ref.price_list_id) || await getSaleListId();
  if (ref && ref.price_id) {
    await api(`/admin/price-lists/${listId}/prices/batch`, { method: 'POST', body: { update: [{ id: ref.price_id, amount: Number(amount), currency_code: 'eur' }] } });
    return { price_list_id: listId, price_id: ref.price_id };
  }
  const r = await api(`/admin/price-lists/${listId}/prices/batch`, { method: 'POST', body: { create: [{ variant_id: variantId, amount: Number(amount), currency_code: 'eur' }] } });
  const created = (r.created || r.prices || [])[0] || {};
  return { price_list_id: listId, price_id: created.id };
}
async function clearVariantSale(ref) {
  if (ref && ref.price_list_id && ref.price_id) {
    try { await api(`/admin/price-lists/${ref.price_list_id}/prices/batch`, { method: 'POST', body: { delete: [ref.price_id] } }); } catch {}
  }
}
// Základná EUR cena bez cenníka a pravidiel (akciový cenník má vlastnú cenu na tom istom variante).
const basePrice = (v) => (v?.prices || []).find(x => x.currency_code === 'eur' && !x.price_list_id && !(x.rules_count > 0));
// --- Produkty: serverové stránkovanie, vyhľadávanie a filter stavu (jadro filtruje aj počíta) ---
const PRODUCT_PAGE_SIZE = 50;
const PRODUCT_STATUS = { published: ['zverejnený', 'ok'], draft: ['koncept', 'warn'] };
async function vProducts(view) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam produkty…</div>';
  setActions('<button class="btn wine" id="p-new">+ Pridať produkt</button>');
  const nb = document.querySelector('#p-new'); if (nb) nb.onclick = () => vProductNew(view);
  let offset = 0, query = '', status = '', type = '', count = 0, busy = false, pending = false;
  const selected = new Set();
  // Sklad: súčet zásob podľa SKU (inventory item má rovnaké SKU ako variant).
  let stockBySku = new Map();
  const stockOf = (p) => {
    const skus = (p.variants || []).map(v => v.sku).filter(Boolean);
    if (!skus.length) return null;
    if (p.digital) return null;
    let total = 0, known = false;
    for (const sku of skus) { const v = stockBySku.get(sku); if (v !== undefined) { total += v; known = true; } }
    return known ? total : null;
  };
  const row = p => {
    const stock = stockOf(p);
    return `<tr data-id="${esc(p.id)}" tabindex="0" role="link">
      <td class="ot-check"><input type="checkbox" data-pick="${esc(p.id)}" aria-label="Označiť produkt ${esc(p.title)}"></td>
      <td class="ot-img lv-media">${p.thumbnail ? `<img class="thumb" src="${esc(p.thumbnail)}" alt="">` : '<span class="thumb ph"></span>'}</td>
      <td class="lv-title">${esc(p.title)}</td>
      <td><span class="pill ${PRODUCT_STATUS[p.status]?.[1] || 'warn'}">${esc(PRODUCT_STATUS[p.status]?.[0] || p.status || '—')}</span></td>
      <td>${p.digital ? '<span class="pill ok">digitálny</span>' : '<span class="muted">fyzický</span>'}</td>
      <td>${fmtEur(basePrice(p.variants?.[0])?.amount)}</td>
      <td>${stock === null ? '<span class="muted">—</span>' : stock <= 0 ? '<span class="pill off">vypredané</span>' : stock <= 5 ? `<span class="pill warn">${stock} ks</span>` : `<span>${stock} ks</span>`}</td>
      <td>${(() => { const s = p.metadata?.vyprodej; return (s && s.active && s.akcna_cena != null) ? `<span class="pill warn">${fmtEur(s.akcna_cena)}</span>` : '<span class="muted">—</span>'; })()}</td>
      <td class="ot-act"><button type="button" class="btn ghost sm">Otvoriť ${navIcon('arrow')}</button></td></tr>`;
  };
  view.innerHTML = `<section class="card ot-card"><div class="ot-head">
      <h2>Produkty <span class="muted" id="p-count"></span></h2>
      <div class="ot-head-act">
        <input class="rc-search" type="search" placeholder="Hľadať produkt…" aria-label="Hľadať produkty">
        <select class="rc-select" id="p-type" aria-label="Filter podľa typu">
          <option value="">Fyzické aj digitálne</option>
          <option value="digital">Digitálne</option>
          <option value="physical">Fyzické</option>
        </select>
        <select class="rc-select" id="p-status" aria-label="Filter podľa stavu">
          <option value="">Všetky stavy</option>
          <option value="published">Zverejnené</option>
          <option value="draft">Koncepty</option>
        </select>
      </div>
    </div>
    <div class="ot-bulk" id="p-bulk" hidden><span class="muted" id="p-bulk-info">Žiadny označený produkt</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn ghost sm" id="p-bulk-publish">Zverejniť</button>
        <button type="button" class="btn ghost sm" id="p-bulk-draft">Uložiť ako koncept</button>
        <button type="button" class="btn ghost sm" id="p-bulk-clear">Zrušiť označenie</button>
      </div></div>
    <div class="ot-wrap"><table class="ot lv"><thead><tr><th class="ot-check"><input type="checkbox" id="p-pick-all" aria-label="Označiť všetky produkty na strane"></th><th class="ot-img"><span class="sr-only">Obrázok</span></th><th>Názov</th><th>Stav</th><th>Typ</th><th>Cena s DPH</th><th>Sklad</th><th>Akcia</th><th class="ot-act"><span class="sr-only">Akcia</span></th></tr></thead><tbody id="p-body"></tbody></table></div>
    <div class="ot-foot"><span class="muted" id="p-range"></span><div style="display:flex;gap:8px"><button class="btn ghost" data-pg="prev">← Predchádzajúce</button><button class="btn ghost" data-pg="next">Ďalšie →</button></div></div>
  </section>`;
  const body = view.querySelector('#p-body');
  const load = async () => {
    // Ak už beží požiadavka, nezahadzujeme novú – po skončení sa zopakuje s poslednými údajmi.
    if (busy) { pending = true; return; }
    busy = true; body.innerHTML = '<tr><td colspan="7" class="empty">Načítavam…</td></tr>';
    try {
      const params = new URLSearchParams({ limit: String(PRODUCT_PAGE_SIZE), offset: String(offset) });
      if (query) params.set('q', query);
      if (status) params.set('status', status);
      if (type) params.set('type', type);
      const [data, inv] = await Promise.all([
        api(`/admin/product-catalogue?${params}`),
        api('/admin/inventory-items?limit=500&fields=id,sku,*inventory_levels').catch(() => null),
      ]);
      const products = data.products || [];
      count = Number(data.count) || 0;
      stockBySku = new Map((inv?.inventory_items || []).map(i => [i.sku, (i.inventory_levels || []).reduce((a, l) => a + Number(l.stocked_quantity || 0), 0)]));
      body.innerHTML = products.length ? products.map(row).join('') : `<tr><td colspan="9" class="empty">${count ? 'Žiadny produkt nezodpovedá výberu.' : 'Zatiaľ žiadne produkty.'}</td></tr>`;
      body.querySelectorAll('tr[data-id]').forEach(tr => {
        const open = () => vProductDetail(view, tr.dataset.id);
        tr.onclick = open; tr.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
        const box = tr.querySelector('[data-pick]');
        if (box) {
          box.checked = selected.has(tr.dataset.id);
          box.onclick = (e) => e.stopPropagation();
          box.onchange = () => { if (box.checked) selected.add(tr.dataset.id); else selected.delete(tr.dataset.id); drawBulk(); };
        }
      });
      const all = view.querySelector('#p-pick-all');
      if (all) {
        const ids = products.map(p => p.id);
        all.checked = ids.length > 0 && ids.every(id => selected.has(id));
        all.indeterminate = !all.checked && ids.some(id => selected.has(id));
        all.onchange = () => { ids.forEach(id => all.checked ? selected.add(id) : selected.delete(id)); load(); };
      }
      drawBulk();
      const from = count ? offset + 1 : 0, to = Math.min(offset + products.length, count);
      view.querySelector('#p-count').textContent = `(${count})`;
      view.querySelector('#p-range').textContent = count ? `${from}–${to} z ${count}` : 'Zatiaľ žiadne produkty';
      view.querySelector('[data-pg="prev"]').disabled = offset <= 0;
      view.querySelector('[data-pg="next"]').disabled = offset + PRODUCT_PAGE_SIZE >= count;
    } catch (e) {
      if (e.message !== '401') body.innerHTML = `<tr><td colspan="7" class="empty">${esc(e.message)}</td></tr>`;
    } finally {
      busy = false;
      if (pending) { pending = false; load(); }
    }
  };
  const bulkBar = view.querySelector('#p-bulk'), bulkInfo = view.querySelector('#p-bulk-info');
  const drawBulk = () => {
    if (!bulkBar) return;
    bulkBar.hidden = !selected.size;
    if (bulkInfo) bulkInfo.textContent = selected.size ? `Označené produkty: ${selected.size}` : 'Žiadny označený produkt';
  };
  const bulkStatus = async (status) => {
    const ids = [...selected];
    if (!ids.length) return;
    const msg = view.querySelector('#p-msg') || document.createElement('div');
    const skipped = [];
    let done = 0;
    for (const id of ids) {
      try {
        const d = (await api(`/admin/products/${id}?fields=id,title,*variants.prices,*variants.sku,*sales_channels`)).product;
        const hasPrice = (d.variants || []).some(v => (v.prices || []).some(p => p.currency_code === 'eur' && Number(p.amount) > 0));
        const hasChannel = (d.sales_channels || []).length > 0;
        const hasSku = (d.variants || []).every(v => !!v.sku);
        if (status === 'published' && !(hasPrice && hasChannel && hasSku)) {
          skipped.push(`${d.title || id}${!hasPrice ? ' (chýba cena)' : !hasChannel ? ' (chýba predajný kanál)' : ' (chýba kód produktu)'}`);
          continue;
        }
        await api(`/admin/products/${id}`, { method: 'POST', body: { status } });
        done++;
      } catch (e) { skipped.push(`${id}: ${e.message}`); }
    }
    selected.clear();
    await load();
    const note = document.createElement('div');
    note.className = skipped.length ? 'notice' : 'ok';
    note.innerHTML = skipped.length
      ? `Zmenených: ${done}. Preskočené: ${esc(skipped.join(', '))}`
      : `Zmenených produktov: ${done}`;
    const host = view.querySelector('.ot-head');
    host?.insertAdjacentElement('afterend', note);
  };
  const bp = view.querySelector('#p-bulk-publish'), bd = view.querySelector('#p-bulk-draft'), bc = view.querySelector('#p-bulk-clear');
  if (bp) bp.onclick = () => bulkStatus('published');
  if (bd) bd.onclick = () => bulkStatus('draft');
  if (bc) bc.onclick = () => { selected.clear(); load(); };
  view.querySelector('[data-pg="prev"]').onclick = () => { if (offset <= 0) return; offset = Math.max(0, offset - PRODUCT_PAGE_SIZE); load(); };
  view.querySelector('[data-pg="next"]').onclick = () => { if (offset + PRODUCT_PAGE_SIZE >= count) return; offset += PRODUCT_PAGE_SIZE; load(); };
  let timer = null;
  const search = view.querySelector('.rc-search');
  search.oninput = () => { clearTimeout(timer); timer = setTimeout(() => { query = search.value.trim(); offset = 0; load(); }, 350); };
  view.querySelector('#p-status').onchange = (e) => { status = e.target.value; offset = 0; load(); };
  view.querySelector('#p-type').onchange = (e) => { type = e.target.value; offset = 0; load(); };
  load();
}
const SKU_RE = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;
const skuFrom = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const shipLabel = (sp) => sp.type === 'digital' ? 'Digitálny produkt / služba (bez dopravy)' : sp.type === 'default' ? 'Fyzický tovar (doprava kuriérom)' : sp.name;
async function vProductNew(view) {
  view = freshView(view);
  let profiles = []; try { profiles = (await api('/admin/shipping-profiles?limit=50&fields=id,name,type')).shipping_profiles || []; } catch (e) { if (e.message === '401') throw e; }
  view.innerHTML = `<div class="card"><div class="card-h">Nový produkt<button class="btn ghost" id="pn-back">Späť</button></div><div class="card-b">
    <div id="pnmsg"></div>
    <label>Názov</label><input id="pn-title" placeholder="napr. Konzultačný balík">
    <div class="row"><div><label>Cena (EUR)</label><input id="pn-price" type="number" step="0.01" placeholder="0.00"></div>
    <div><label>Stav</label><select id="pn-status"><option value="draft">Koncept</option><option value="published">Zverejnený</option></select></div></div>
    <label>Kód produktu (SKU)</label><input id="pn-sku" maxlength="64" placeholder="napr. RUZOVY-OLEJ-50ML" autocomplete="off">
    <label>Typ produktu</label><select id="pn-ship"><option value="">— vyberte —</option>${profiles.map(sp => `<option value="${esc(sp.id)}">${esc(shipLabel(sp))}</option>`).join('')}</select>
    <div style="margin-top:16px"><button class="btn gold" id="pn-save">Vytvoriť produkt</button></div>
    <p class="muted" style="margin-top:10px;font-size:12px">Produkt vznikne s jedným variantom a cenou v EUR. Typ produktu určuje dopravu v pokladni. Obrázky, sklad, predajné kanály, popis a kategórie doplníte v úprave.</p>
  </div></div>`;
  view.querySelector('#pn-back').onclick = () => vProducts(view);
  const skuIn = view.querySelector('#pn-sku');
  skuIn.oninput = () => { skuIn.dataset.manual = '1'; };
  view.querySelector('#pn-title').oninput = (e) => { if (!skuIn.dataset.manual) skuIn.value = skuFrom(e.target.value); };
  view.querySelector('#pn-save').onclick = async () => {
    const msg = view.querySelector('#pnmsg'); msg.innerHTML = '';
    const title = view.querySelector('#pn-title').value.trim();
    const amount = Number(view.querySelector('#pn-price').value);
    const status = view.querySelector('#pn-status').value;
    const shipProfile = view.querySelector('#pn-ship').value;
    if (!shipProfile) { msg.innerHTML = '<div class="err">Vyberte typ produktu (fyzický tovar alebo digitálny). Bez neho sa produkt nedá doručiť ani objednať.</div>'; return; }
    if (!title) { msg.innerHTML = '<div class="err">Zadajte názov produktu.</div>'; return; }
    const sku = skuIn.value.trim().toUpperCase();
    if (!SKU_RE.test(sku)) { msg.innerHTML = '<div class="err">Zadajte kód produktu (SKU): 2–64 znakov, len písmená A–Z, číslice, bodka, pomlčka alebo podčiarknik. Bez kódu obchod nevie produkt naceniť.</div>'; return; }
    if (status === 'published' && !(amount > 0)) { msg.innerHTML = '<div class="err">Zverejniť sa dá len produkt s cenou. Zadajte cenu alebo ho uložte ako koncept.</div>'; return; }
    // Digitálny produkt/služba nemá sklad – inak by ho jadro bez skladovej položky nepustilo do košíka.
    const digital = profiles.find(sp => sp.id === shipProfile)?.type === 'digital';
    const btn = view.querySelector('#pn-save'); btn.disabled = true;
    try {
      let channels = []; try { channels = (await api('/admin/sales-channels?limit=50&fields=id')).sales_channels || []; } catch (e) { if (e.message === '401') throw e; }
      const body = { title, status, shipping_profile_id: shipProfile, ...(channels.length === 1 ? { sales_channels: [{ id: channels[0].id }] } : {}), options: [{ title: 'Variant', values: ['Štandard'] }],
        variants: [{ title: 'Štandard', sku, manage_inventory: digital ? false : true, options: { Variant: 'Štandard' }, prices: amount > 0 ? [{ amount, currency_code: 'eur' }] : [] }] };
      const { product } = await api('/admin/products', { method: 'POST', body });
      // Digitálny produkt sa otvorí priamo na záložke so súbormi, ktoré zákazníci dostanú.
      if (digital) vProductDetail(view, product.id, { tab: 'obsah', notice: 'Digitálny produkt je založený. Nahrajte súbory, ktoré zákazníci dostanú v knižnici.' });
      else vProductDetail(view, product.id);
    } catch (e) { btn.disabled = false; msg.innerHTML = `<div class="err">Jadro odmietlo: ${esc(e.message)}</div>`; }
  };
}
async function vProductDetail(view, id, opts = {}) {
  view = freshView(view);
  setActions('');
  view.innerHTML = '<div class="muted">Načítavam…</div>';
  const { product: p } = await api(`/admin/products/${id}?fields=id,title,status,description,thumbnail,metadata,*images,*sales_channels,*variants.prices,*categories,variants.manage_inventory,variants.sku,*variants.inventory_items,*shipping_profile`);
  const variant = p.variants?.[0]; const price = basePrice(variant);
  const soft = (e) => { if (e.message === '401') throw e; return null; };
  const [catsR, chR, locR, spR] = await Promise.all([
    api('/admin/product-categories?limit=200&fields=id,name').catch(soft),
    api('/admin/sales-channels?limit=50&fields=id,name,is_disabled').catch(soft),
    api('/admin/stock-locations?limit=50&fields=id,name').catch(soft),
    api('/admin/shipping-profiles?limit=50&fields=id,name,type').catch(soft),
  ]);
  const profiles = spR?.shipping_profiles || [], curProfile = p.shipping_profile?.id || '';
  const cats = catsR?.product_categories || [], channels = chR?.sales_channels || [], locations = locR?.stock_locations || [];
  const inC = new Set((p.categories || []).map(c => c.id)), inCh = new Set((p.sales_channels || []).map(c => c.id));
  const invItemId = variant?.inventory_items?.[0]?.inventory_item_id || null;
  let levels = [];
  if (variant?.manage_inventory && invItemId) { try { levels = (await api(`/admin/inventory-items/${invItemId}/location-levels?limit=50`)).inventory_levels || []; } catch (e) { soft(e); } }
  let images = (p.images || []).map(i => i.url).filter(Boolean), thumb = p.thumbnail || images[0] || null;
  const sale = (p.metadata && p.metadata.vyprodej) || {};
  const saleOn = !!sale.active;
  const zakladne = `<label>Názov</label><input id="p-title" value="${esc(p.title)}">
    <label>Stav</label><select id="p-status"><option value="published"${p.status === 'published' ? ' selected' : ''}>Zverejnený</option><option value="draft"${p.status === 'draft' ? ' selected' : ''}>Koncept</option></select>`;
  const cena = `<div class="row"><div><label>Bežná cena (EUR)${variant ? '' : ' — bez variantu'}</label><input id="p-price" type="number" step="0.01" value="${price?.amount ?? ''}" ${variant ? '' : 'disabled'}></div>
    <div><label>Akcia</label><label style="display:flex;gap:8px;align-items:center;margin:6px 0 0"><input type="checkbox" id="p-sale-on" ${saleOn ? 'checked' : ''} style="width:auto"> Vo výpredaji / akcia</label></div></div>
    <div id="p-sale-box" class="sale-on ${saleOn ? '' : 'hidden'}">
      <div class="row"><div><label>Akčná cena (EUR)</label><input id="p-sale-price" type="number" step="0.01" value="${sale.akcna_cena ?? ''}"></div>
      <div><label>Platí do (voliteľné)</label><input id="p-sale-to" type="date" value="${esc(sale.do || '')}"></div></div>
      <div class="muted" style="font-size:12px;margin-top:6px">Akčná cena sa prejaví ako zľava oproti bežnej cene (číta ju cenový engine jadra).</div>
    </div>`;
  const kategorie = `<label for="p-category">Pridať kategóriu</label><select id="p-category" ${catsR ? '' : 'disabled'}><option value="">Vyberte kategóriu…</option>${cats.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select><div id="p-categories" class="category-chips"></div><a class="subtle-link" href="#/kategorie">Spravovať kategórie →</a>${catsR ? '' : '<p class="muted">Kategórie sa nepodarilo načítať. Pôvodné zaradenie zostane zachované.</p>'}`;
  const popis = wysiwygHtml('p-desc', p.description || '');
  const obrazky = `<div id="p-imgs" class="rc-grid"></div>
    <label style="margin-top:12px">Pridať obrázky (JPG, PNG, WebP do 5 MB)</label><input type="file" id="p-file" accept="image/jpeg,image/png,image/webp" multiple>
    <p class="muted" style="font-size:12px">Hlavný obrázok sa zobrazuje v zozname produktov a vo výsledkoch vyhľadávania. Zmeny sa uložia tlačidlom Uložiť.</p>`;
  const predaj = `<label>Kód produktu (SKU)</label>${!variant ? '<p class="muted">Produkt nemá variant.</p>' : variant.sku ? `<input id="p-sku" value="${esc(variant.sku)}" maxlength="64" autocomplete="off"><p class="muted" style="font-size:12px">Kód môžete zmeniť. Pozor: QR kódy vytvorené pre starý kód prestanú fungovať a treba ich vytvoriť znova.</p>` : '<input id="p-sku" maxlength="64" placeholder="napr. RUZOVY-OLEJ-50ML" autocomplete="off">'}
    <div class="row"><div><label for="p-ean">EAN (čiarový kód)</label><input id="p-ean" value="${esc(String(variant?.barcode || variant?.ean || ''))}" maxlength="64" inputmode="numeric" autocomplete="off" placeholder="napr. 5901234123457"></div>
    <div><label for="p-weight">Hmotnosť (kg)</label><input id="p-weight" type="number" min="0" step="0.001" value="${esc(String(variant?.weight ?? ''))}" placeholder="napr. 0.25"></div></div>
    <p class="muted" style="font-size:12px;margin-top:6px">EAN a hmotnosť sa doplnia do feedov pre porovnávače a do dopravných údajov.</p>
    <label>Typ produktu (doprava)</label><select id="p-ship"><option value="">— vyberte —</option>${profiles.map(sp => `<option value="${esc(sp.id)}"${sp.id === curProfile ? ' selected' : ''}>${esc(shipLabel(sp))}</option>`).join('')}</select>
    <p class="muted" style="margin-top:14px">Produkt sa v obchode zobrazí len v označených predajných kanáloch.</p>
    <div>${channels.map(c => `<label style="display:inline-flex;gap:6px;margin:4px 12px 4px 0;align-items:center"><input type="checkbox" data-ch="${esc(c.id)}" ${inCh.has(c.id) ? 'checked' : ''} style="width:auto"> ${esc(c.name)}${c.is_disabled ? ' <span class="pill off">vypnutý</span>' : ''}</label>`).join('') || '<span class="muted">Predajné kanály sa nedajú načítať.</span>'}</div>`;
  const sklad = !variant ? '<p class="muted">Produkt nemá variant.</p>' : `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="p-inv" ${variant.manage_inventory ? 'checked' : ''} style="width:auto"> Sledovať počet kusov na sklade</label>
    <p class="muted" style="font-size:12px">Digitálne produkty, konzultácie a členstvo sklad nesledujú. Pri fyzickom tovare jadro nepustí predať viac kusov, než je na sklade.</p>
    ${!variant.manage_inventory ? '<p class="muted" style="font-size:12px">Po zapnutí a uložení sa tu zobrazia počty kusov po skladoch.</p>' : ''}
    ${variant.manage_inventory ? (!locations.length ? '<div class="notice">Najprv v Nastaveniach založte sklad.</div>' : `<div class="rc-grid">${locations.map(l => { const lv = levels.find(x => x.location_id === l.id);
      return `<div class="rc"><div class="rc-body"><div class="rc-title">${esc(l.name)}</div><div class="rc-fields">
        <span class="rc-f"><em>Na sklade</em><input type="number" min="0" step="1" data-loc="${esc(l.id)}" data-has="${lv ? 1 : 0}" value="${lv ? lv.stocked_quantity : ''}" placeholder="0" style="max-width:110px"></span>
        ${lv ? `<span class="rc-f"><em>Rezervované</em>${lv.reserved_quantity ?? 0}</span>` : ''}</div></div></div>`; }).join('')}</div>`) : ''}`;
  const completeness = () => {
    const np = Number(view.querySelector('#p-price')?.value);
    const chosenCh = [...view.querySelectorAll('[data-ch]')].some(cb => cb.checked), chosenCat = inC.size > 0;
    return [
      { ok: !!variant && np > 0, block: true, t: 'Cena v EUR' },
      { ok: chosenCh || !channels.length && inCh.size > 0, block: true, t: 'Predajný kanál' },
      { ok: !!view.querySelector('#p-ship')?.value || !profiles.length && !!curProfile, block: true, t: 'Typ produktu (doprava)' },
      { ok: !!variant?.sku || SKU_RE.test((view.querySelector('#p-sku')?.value || '').trim().toUpperCase()), block: true, t: 'Kód produktu (SKU)' },
      { ok: images.length > 0, block: false, t: 'Obrázok' },
      { ok: chosenCat, block: false, t: 'Kategória' },
    ];
  };
  const renderChecks = () => { const box = view.querySelector('#p-checks'); if (!box) return;
    box.innerHTML = completeness().map(c => `<span class="pill ${c.ok ? 'ok' : c.block ? 'off' : 'warn'}" style="margin:0 6px 6px 0">${c.ok ? '✓' : c.block ? '✕' : '!'} ${esc(c.t)}</span>`).join(''); };
  // Editor v záložkách (ako centrálna správa produktov): každá záložka sa zmestí na jednu obrazovku,
  // všetky polia ostávajú v DOM, takže Uložiť zapíše zmeny zo všetkých záložiek naraz.
  const TABS = [['zaklad', 'Základné údaje'], ['popis', 'Popis'], ['foto', 'Fotografie'], ['predaj', 'Kategórie a predaj'], ['sklad', 'Sklad'], ['obsah', 'Zakúpený obsah']];
  const activeTab = TABS.some(([k]) => k === opts.tab) ? opts.tab : TABS[0][0];
  const panel = (key, html) => `<div class="pe-panel" data-panel="${key}"${key === activeTab ? '' : ' hidden'}>${html}</div>`;
  view.innerHTML = `<div class="card"><div class="card-h">Úprava produktu<div class="card-h-act"><button class="btn ghost" id="p-back">Späť</button><button class="btn gold" id="p-save">Uložiť zmeny</button></div></div><div class="card-b">
    <div id="pmsg">${opts.notice ? `<div class="notice">${esc(opts.notice)}</div>` : ''}</div>
    <div id="p-checks" style="margin-bottom:10px"></div>
    <div class="pe-tabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === activeTab}">${esc(l)}</button>`).join('')}</div>
    ${panel('zaklad', `<div class="product-editor"><div><section class="editor-section"><h2>Základné údaje</h2>${zakladne}</section></div><div><section class="editor-section"><h2>Cena a akcia</h2>${cena}</section></div></div>`)}
    ${panel('popis', `<section class="editor-section"><h2>Popis produktu</h2>${popis}</section>`)}
    ${panel('foto', `<section class="editor-section"><h2>Fotografie</h2>${obrazky}</section>`)}
    ${panel('predaj', `<div class="product-editor"><div><section class="editor-section"><h2>Kategórie</h2>${kategorie}</section></div><div><section class="editor-section"><h2>Predaj a doručenie</h2>${predaj}</section></div></div>`)}
    ${panel('sklad', `<section class="editor-section"><h2>Sklad</h2>${sklad}</section>`)}
    ${panel('obsah', `<section class="editor-section"><h2>Zakúpený obsah</h2><div id="p-library"></div></section>`)}
  </div></div>`;
  view.querySelectorAll('.pe-tabs [data-tab]').forEach(b => b.onclick = () => {
    view.querySelectorAll('.pe-tabs [data-tab]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    view.querySelectorAll('.pe-panel').forEach(x => { x.hidden = x.dataset.panel !== b.dataset.tab; });
  });
  wireWysiwyg(view);
  const libraryEditor = await mountLibraryEditor(view.querySelector('#p-library'), { api, productId: id });
  const drawCategories = () => {
    view.querySelector('#p-categories').innerHTML = [...inC].map(id => `<button type="button" class="btn ghost" data-category-remove="${esc(id)}" aria-label="Odobrať kategóriu ${esc(cats.find(c => c.id === id)?.name || p.categories?.find(c => c.id === id)?.name || 'z produktu')}">${esc(cats.find(c => c.id === id)?.name || p.categories?.find(c => c.id === id)?.name || 'Priradená kategória')} ×</button>`).join('');
    view.querySelectorAll('[data-category-remove]').forEach(b => b.onclick = () => { inC.delete(b.dataset.categoryRemove); drawCategories(); renderChecks(); });
    [...view.querySelector('#p-category').options].forEach(o => { o.disabled = inC.has(o.value); });
  };
  view.querySelector('#p-category').onchange = e => { if (e.target.value) inC.add(e.target.value); e.target.value = ''; drawCategories(); renderChecks(); };
  drawCategories();
  view.querySelector('#p-back').onclick = () => vProducts(view);
  const drawImgs = () => {
    view.querySelector('#p-imgs').innerHTML = images.map((u, i) => `<div class="rc"><div class="rc-body"><img src="${esc(u)}" alt="" class="product-photo">
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">${u === thumb ? '<span class="pill ok">hlavný</span>' : `<button type="button" class="btn ghost" data-main="${i}">Hlavný</button>`}<button type="button" class="btn ghost" data-rm="${i}">Odstrániť</button></div></div></div>`).join('') || '<div class="empty">Produkt zatiaľ nemá obrázok.</div>';
    view.querySelectorAll('[data-main]').forEach(b => b.onclick = () => { thumb = images[+b.dataset.main]; drawImgs(); });
    view.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { const u = images.splice(+b.dataset.rm, 1)[0]; if (thumb === u) thumb = images[0] || null; drawImgs(); renderChecks(); });
  };
  drawImgs(); renderChecks();
  view.querySelectorAll('#p-price,#p-ship,#p-sku,[data-ch],[data-c]').forEach(el => el.addEventListener('change', renderChecks));
  view.querySelector('#p-file').onchange = async (e) => {
    const msg = view.querySelector('#pmsg'), files = [...e.target.files]; msg.innerHTML = '';
    const bad = files.find(f => !/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 5 * 1024 * 1024);
    if (bad) { msg.innerHTML = `<div class="err">${esc(bad.name)}: povolené sú JPG, PNG a WebP do 5 MB.</div>`; e.target.value = ''; return; }
    if (!files.length) return;
    const fd = new FormData(); files.forEach(f => fd.append('files', f));
    e.target.disabled = true; msg.innerHTML = '<div class="muted">Nahrávam…</div>';
    try {
      const res = await fetch(API + '/admin/uploads', { method: 'POST', headers: token ? { authorization: 'Bearer ' + token } : {}, body: fd });
      if (res.status === 401) { token = ''; localStorage.removeItem('ana_token'); renderLogin('Prihlásenie vypršalo.'); return; }
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.message || 'Nahratie zlyhalo.');
      const urls = (d.files || []).map(f => f.url).filter(Boolean);
      images.push(...urls); if (!thumb) thumb = images[0] || null;
      drawImgs(); renderChecks(); msg.innerHTML = '<div class="notice">Obrázky sú nahraté. Nezabudnite Uložiť.</div>';
    } catch (err) { msg.innerHTML = `<div class="err">${esc(err.message)}</div>`; }
    finally { e.target.disabled = false; e.target.value = ''; }
  };
  const box = view.querySelector('#p-sale-box');
  view.querySelector('#p-sale-on').onchange = (e) => box.classList.toggle('hidden', !e.target.checked);
  view.querySelector('#p-save').onclick = async () => {
    const msg = view.querySelector('#pmsg'); msg.innerHTML = ''; const btn = view.querySelector('#p-save');
    const wantStatus = view.querySelector('#p-status').value;
    if (!view.querySelector('#p-title').value.trim()) { msg.innerHTML = '<div class="err">Zadajte názov produktu.</div>'; return; }
    const amountInput = view.querySelector('#p-price');
    if (amountInput.value !== '' && (!amountInput.validity.valid || !Number.isFinite(Number(amountInput.value)) || Number(amountInput.value) < 0)) { msg.innerHTML = '<div class="err">Cena musí byť nezáporná suma v EUR s najviac dvoma desatinnými miestami.</div>'; return; }
    const saleInput = view.querySelector('#p-sale-price');
    if (view.querySelector('#p-sale-on').checked && (saleInput.value === '' || !saleInput.validity.valid || !(Number(saleInput.value) > 0) || Number(saleInput.value) >= Number(amountInput.value))) { msg.innerHTML = '<div class="err">Akčná cena musí byť väčšia ako nula a nižšia ako bežná cena.</div>'; return; }

    const missing = completeness().filter(c => c.block && !c.ok).map(c => c.t);
    if (wantStatus === 'published' && missing.length) { msg.innerHTML = `<div class="err">Produkt sa nedá zverejniť, chýba: ${esc(missing.join(', '))}. Uložte ho ako koncept alebo údaje doplňte.</div>`; return; }
    // Digitálny produkt bez súborov by zákazníka nedal nič – zverejnenie sa zablokuje.
    const shipId = view.querySelector('#p-ship')?.value || curProfile;
    const isDigital = profiles.find(sp => sp.id === shipId)?.type === 'digital';
    const hasFiles = libraryEditor.hasFiles();
    if (wantStatus === 'published' && isDigital && hasFiles === false) {
      msg.innerHTML = '<div class="err">Digitálny produkt nemá žiadny súbor. Najprv v záložke Zakúpený obsah nahrajte video, nahrávku alebo dokument, ktorý zákazník dostane. Bez súboru produkt nezverejňujte.</div>'; return;
    }
    if ([...view.querySelectorAll('[data-loc]')].some(i => i.value !== '' && !(Number.isInteger(Number(i.value)) && Number(i.value) >= 0))) { msg.innerHTML = '<div class="err">Počet kusov na sklade musí byť celé číslo 0 alebo viac.</div>'; return; }
    const skuIn = (view.querySelector('#p-sku')?.value || '').trim().toUpperCase();
    const newSku = variant && skuIn && skuIn !== String(variant.sku || '').toUpperCase() ? skuIn : '';
    if (newSku && variant.sku && !confirm(`Zmeniť kód produktu z ${variant.sku} na ${newSku}?\n\nQR kódy a odkazy vytvorené pre starý kód prestanú fungovať.`)) return;
    if (newSku && !SKU_RE.test(newSku)) { msg.innerHTML = '<div class="err">Kód produktu (SKU): 2–64 znakov, len písmená A–Z, číslice, bodka, pomlčka alebo podčiarknik.</div>'; return; }
    try { libraryEditor.validate(); } catch (e) { msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
    btn.disabled = true;
    try {
      const eanIn = (view.querySelector('#p-ean')?.value || '').trim();
      const weightIn = view.querySelector('#p-weight')?.value.trim();
      const eanChanged = variant && eanIn !== String(variant.barcode || variant.ean || '');
      const weightChanged = variant && weightIn !== String(variant.weight ?? '');
      if (newSku || eanChanged || weightChanged) {
        const body = { ...(newSku ? { sku: newSku } : {}), ...(eanChanged ? { barcode: eanIn || null } : {}), ...(weightChanged ? { weight: weightIn === '' ? null : Number(weightIn) } : {}) };
        await api(`/admin/products/${id}/variants/${variant.id}`, { method: 'POST', body });
      }
      const chosen = [...inC].map(id => ({ id }));
      const desc = cleanRichText(view.querySelector('#p-desc').innerHTML);
      const np = view.querySelector('#p-price').value;
      // Základná cena len cez /admin/shop-prices (zámok, kontrola pôvodnej sumy, audit) – nikdy natívne prices[],
      // ktoré by prepísalo celý price set (iné meny, pravidlá).
      if (variant && np !== '' && Number(np) !== price?.amount) {
        if (!price?.id) throw new Error('Variant zatiaľ nemá základnú cenu v EUR. Obnovte údaje alebo kontaktujte podporu.');
        await api(`/admin/shop-prices/${variant.id}`, { method: 'POST', body: { price_id: price.id, amount: Number(np), expected_amount: Number(price.amount) } });
      }
      let ref = { price_list_id: sale.price_list_id, price_id: sale.price_id };
      const wantSale = view.querySelector('#p-sale-on').checked, sp = view.querySelector('#p-sale-price').value;
      let saleMeta;
      if (wantSale && variant && sp !== '') { ref = await applyVariantSale(variant.id, sp, ref); saleMeta = { active: true, akcna_cena: Number(sp), do: view.querySelector('#p-sale-to').value || null, ...ref }; }
      else { await clearVariantSale(ref); saleMeta = { active: false }; }
      const metadata = { ...(p.metadata || {}), vyprodej: saleMeta };
      // Registry changes use the revision-checked endpoint; never overwrite it from a stale product snapshot.
      delete metadata.protected_media;
      const body = { title: view.querySelector('#p-title').value.trim(), status: wantStatus, description: desc, categories: chosen, metadata, images: images.map(url => ({ url })), thumbnail: thumb };
      const ship = view.querySelector('#p-ship').value; if (ship && ship !== curProfile) body.shipping_profile_id = ship;
      if (channels.length) body.sales_channels = [...view.querySelectorAll('[data-ch]')].filter(cb => cb.checked).map(cb => ({ id: cb.dataset.ch }));
      await api(`/admin/products/${id}`, { method: 'POST', body });
      if (variant) await saveStock();
      await libraryEditor.save();
      msg.innerHTML = '<div class="notice">Uložené.</div>';
      setTimeout(() => vProductDetail(view, id), 700);
    } catch (e) { if (e.message === '401') return; msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    finally { btn.disabled = false; }
  };
  // Sklad cez natívne inventory API: zapnutie sledovania, prepojenie skladovej položky, počty po skladoch.
  async function saveStock() {
    const want = !!view.querySelector('#p-inv')?.checked;
    if (want !== !!variant.manage_inventory) await api(`/admin/products/${id}/variants/${variant.id}`, { method: 'POST', body: { manage_inventory: want } });
    if (!want) return;
    let itemId = invItemId;
    if (!itemId) {
      const { inventory_item } = await api('/admin/inventory-items', { method: 'POST', body: { title: p.title, ...(variant.sku ? { sku: variant.sku } : {}) } });
      itemId = inventory_item.id;
      await api(`/admin/products/${id}/variants/inventory-items/batch`, { method: 'POST', body: { create: [{ variant_id: variant.id, inventory_item_id: itemId, required_quantity: 1 }] } });
    }
    for (const inp of view.querySelectorAll('[data-loc]')) {
      if (inp.value === '') continue;
      const q = Number(inp.value);
      if (!Number.isInteger(q) || q < 0) throw new Error('Počet kusov musí byť celé číslo 0 alebo viac.');
      const lv = levels.find(x => x.location_id === inp.dataset.loc);
      if (lv && Number(lv.stocked_quantity) === q) continue;
      if (lv && itemId === invItemId) await api(`/admin/inventory-items/${itemId}/location-levels/${inp.dataset.loc}`, { method: 'POST', body: { stocked_quantity: q } });
      else await api(`/admin/inventory-items/${itemId}/location-levels`, { method: 'POST', body: { location_id: inp.dataset.loc, stocked_quantity: q } });
    }
  }
}
async function vCategories(view) {
  view = freshView(view);
  const { product_categories } = await api('/admin/product-categories?limit=200&fields=id,name,handle,is_active,parent_category_id,products.id');
  setActions('<button class="btn gold" id="cat-new">+ Nová kategória</button>');
  const nb = document.querySelector('#cat-new'); if (nb) nb.onclick = () => vCategoryDetail(view, null);
  listView(view, { title: 'Kategórie', rows: product_categories, onRow: c => vCategoryDetail(view, c.id), cols: [
    { h: 'Názov', v: c => esc(c.name) }, { h: 'Adresa kategórie', v: c => `<span class="muted">${esc(c.handle)}</span>` },
    { h: 'Nadradená kategória', v: c => esc(product_categories.find(p => p.id === c.parent_category_id)?.name || 'Hlavná kategória') },
    { h: 'Produkty', v: c => (c.products || []).length ? `<b>${(c.products || []).length}</b>` : '<span class="muted">0</span>' },
    { h: 'Aktívna', v: c => c.is_active ? '<span class="pill ok">áno</span>' : '<span class="pill off">nie</span>' }] });
}
async function vCategoryDetail(view, id) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam…</div>';
  setActions('');
  const all = (await api('/admin/product-categories?limit=200&fields=id,name,parent_category_id')).product_categories || [];
  let c = { name: '', handle: '', is_active: true, parent_category_id: null };
  if (id) { const r = await api(`/admin/product-categories/${id}?fields=id,name,handle,is_active,parent_category_id`); c = r.product_category; }
  const descendant = candidate => { const seen = new Set(); let current = candidate; while (current) { if (current === id || seen.has(current)) return true; seen.add(current); current = all.find(x => x.id === current)?.parent_category_id; } return false; };
  view.innerHTML = `<div class="card"><div class="card-h">${id ? 'Úprava kategórie' : 'Nová kategória'}<button class="btn ghost" id="c-back">Späť</button></div><div class="card-b">
    <div id="cmsg"></div>
    <label>Názov</label><input id="c-name" value="${esc(c.name)}">
    <label>Adresa kategórie</label><input id="c-handle" value="${esc(c.handle || '')}" placeholder="napr. bio-kozmetika">
    <label for="c-parent">Nadradená kategória</label><select id="c-parent"><option value="">Hlavná kategória</option>${all.filter(x => !descendant(x.id)).map(x => `<option value="${esc(x.id)}"${x.id === c.parent_category_id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
    <label style="display:flex;gap:8px;align-items:center;margin-top:12px"><input type="checkbox" id="c-active" ${c.is_active !== false ? 'checked' : ''} style="width:auto"> Aktívna</label>
    <div style="margin-top:16px"><button class="btn gold" id="c-save">Uložiť</button>${id ? ' <button class="btn ghost" id="c-delete">Odstrániť kategóriu</button>' : ''}</div>
  </div></div>`;
  view.querySelector('#c-back').onclick = () => vCategories(view);
  const deleteButton = view.querySelector('#c-delete');
  if (deleteButton) deleteButton.onclick = async () => {
    const msg = view.querySelector('#cmsg'); msg.innerHTML = '';
    if (all.some(x => x.parent_category_id === id)) { msg.innerHTML = '<div class="err">Táto kategória obsahuje podkategórie. Najprv ich presuňte do inej kategórie alebo odstráňte.</div>'; return; }
    if (!confirm(`Odstrániť kategóriu „${c.name}“? Produkty zostanú zachované; odstráni sa len ich zaradenie do tejto kategórie. Túto zmenu nemožno vrátiť späť.`)) return;
    deleteButton.disabled = true;
    try { await api(`/admin/product-categories/${id}`, { method: 'DELETE' }); await vCategories(view); }
    catch (e) { msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; deleteButton.disabled = false; }
  };
  view.querySelector('#c-save').onclick = async () => {
    const msg = view.querySelector('#cmsg'); msg.innerHTML = '';
    const name = view.querySelector('#c-name').value.trim();
    if (!name) { msg.innerHTML = '<div class="err">Zadajte názov kategórie.</div>'; return; }
    const body = { name, is_active: view.querySelector('#c-active').checked, parent_category_id: view.querySelector('#c-parent').value || null };
    const h = view.querySelector('#c-handle').value.trim(); if (h) body.handle = h;
    try { await api(id ? `/admin/product-categories/${id}` : '/admin/product-categories', { method: 'POST', body }); await vCategories(view); }
    catch (e) { msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
}
// --- Objednávky: načítanie po stránkach (jadro vracia aj celkový počet) ---
const ORDER_LIST_FIELDS = 'id,display_id,email,status,total,currency_code,created_at,payment_status,fulfillment_status,metadata,*items,*customer,*shipping_methods,*shipping_address,*payment_collections.payment_sessions';
const ORDER_LOAD_PAGE = 100;
/** Poistka proti ťažkému načítaniu; nad tento počet sa zobrazí upozornenie (staršie hľadaj cez vyhľadávanie). */
const ORDER_LOAD_CAP = 1000;
/** Koľko objednávok sa zobrazí na jednu stranu v prehľade. */
const ORDER_PAGE_SIZE = 50;
/** Stiahnutie súboru v prehliadači (CSV export). */
function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
async function loadOrders() {
  const q = `limit=${ORDER_LOAD_PAGE}&order=-created_at&fields=${ORDER_LIST_FIELDS}`;
  const first = await api(`/admin/orders?${q}`);
  let orders = first.orders || [];
  const total = Number(first.count) || orders.length;
  while (orders.length < Math.min(total, ORDER_LOAD_CAP)) {
    const next = await api(`/admin/orders?${q}&offset=${orders.length}`);
    const more = next.orders || [];
    if (!more.length) break;
    orders = orders.concat(more);
  }
  return { orders, total, truncated: total > orders.length };
}
async function vOrders(view) {
  view = freshView(view);
  // Objednávky sa načítajú po stránkach a filtrujú až tu – filtry „Na vybavenie“ a „Čaká na platbu“
  // závisia od stavu platby a vybavenia, ktoré jadro nefiltruje na serveri. Cap 1 000 objednávok
  // je poistka proti ťažkému načítaniu; nad to sa v prehľade zobrazí upozornenie.
  const { orders = [], total = 0, truncated = false } = await loadOrders();
  const payPill = (s) => `<span class="pill ${s === 'captured' || s === 'paid' ? 'ok' : s === 'not_paid' || s === 'canceled' ? 'off' : 'warn'}">${esc(PAY_LABEL[s] || s || '—')}</span>`;
  const fulPill = (s) => `<span class="pill ${s === 'fulfilled' || s === 'shipped' || s === 'delivered' ? 'ok' : 'warn'}">${esc(FUL_LABEL[s] || s || 'nevybavená')}</span>`;
  const legacy = o => o.metadata?.legacy_customer_migration;
  const archived = o => o.status === 'archived';
  // Filtre zodpovedajú tomu, čo Lucia rieši: čo treba odoslať, kde sa čaká na peniaze, čo je hotové.
  const FILTERS = [
    ['all', 'Všetky', () => true],
    ['todo', 'Na vybavenie', o => !archived(o) && o.status !== 'canceled' && ['captured', 'paid', 'partially_captured'].includes(o.payment_status) && ['not_fulfilled', 'partially_fulfilled', 'fulfilled'].includes(o.fulfillment_status)],
    ['unpaid', 'Čaká na platbu', o => !archived(o) && o.status !== 'canceled' && ['not_paid', 'awaiting', 'authorized', 'requires_action'].includes(o.payment_status)],
    ['done', 'Odoslané', o => ['shipped', 'partially_shipped', 'delivered'].includes(o.fulfillment_status)],
    ['canceled', 'Zrušené', o => o.status === 'canceled'],
    ['archive', 'Archív', o => archived(o)],
  ].filter(([k, , f]) => k === 'all' || orders.some(f));
  const name = o => [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(' ') || o.shipping_address?.first_name || '';
  const shipping = o => (o.shipping_methods || []).map(m => m.name).join(', ') || '—';
  const city = o => [o.shipping_address?.city, (o.shipping_address?.country_code || '').toUpperCase()].filter(Boolean).join(', ') || '—';
  const provider = o => (o.payment_collections || []).flatMap(pc => pc.payment_sessions || []).map(s => s.provider_id).find(Boolean) || '';
  const row = o => {
    const items = o.items || [], first = items[0];
    const more = items.length > 1 ? ` <small>+ ${items.length - 1} ďalšie</small>` : '';
    const thumb = first?.thumbnail ? `<img src="${esc(first.thumbnail)}" alt="" loading="lazy">` : `<span class="ot-noimg">${navIcon('bag')}</span>`;
    const method = PAY_METHOD[provider(o)];
    return `<tr data-id="${esc(o.id)}" tabindex="0" role="link">
      <td class="ot-check"><input type="checkbox" data-pick="${esc(o.id)}" aria-label="Označiť objednávku ${esc(legacy(o)?.number || o.display_id || '')}"></td>
      <td class="ot-img">${thumb}</td>
      <td><b>#${esc(legacy(o)?.number || o.display_id || '')}</b><small>${fmtDate(legacy(o)?.placed_at || o.created_at)}</small></td>
      <td>${esc(name(o) || '—')}<small>${esc(o.email || '')}</small></td>
      <td>${esc(shipping(o))}<small>${esc(city(o))}</small></td>
      <td class="ot-items">${esc(first?.title || first?.product_title || '—')}${more}</td>
      <td class="ot-num">${fmtEur(o.total)}</td>
      <td>${archived(o) ? `<span class="pill">${esc(legacy(o)?.payment_status || 'Historický záznam')}</span>` : payPill(o.payment_status)}${method ? `<small>${esc(method.label)}</small>` : ''}</td>
      <td>${archived(o) ? `<span class="pill">${esc(legacy(o)?.status || 'Archív')}</span>` : o.status === 'canceled' ? '<span class="pill off">zrušená</span>' : fulPill(o.fulfillment_status)}</td>
      <td class="ot-act ot-act-print"><div class="ot-acts">
        <button type="button" class="btn gold sm" data-print="label" title="Vytlačiť adresný štítok (A6)">Štítok</button>
        <button type="button" class="btn ghost sm" data-print="slip" title="Vytlačiť dodací list (A4)">Dodací list</button>
        <button type="button" class="btn ghost sm open">Otvoriť ${navIcon('arrow')}</button>
      </div></td></tr>`;
  };
  let filter = 'all', query = '', visible = [], page = 0;
  const selected = new Set();
  view.innerHTML = `<section class="card ot-card"><div class="ot-head">
      <h2>Objednávky <span class="muted">(${orders.length})</span></h2>
      <div class="ot-head-act">
        <input class="rc-search" type="search" placeholder="Hľadať číslo, meno, e-mail, produkt…" aria-label="Hľadať v objednávkach">
        <button type="button" class="btn gold" id="o-print-all" hidden>Vytlačiť štítky (0)</button>
      </div>
    </div>
    ${FILTERS.length > 1 ? `<div class="ot-filters" role="tablist">${FILTERS.map(([k, l, f]) => `<button type="button" role="tab" data-f="${k}" aria-selected="${k === filter}">${esc(l)} <span>${orders.filter(f).length}</span></button>`).join('')}</div>` : ''}
    <div class="ot-bulk" id="o-bulk" hidden>
      <span class="muted" id="o-bulk-info">Žiadna označená objednávka</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn ghost sm" id="o-bulk-label">Vytlačiť štítky</button>
        <button type="button" class="btn ghost sm" id="o-bulk-slip">Dodací list</button>
        <button type="button" class="btn ghost sm" id="o-bulk-csv">Export CSV</button>
        <button type="button" class="btn ghost sm" id="o-bulk-clear">Zrušiť označenie</button>
      </div>
    </div>
    ${truncated ? `<div class="notice" style="margin:14px 24px 0">V prehľade je prvých ${orders.length} z ${total} objednávok. Staršie objednávky hľadaj cez vyhľadávanie podľa e-mailu.</div>` : ''}
    <div class="ot-wrap"><table class="ot"><thead><tr><th class="ot-check"><input type="checkbox" id="o-pick-all" aria-label="Označiť všetky objednávky na strane"></th><th class="ot-img"><span class="sr-only">Produkt</span></th><th>Objednávka</th><th>Zákazník</th><th>Doručenie</th><th>Položky</th><th class="ot-num">Suma s DPH</th><th>Platba</th><th>Vybavenie</th><th class="ot-act"><span class="sr-only">Akcia</span></th></tr></thead><tbody></tbody></table></div>
    <div class="ot-foot"><span class="muted" id="o-range"></span><div style="display:flex;gap:8px"><button class="btn ghost" data-pg="prev">← Predchádzajúce</button><button class="btn ghost" data-pg="next">Ďalšie →</button></div></div>
  </section>`;
  const body = view.querySelector('tbody');
  const bulk = view.querySelector('#o-print-all');
  const range = view.querySelector('#o-range');
  const bulkBar = view.querySelector('#o-bulk');
  const bulkInfo = view.querySelector('#o-bulk-info');
  const picked = () => orders.filter(o => selected.has(o.id));
  const drawBulk = () => {
    if (!bulkBar) return;
    const list = picked();
    bulkBar.hidden = !list.length;
    if (bulkInfo) bulkInfo.textContent = list.length ? `Označené objednávky: ${list.length}` : 'Žiadna označená objednávka';
  };
  const draw = () => {
    const f = FILTERS.find(x => x[0] === filter)?.[2] || (() => true);
    const list = orders.filter(f).filter(o => !query || JSON.stringify([o.display_id, o.email, name(o), (o.items || []).map(i => i.title)]).toLowerCase().includes(query));
    visible = list;
    const pages = Math.max(1, Math.ceil(list.length / ORDER_PAGE_SIZE));
    page = Math.min(Math.max(0, page), pages - 1);
    const slice = list.slice(page * ORDER_PAGE_SIZE, (page + 1) * ORDER_PAGE_SIZE);
    body.innerHTML = slice.length ? slice.map(row).join('') : `<tr><td colspan="10" class="empty">${orders.length ? 'Žiadna objednávka nezodpovedá výberu.' : 'Zatiaľ žiadne objednávky.'}</td></tr>`;
    body.querySelectorAll('tr[data-id]').forEach(tr => {
      const open = () => vOrderDetail(view, tr.dataset.id);
      tr.onclick = open; tr.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
      tr.querySelectorAll('[data-print]').forEach(b => b.onclick = (e) => { e.stopPropagation(); printOrders([tr.dataset.id], b.dataset.print); });
      const box = tr.querySelector('[data-pick]');
      if (box) {
        box.checked = selected.has(tr.dataset.id);
        box.onclick = (e) => e.stopPropagation();
        box.onchange = () => { if (box.checked) selected.add(tr.dataset.id); else selected.delete(tr.dataset.id); drawBulk(); };
      }
    });
    const all = view.querySelector('#o-pick-all');
    if (all) {
      const ids = slice.map(o => o.id);
      all.checked = ids.length > 0 && ids.every(id => selected.has(id));
      all.indeterminate = !all.checked && ids.some(id => selected.has(id));
      all.onchange = () => { ids.forEach(id => all.checked ? selected.add(id) : selected.delete(id)); draw(); };
    }
    const from = list.length ? page * ORDER_PAGE_SIZE + 1 : 0, to = Math.min((page + 1) * ORDER_PAGE_SIZE, list.length);
    if (range) range.textContent = list.length ? `${from}–${to} z ${list.length}` : 'Žiadne objednávky';
    const prev = view.querySelector('[data-pg="prev"]'), next = view.querySelector('[data-pg="next"]');
    if (prev) prev.disabled = page <= 0;
    if (next) next.disabled = (page + 1) * ORDER_PAGE_SIZE >= list.length;
    // Hromadná tlač štítkov je k dispozícii pri filtri „Na vybavenie“ – presne pre tie objednávky, ktoré sa chystajú.
    if (bulk) { bulk.hidden = !(filter === 'todo' && list.length); bulk.textContent = `Vytlačiť štítky (${list.length})`; }
    drawBulk();
  };
  view.querySelectorAll('.ot-filters button').forEach(b => b.onclick = () => {
    filter = b.dataset.f; page = 0; view.querySelectorAll('.ot-filters button').forEach(x => x.setAttribute('aria-selected', String(x === b))); draw();
  });
  const prev = view.querySelector('[data-pg="prev"]'), next = view.querySelector('[data-pg="next"]');
  if (prev) prev.onclick = () => { if (page > 0) { page--; draw(); } };
  if (next) next.onclick = () => { page++; draw(); };
  if (bulk) bulk.onclick = () => printOrders(visible.map(o => o.id), 'label');
  const bulkLabel = view.querySelector('#o-bulk-label'), bulkSlip = view.querySelector('#o-bulk-slip'), bulkCsv = view.querySelector('#o-bulk-csv'), bulkClear = view.querySelector('#o-bulk-clear');
  if (bulkLabel) bulkLabel.onclick = () => printOrders(picked().map(o => o.id), 'label');
  if (bulkSlip) bulkSlip.onclick = () => printOrders(picked().map(o => o.id), 'slip');
  if (bulkClear) bulkClear.onclick = () => { selected.clear(); draw(); };
  if (bulkCsv) bulkCsv.onclick = () => {
    const list = picked();
    if (!list.length) return;
    const head = ['Číslo', 'Dátum', 'Zákazník', 'E-mail', 'Adresa', 'Doprava', 'Položky', 'Suma (EUR)', 'Platba', 'Spôsob platby', 'Vybavenie'];
    const lines = list.map(o => [
      legacy(o)?.number || o.display_id || '',
      new Date(legacy(o)?.placed_at || o.created_at).toLocaleString('sk-SK'),
      name(o), o.email || '',
      [o.shipping_address?.address_1, o.shipping_address?.postal_code, city(o)].filter(Boolean).join(' '),
      shipping(o),
      (o.items || []).map(i => `${i.title} × ${i.quantity}`).join(' | '),
      Number(o.total || 0).toFixed(2),
      PAY_LABEL[o.payment_status] || o.payment_status || '',
      PAY_METHOD[provider(o)]?.label || '',
      FUL_LABEL[o.fulfillment_status] || o.fulfillment_status || '',
    ].map(csvCell).join(','));
    downloadText(`objednavky-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + [head.map(csvCell).join(','), ...lines].join('\r\n'));
  };
  const s = view.querySelector('.rc-search');
  if (s) s.oninput = () => { query = s.value.toLowerCase().trim(); page = 0; draw(); };
  draw();
}
// Akcie objednávky cez natívne Admin API jadra (spúšťajú existujúce subscribery: e-maily, prístupy, kompenzácie).
// Každá zmena má potvrdenie; sumy a stavy overuje jadro, SPA len ponúka to, čo dáva zmysel.
const ORDER_FIELDS = 'id,metadata,display_id,email,status,total,currency_code,created_at,payment_status,fulfillment_status,*items,*items.detail,*fulfillments,*fulfillments.items,*fulfillments.labels,*payment_collections,*payment_collections.payments,*payment_collections.payments.refunds,*payment_collections.payments.captures,*shipping_address,*billing_address,*shipping_methods';
const PAY_METHOD = {
  pp_cod_cod: { key: 'cod', label: 'Na dobierku', short: 'dobierka', manual: true },
  pp_bank_transfer_bank_transfer: { key: 'bank_transfer', label: 'Prevodom na účet', short: 'prevod', manual: true },
  pp_stripe_stripe: { key: 'card', label: 'Kartou online', short: 'karta', manual: false },
  pp_membership_stripe_membership: { key: 'card', label: 'Kartou', short: 'karta', manual: false },
};
const PAY_LABEL = { captured: 'zaplatená', authorized: 'autorizovaná (čaká na prijatie)', partially_refunded: 'čiastočne vrátená', refunded: 'vrátená', not_paid: 'nezaplatená', awaiting: 'čaká na platbu', canceled: 'zrušená', partially_captured: 'čiastočne zaplatená', requires_action: 'čaká na overenie' };
const FUL_LABEL = { not_fulfilled: 'nevybavená', fulfilled: 'pripravená na odoslanie', partially_fulfilled: 'čiastočne pripravená', shipped: 'odoslaná', partially_shipped: 'čiastočne odoslaná', delivered: 'doručená', canceled: 'zrušená' };
const sum = (arr, k = 'amount') => (arr || []).reduce((a, x) => a + Number(x?.[k] || 0), 0);
async function vOrderDetail(view, id, notice) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam…</div>';
  const { order: o } = await api(`/admin/orders/${id}?fields=${encodeURIComponent(ORDER_FIELDS)}`);
  const history = o.metadata?.legacy_customer_migration || {};
  // Darčekové poukazy k objednávke: poukazy z jadra (hodnota, platnosť, kód) + obdarovaní z metadát objednávky.
  const giftRecipients = o.metadata?.gift_voucher_recipients ?? {};
  let giftVouchers = [];
  if (Object.keys(giftRecipients).length) {
    try { giftVouchers = (await api(`/admin/vouchers?order_id=${encodeURIComponent(id)}&limit=50`)).vouchers || []; }
    catch (e) { if (e.message === '401') return; giftVouchers = []; }
  }
  const archived = o.status === 'archived';
  const items = o.items || [];
  const toFulfill = (archived ? [] : items).map(it => ({ id: it.id, title: it.title || it.product_title || '', quantity: Number(it.quantity) - Number(it.detail?.fulfilled_quantity || 0) })).filter(x => x.quantity > 0);
  const fulfillments = (o.fulfillments || []).filter(f => !f.canceled_at);
  const payments = (archived ? [] : o.payment_collections || []).flatMap(pc => pc.payments || []).filter(p => !p.canceled_at);
  const canceled = o.status === 'canceled';
  const anyShipped = fulfillments.some(f => f.shipped_at);
  // Spôsob platby podľa providera: dobierka a prevod sú manuálne – objednávka čaká, kým platbu prijmete.
  const method = PAY_METHOD[payments.find(p => p.provider_id)?.provider_id] || null;
  const manual = method && method.manual;
  const payState = (!history.payment_status && manual && o.payment_status === 'authorized') ? `čaká na platbu (${method.short})` : (history.payment_status || PAY_LABEL[o.payment_status] || o.payment_status || '—');
  const a = (o.shipping_address || {});
  const addr = [[a.first_name, a.last_name].filter(Boolean).join(' '), a.address_1, a.address_2, [a.postal_code, a.city].filter(Boolean).join(' '), (a.country_code || '').toUpperCase()].filter(Boolean).map(esc).join('<br>');
  const bAddr = (o.billing_address || {});
  const billAddr = [[bAddr.first_name, bAddr.last_name].filter(Boolean).join(' '), bAddr.address_1, bAddr.address_2, [bAddr.postal_code, bAddr.city].filter(Boolean).join(' '), (bAddr.country_code || '').toUpperCase()].filter(Boolean).map(esc).join('<br>');
  const billDiffers = Boolean(billAddr) && billAddr !== addr;
  const prehlad = `<div class="row"><div><label>E-mail</label><div>${esc(o.email)}</div></div><div><label>Dátum</label><div>${fmtDate(history.placed_at || o.created_at)}</div></div></div>
    <div class="row"><div><label>Platba</label><div><span class="pill">${esc(payState)}</span>${method ? `<div style="margin-top:4px"><b>${esc(method.label)}</b></div>` : ''}</div></div>
    <div><label>Vybavenie</label><div><span class="pill">${esc(history.status || (archived ? 'Archív' : FUL_LABEL[o.fulfillment_status] || o.fulfillment_status) || '—')}</span>${canceled ? ' <span class="pill off">objednávka zrušená</span>' : ''}</div></div></div>
    <div class="row"><div><label>Doručenie</label><div>${addr || '<span class="muted">bez adresy (digitálny obsah)</span>'}</div></div>
    <div><label>Doprava</label><div>${(o.shipping_methods || []).map(m => `${esc(m.name)} · ${fmtEur(m.total ?? m.amount)}`).join('<br>') || '—'}</div></div></div>
    <div class="row"><div><label>Fakturačná adresa</label><div>${billAddr || '<span class="muted">žiadna (rovná sa doručeniu)</span>'}</div></div>
    <div><label>Rozdiel</label><div>${billDiffers ? '<span class="pill warn">iná než doručovacia</span>' : '<span class="muted">rovná sa doručovacej</span>'}</div></div></div>
    <div style="margin-top:10px;font-weight:600">Celkom: ${fmtEur(o.total)}</div>
    <div style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px">
      <label for="o-note">Poznámka k objednávke (vidíte len vy)</label>
      <textarea id="o-note" rows="2" placeholder="napr. zákazník si želá zabalenie daru">${esc(String(o.metadata?.anastasia_note || ''))}</textarea>
      <div style="display:flex;gap:8px;align-items:center;margin-top:8px"><button type="button" class="btn ghost" id="o-note-save">Uložiť poznámku</button><span class="muted" id="o-note-msg" style="font-size:12px"></span></div>
    </div>
    ${manual && o.payment_status === 'authorized' && !canceled ? `<div class="notice" style="margin-top:10px">${method.key === 'bank_transfer' ? `Prevod: skontrolujte vo výpise Tatra banky platbu s variabilným symbolom <b>${esc(String(o.display_id || ''))}</b> a sumou <b>${fmtEur(o.total)}</b>. Potom v záložke Platby kliknite „Prijať platbu“ – až vtedy sa sprístupní digitálny obsah.` : 'Dobierka: zákazník platí kuriérovi pri prevzatí. Keď vám dopravca peniaze pripíše, v záložke Platby kliknite „Prijať platbu“.'}</div>` : ''}`;
  const polozky = `<div class="rc-grid">${items.map(it => `<div class="rc"><div class="rc-body"><div class="rc-title">${esc(it.title || it.product_title || '')}</div><div class="rc-fields">
      <span class="rc-f"><em>Kusov</em>${it.quantity}</span><span class="rc-f"><em>Suma</em>${fmtEur(it.total)}</span>
      <span class="rc-f"><em>Pripravené</em>${Number(it.detail?.fulfilled_quantity || 0)} / ${it.quantity}</span>
      <span class="rc-f"><em>Odoslané</em>${Number(it.detail?.shipped_quantity || 0)} / ${it.quantity}</span></div></div></div>`).join('') || '<div class="empty">Žiadne položky.</div>'}</div>`;
  const odoslanie = `${!canceled && toFulfill.length ? `<div class="task"><div><b>Pripraviť na odoslanie</b><p class="muted">${toFulfill.map(x => `${esc(x.title)} × ${x.quantity}`).join(', ')}</p></div><button class="btn gold" id="o-ful">Pripraviť</button></div>` : ''}
    ${fulfillments.map(f => `<div class="task"><div><b>Zásielka ${fmtDate(f.created_at)}</b>
      <p class="muted">${(f.items || []).map(x => `${esc(x.title || '')} × ${x.quantity}`).join(', ')}</p>
      ${f.shipped_at ? `<span class="pill ok">odoslaná ${fmtDate(f.shipped_at)}</span>${(f.labels || []).map(l => ` <span class="muted">${l.tracking_url ? `<a href="${esc(l.tracking_url)}" target="_blank" rel="noopener">${esc(l.tracking_number || 'sledovať')}</a>` : esc(l.tracking_number || '')}</span>`).join('')}`
        : `<div class="row" style="margin-top:6px"><div><label>Číslo zásielky (voliteľné)</label><input data-trk="${esc(f.id)}" placeholder="napr. Z123456789"></div><div><label>Odkaz na sledovanie (voliteľné)</label><input data-trkurl="${esc(f.id)}" placeholder="https://…"></div></div>`}
      </div>${f.shipped_at ? '' : `<button class="btn gold" data-ship="${esc(f.id)}">Označiť ako odoslanú</button>`}</div>`).join('')}
    ${!toFulfill.length && !fulfillments.length ? '<p class="muted">Nie je čo pripraviť.</p>' : ''}
    <p class="muted" style="font-size:12px;margin-top:10px">Po označení odoslania jadro pošle zákazníkovi e-mail o odoslaní.</p>`;
  const platby = `${payments.map(p => { const cap = sum(p.captures), ref = sum(p.refunds), left = Math.round((cap - ref) * 100) / 100;
    return `<div class="task"><div><b>${fmtEur(p.amount)}</b> <span class="muted">${esc(PAY_METHOD[p.provider_id]?.label || p.provider_id || '')}</span>
      <p class="muted">Prijaté ${fmtEur(cap)} · vrátené ${fmtEur(ref)}</p>
      ${left > 0 ? `<div class="row" style="margin-top:6px"><div><label>Suma na vrátenie (EUR)</label><input type="number" step="0.01" min="0.01" max="${left}" data-refamt="${esc(p.id)}" value="${left}"></div><div></div></div>` : ''}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${!p.captured_at && cap === 0 && !canceled ? `<button class="btn gold" data-cap="${esc(p.id)}">Prijať platbu</button>` : ''}${left > 0 ? `<button class="btn ghost" data-ref="${esc(p.id)}" data-max="${left}">Vrátiť peniaze</button>` : ''}</div></div>`; }).join('') || '<p class="muted">K objednávke nie je evidovaná platba.</p>'}
    <p class="muted" style="font-size:12px;margin-top:10px">${manual ? 'Dobierka a prevod nejdú cez platobnú bránu: „Prijať platbu“ len zaznamená, že peniaze prišli (sprístupní obsah, odíde e-mail). Pri vrátení pošlite peniaze zákazníkovi sami prevodom a sumu tu zaznamenajte.' : 'Vrátenie peňazí prebehne cez platobnú bránu. Jadro potom samo upraví prístupy k digitálnemu obsahu a pošle e-mail.'}</p>`;
  view.innerHTML = `<div class="detail-layout"><div class="card"><div class="card-h">Objednávka #${esc(history.number || o.display_id || '')}<div class="card-h-act">
      <button type="button" class="btn ghost" id="o-print-label">Vytlačiť štítok</button>
      <button type="button" class="btn ghost" id="o-print-slip">Dodací list</button>
      <button class="btn ghost" id="o-back">Späť</button>
    </div></div><div class="card-b">
    <div id="omsg">${archived ? '<div class="notice">Historická objednávka zo starého obchodu. Slúži ako archív; nevytvára novú platbu ani zásielku.</div>' : ''}${notice ? `<div class="notice">${esc(notice)}</div>` : ''}</div>
    ${tabsHtml([{ id: 'p', label: 'Prehľad', html: prehlad }, { id: 'i', label: 'Položky', html: polozky }, { id: 'o', label: 'Odoslanie', html: odoslanie }, { id: 'pl', label: 'Platby', html: platby }])}
    ${giftVouchers.length ? `<div style="margin-top:16px"><div class="card" style="margin:0"><div class="card-h">Darčekové poukazy<div class="card-h-act"><button type="button" class="btn gold" id="o-gift-print">Tlačiť poukazy</button></div></div>
      <div class="card-b"><div class="voucher-list" id="gift-list">${giftVouchers.map((gv, i) => {
        const r = Object.values(giftRecipients).flat().find(x => x && x.email) || {};
        return voucherHtml({ value: gv.initial_amount, currency: gv.currency_code, code: gv.code, expires_at: gv.expires_at, recipient_name: r.name, message: r.message });
      }).join('')}</div>
      <p class="muted" style="font-size:12px;margin-top:10px">Kód je maskovaný – plný kód dostal každý obdarovaný e-mailom. Hodnotu a platnosť overuje backend.</p></div></div>` : ''}
    ${!canceled && !archived && !anyShipped ? '<div style="margin-top:18px;border-top:1px solid var(--line);padding-top:14px"><button class="btn ghost" id="o-cancel">Zrušiť objednávku</button></div>' : ''}
  </div></div><aside class="detail-help panel" aria-label="Nápoveda k objednávke"><div class="panel-head"><h2>Ako postupovať</h2></div><div class="card-b" id="order-help" aria-live="polite"></div></aside></div>`;
  wireTabs(view);
  const orderHelp = {
    p: ['Skontrolujte objednávku', 'Tu vidíte zákazníka, doručenie a aktuálny stav platby. Položky objednávky nájdete vo vedľajšej záložke.', 'objednavka-vybavit'],
    i: ['Čo zákazník objednala', 'Pri každej položke vidíte objednané, pripravené a odoslané množstvo. Na vybavenie pokračujte do Odoslanie.', 'objednavka-vybavit'],
    o: ['Pripravte a odošlite', 'Najprv pripravte položky. Po odovzdaní dopravcovi doplňte číslo zásielky a označte ju ako odoslanú. Zákazníkovi odíde e-mail.', 'objednavka-vybavit'],
    pl: ['Platby a vrátenie peňazí', 'Skontrolujte prijatú a už vrátenú sumu. Pred vrátením peňazí overte sumu aj dôvod; ďalší krok si vyžiada potvrdenie.', 'objednavka-platby'],
  };
  const showOrderHelp = tab => { const h = archived ? ['Historická objednávka', 'Toto sú pôvodné údaje zo starého obchodu. Objednávku znova neodosielajte ani neúčtujte. Položky, pôvodnú sumu a stav si môžete prezrieť v záložkách.', 'objednavka-vybavit'] : orderHelp[tab]; view.querySelector('#order-help').innerHTML = `<h3>${esc(h[0])}</h3><p>${esc(h[1])}</p><a class="subtle-link" href="#/pomoc/${h[2]}">Podrobný postup →</a>`; };
  showOrderHelp('p');
  view.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => showOrderHelp(b.dataset.tab)));
  view.querySelector('#o-back').onclick = () => vOrders(view);
  const giftPrint = view.querySelector('#o-gift-print');
  if (giftPrint) giftPrint.onclick = () => {
    const cards = giftVouchers.map((gv) => {
      const r = Object.values(giftRecipients).flat().find(x => x && x.email) || {};
      return voucherHtml({ value: gv.initial_amount, currency: gv.currency_code, code: gv.code, expires_at: gv.expires_at, recipient_name: r.name, message: r.message });
    });
    openPrintHtml('Darčekové poukazy – ANASTASIA', voucherListHtml(cards, 'Kód je maskovaný – plný kód dostal každý obdarovaný e-mailom.'), VOUCHER_CSS);
  };
  view.querySelector('#o-print-label').onclick = () => printOrders([id], 'label');
  view.querySelector('#o-print-slip').onclick = () => printOrders([id], 'slip');
  // Poznámka k objednávke: uloží sa do metadát objednávky (vidí ju len tím, kto má prístup do admina).
  const noteBtn = view.querySelector('#o-note-save');
  if (noteBtn) noteBtn.onclick = async () => {
    const noteMsg = view.querySelector('#o-note-msg');
    const text = view.querySelector('#o-note').value.trim();
    noteMsg.textContent = 'Ukladám…'; noteBtn.disabled = true;
    try {
      await api(`/admin/orders/${id}`, { method: 'POST', body: { metadata: { ...(o.metadata || {}), anastasia_note: text } } });
      noteMsg.innerHTML = '<span style="color:#2c6b3f">Poznámka je uložená.</span>';
    } catch (e) {
      if (e.message !== '401') noteMsg.innerHTML = `<span style="color:#8a2436">${esc(e.message)}</span>`;
    } finally { noteBtn.disabled = false; }
  };
  const run = async (btn, question, fn, done) => {
    if (!confirm(question)) return;
    const msg = view.querySelector('#omsg'); msg.innerHTML = ''; btn.disabled = true;
    try { await fn(); await vOrderDetail(view, id, done); }
    catch (e) { if (e.message === '401') return; btn.disabled = false; msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
  const fb = view.querySelector('#o-ful');
  if (fb) fb.onclick = () => run(fb, 'Pripraviť všetky nevybavené položky na odoslanie?', () => api(`/admin/orders/${id}/fulfillments`, { method: 'POST', body: { items: toFulfill.map(x => ({ id: x.id, quantity: x.quantity })) } }), 'Položky sú pripravené na odoslanie.');
  view.querySelectorAll('[data-ship]').forEach(b => b.onclick = () => {
    const f = fulfillments.find(x => x.id === b.dataset.ship); if (!f) return;
    const tn = (view.querySelector(`[data-trk="${CSS.escape(f.id)}"]`)?.value || '').trim(), tu = (view.querySelector(`[data-trkurl="${CSS.escape(f.id)}"]`)?.value || '').trim();
    if (tu && !/^https:\/\/\S+$/.test(tu)) { view.querySelector('#omsg').innerHTML = '<div class="err">Odkaz na sledovanie musí začínať https://</div>'; return; }
    const body = { items: (f.items || []).map(x => ({ id: x.line_item_id, quantity: x.quantity })) };
    if (tn || tu) body.labels = [{ tracking_number: tn || '-', tracking_url: tu || '#', label_url: '#' }];
    run(b, 'Označiť zásielku ako odoslanú? Zákazníkovi odíde e-mail.', () => api(`/admin/orders/${id}/fulfillments/${f.id}/shipments`, { method: 'POST', body }), 'Zásielka je označená ako odoslaná.');
  });
  view.querySelectorAll('[data-cap]').forEach(b => b.onclick = () => run(b, PAY_METHOD[payments.find(p => p.id === b.dataset.cap)?.provider_id]?.manual ? 'Potvrdiť, že peniaze prišli? Zákazníkovi sa sprístupní digitálny obsah a odíde e-mail o prijatí platby.' : 'Prijať (strhnúť) túto platbu?', () => api(`/admin/payments/${b.dataset.cap}/capture`, { method: 'POST', body: {} }), 'Platba je prijatá.'));
  view.querySelectorAll('[data-ref]').forEach(b => b.onclick = () => {
    const amt = Number(view.querySelector(`[data-refamt="${CSS.escape(b.dataset.ref)}"]`)?.value), max = Number(b.dataset.max);
    if (!(amt > 0) || amt > max) { view.querySelector('#omsg').innerHTML = `<div class="err">Zadajte sumu od 0,01 do ${esc(fmtEur(max))}.</div>`; return; }
    run(b, `Naozaj vrátiť ${fmtEur(amt)} zákazníkovi? Túto akciu nemožno vrátiť späť.`, () => api(`/admin/payments/${b.dataset.ref}/refund`, { method: 'POST', body: { amount: amt } }), `Vrátenie ${fmtEur(amt)} bolo odoslané.`);
  });
  const cb = view.querySelector('#o-cancel');
  if (cb) cb.onclick = () => run(cb, 'Naozaj zrušiť celú objednávku? Zaplatená suma sa zákazníkovi automaticky vráti cez platobnú bránu.', () => api(`/admin/orders/${id}/cancel`, { method: 'POST', body: {} }), 'Objednávka je zrušená.');
}
async function vCustomers(view) {
  view = freshView(view);
  let offset = 0, query = '', count = 0, tierFilter = '', tierOptions = [], loyalty = false, selected = new Set();
  const PAGE = 25;
  view.innerHTML = `<section class="card ot-card"><div class="ot-head">
      <h2>Zákazníci</h2>
      <div class="ot-head-act">
        <select class="rc-select" id="cu-tier" aria-label="Filter podľa vernostnej úrovne"><option value="">Všetky úrovne</option></select>
        <input class="rc-search" type="search" placeholder="Hľadať meno alebo e-mail…" aria-label="Hľadať zákazničky">
      </div>
    </div><div id="cu-body"><div class="muted">Načítavam zákazničky…</div></div></section>`;
  const body = view.querySelector('#cu-body');
  const tierSel = view.querySelector('#cu-tier');
  const load = async () => {
    body.innerHTML = '<div class="muted">Načítavam…</div>';
    const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    if (query) params.set('q', query);
    if (tierFilter) params.set('tier', tierFilter);
    let data = null, customers = [], hasAccount = null;
    try {
      // Ak jadro pozná vernostné úrovne, zoznam berie z nich (serverový filter na úroveň).
      data = await api(`/admin/nexus/loyalty-customers?${params}`);
      loyalty = true;
      customers = data.customers || [];
      tierOptions = data.tiers || [];
    } catch (e) {
      if (e.message === '401') throw e;
      // Bez vernostných úrovní (jadro ich ešte neobsluhuje) použijeme bežný zoznam zákazníkov.
      const plain = await api(`/admin/customers?${params}&fields=id,email,first_name,last_name,has_account,created_at`);
      loyalty = false;
      customers = plain.customers || [];
      data = { count: Number(plain.count) || 0 };
    }
    count = Number(data?.count ?? 0) || customers.length;
    if (tierSel) {
      const wanted = ['', 'none', ...tierOptions.map((t) => t.code)];
      if (tierSel.options.length !== wanted.length + 1) {
        tierSel.innerHTML = `<option value="">Všetky úrovne</option><option value="none">Bez úrovne</option>${tierOptions.map((t) => `<option value="${esc(t.code)}">${esc(t.name || t.code)}</option>`).join('')}`;
        tierSel.value = tierFilter;
      }
    }
    const rows = customers.map((c) => {
      const nm = [c.first_name, c.last_name].filter(Boolean).join(' ');
      const av = (nm || c.email || '?').slice(0, 2).toUpperCase();
      const tier = c.tier_name || c.tier_code || '';
      const tierCell = !loyalty ? '<span class="muted">—</span>' : tier
        ? `<b>${esc(tier)}</b>${c.locked ? ' <span class="pill">ručné</span>' : c.source === 'auto' ? ' <span class="muted">automaticky</span>' : ''}`
        : '<span class="muted">—</span>';
      return `<tr data-id="${esc(c.id)}" tabindex="0" role="link">
        <td class="ot-check"><input type="checkbox" data-pick="${esc(c.id)}" aria-label="Označiť zákazníka" ${selected.has(c.id) ? 'checked' : ''}></td>
        <td class="ot-img lv-media"><span class="thumb" style="display:grid;place-items:center;font-weight:600;color:var(--forest)">${esc(av)}</span></td>
        <td class="lv-title">${esc(nm || c.email)}</td>
        <td>${esc(c.email)}</td>
        <td>${tierCell}</td>
        <td><code class="rc-code">${esc(custCode(c.id))}</code></td>
        <td>${fmtDate(c.created_at)}</td>
        <td class="ot-act"><button type="button" class="btn ghost sm">Otvoriť ${navIcon('arrow')}</button></td></tr>`;
    }).join('');
    const from = count ? offset + 1 : 0, to = Math.min(offset + customers.length, count);
    body.innerHTML = `${selected.size ? `<div class="ot-bulk"><span class="muted">Označené zákazničky: ${selected.size}</span><div style="display:flex;gap:8px;flex-wrap:wrap">
        <select class="rc-select" id="cu-assign" aria-label="Priradiť úroveň"><option value="">Priradiť úroveň…</option><option value="automatic">Automaticky podľa útraty</option>${tierOptions.map((t) => `<option value="${esc(t.code)}">${esc(t.name || t.code)}</option>`).join('')}</select>
        <button type="button" class="btn ghost sm" id="cu-assign-go">Priradiť</button>
        <button type="button" class="btn ghost sm" id="cu-pick-clear">Zrušiť označenie</button></div></div>` : ''}
      <div class="ot-wrap"><table class="ot lv"><thead><tr><th class="ot-check"><span class="sr-only">Označiť</span></th><th class="ot-img"><span class="sr-only">Zákazník</span></th><th>Meno</th><th>E-mail</th><th>Úroveň</th><th>ID</th><th>Od</th><th class="ot-act"><span class="sr-only">Akcia</span></th></tr></thead><tbody>${rows || '<tr><td colspan="8" class="empty">Žiadne zákazničky.</td></tr>'}</tbody></table></div>
      <div class="ot-foot"><span class="muted">${count ? `${from}–${to} z ${count}` : 'Žiadne zákazničky'}</span>
      <div style="display:flex;gap:8px"><button class="btn ghost" data-pg="prev" ${offset <= 0 ? 'disabled' : ''}>← Predchádzajúce</button><button class="btn ghost" data-pg="next" ${offset + PAGE >= count ? 'disabled' : ''}>Ďalšie →</button></div></div>`;
    body.querySelectorAll('tr[data-id]').forEach((tr) => {
      const open = () => vCustomerDetail(view, tr.dataset.id);
      tr.onclick = open;
      tr.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
      const box = tr.querySelector('[data-pick]');
      if (box) { box.onclick = (e) => e.stopPropagation(); box.onchange = () => { if (box.checked) selected.add(tr.dataset.id); else selected.delete(tr.dataset.id); load(); }; }
    });
    const prev = body.querySelector('[data-pg="prev"]'), next = body.querySelector('[data-pg="next"]');
    if (prev) prev.onclick = () => { if (offset > 0) { offset = Math.max(0, offset - PAGE); load(); } };
    if (next) next.onclick = () => { if (offset + PAGE < count) { offset += PAGE; load(); } };
    const assignGo = body.querySelector('#cu-assign-go');
    if (assignGo) assignGo.onclick = async () => {
      const code = body.querySelector('#cu-assign').value;
      if (!code) return;
      const ids = [...selected];
      if (!ids.length) return;
      assignGo.disabled = true;
      try {
        await api('/admin/nexus/customers/tiers', { method: 'POST', body: { tier_code: code, customer_ids: ids } });
        selected.clear();
        await vCustomers(view);
      } catch (e) { if (e.message !== '401') alert(e.message); assignGo.disabled = false; }
    };
    const clear = body.querySelector('#cu-pick-clear');
    if (clear) clear.onclick = () => { selected.clear(); load(); };
  };
  const search = view.querySelector('.rc-search');
  let timer = null;
  search.oninput = () => { clearTimeout(timer); timer = setTimeout(() => { query = search.value.trim(); offset = 0; load(); }, 350); };
  tierSel.onchange = () => { tierFilter = tierSel.value; offset = 0; load(); };
  load();
}
async function vCustomerDetail(view, id) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam…</div>';
  const { customer: c } = await api(`/admin/customers/${id}?fields=id,email,first_name,last_name,has_account,created_at,*groups`);
  let groups = []; try { groups = (await api('/admin/customer-groups?limit=50&fields=id,name')).customer_groups || []; } catch {}
  let products = []; try { products = ((await api('/admin/products?limit=100&fields=id,title')).products || []).map((p) => ({ id: p.id, title: p.title })); } catch {}
  let entitlements = [], orders = [], erasures = [];
  try { entitlements = (await api(`/admin/entitlements?customer_id=${encodeURIComponent(id)}&limit=50`)).entitlements || []; } catch {}
  try { orders = (await api(`/admin/orders?customer_id=${encodeURIComponent(id)}&limit=50&fields=id,display_id,created_at,total,payment_status,fulfillment_status`)).orders || []; } catch {}
  try { erasures = ((await api('/admin/customer-erasures?limit=100')).requests || []).filter((r) => r.customer_id === id); } catch {}
  const inG = new Set((c.groups || []).map((g) => g.id));
  const zakladne = `<div class="row"><div><label>E-mail</label><div>${esc(c.email)}</div></div><div><label>Účet</label><div>${c.has_account ? 'áno' : 'hosť'}</div></div></div>
    <div class="row"><div><label>Meno</label><input id="cu-first" value="${esc(c.first_name || '')}"></div><div><label>Priezvisko</label><input id="cu-last" value="${esc(c.last_name || '')}"></div></div>
    <div class="row"><div><label>ID zákazníka</label><div><code class="rc-code">${esc(custCode(c.id))}</code></div></div><div><label>Registrácia</label><div>${fmtDate(c.created_at)}</div></div></div>`;
  const skupiny = `<div>${groups.map((g) => `<label style="display:inline-flex;gap:6px;margin:4px 12px 4px 0;align-items:center"><input type="checkbox" data-g="${esc(g.id)}" ${inG.has(g.id) ? 'checked' : ''} style="width:auto"> ${esc(g.name)}</label>`).join('') || '<span class="muted">Žiadne skupiny.</span>'}</div>`;
  // Vernostná úroveň zákazníka (backend si ju počíta zo skupín; tu ju len zobrazíme a nastavíme).
  let tier = null, tierChoices = [];
  try {
    const found = ((await api(`/admin/nexus/loyalty-customers?q=${encodeURIComponent(c.email)}&limit=10`)).customers || []).find((x) => x.id === id) || null;
    tier = found;
    tierChoices = ((await api('/admin/nexus/loyalty-customers?limit=1')).tiers) || [];
  } catch (e) { tier = null; }
  const vernost = tierChoices.length || tier
    ? `<div class="row"><div><label for="tier-code">Vernostná úroveň</label><select id="tier-code">
        <option value="">Bez úrovne</option>
        <option value="automatic">Automaticky podľa útraty</option>
        ${tierChoices.map((t) => `<option value="${esc(t.code)}"${tier?.tier_code === t.code ? ' selected' : ''}>${esc(t.name || t.code)} (${esc(t.code)})</option>`).join('')}
      </select></div>
      <div><label>Stav</label><div>${tier?.tier_name ? `<b>${esc(tier.tier_name)}</b> ${tier.locked ? '<span class="pill">ručné</span>' : '<span class="muted">automaticky</span>'}` : '<span class="muted">bez úrovne</span>'}</div></div></div>
      ${tier?.locked ? '<p class="muted" style="font-size:12px;margin-top:6px">Nastavené ručne – automatické priradenie podľa útraty to nepremení.</p>' : '<p class="muted" style="font-size:12px;margin-top:6px">Úroveň sa priradí automaticky podľa celkovej útraty zákazníka. Ručne nastavenú úroveň už automatika nepremení.</p>'}
      <div style="margin-top:10px"><button type="button" class="btn gold" id="tier-save">Uložiť úroveň</button></div>`
    : '<p class="muted">Vernostné úrovne ešte nie sú v jadre zapnuté.</p>';
  const objednavky = orders.length ? `<div class="rc-grid">${orders.map((o) => `<div class="rc"><div class="rc-body"><div class="rc-title">#${esc(o.display_id ?? '')}</div>
      <div class="rc-fields"><span class="rc-f"><em>Dátum</em>${fmtDate(o.created_at)}</span><span class="rc-f"><em>Suma</em>${fmtEur(o.total)}</span>
      <span class="rc-f"><em>Platba</em>${esc(PAY_LABEL[o.payment_status] || o.payment_status || '—')}</span>
      <span class="rc-f"><em>Vybavenie</em>${esc(FUL_LABEL[o.fulfillment_status] || o.fulfillment_status || '—')}</span></div></div></div>`).join('')}</div>`
    : '<div class="empty">Zákazník nemá žiadne objednávky.</div>';
  const pristupy = `${entitlements.length ? `<div class="rc-grid">${entitlements.map((e) => `<div class="rc"><div class="rc-body"><div class="rc-title">${esc(e.product_id || '')}</div>
      <div class="rc-fields"><span class="rc-f"><em>Stav</em>${e.status === 'active' ? '<span class="pill ok">aktívny</span>' : `<span class="pill off">${esc(e.status || '—')}</span>`}</span>
      ${e.expires_at ? `<span class="rc-f"><em>Platí do</em>${fmtDate(e.expires_at)}</span>` : ''}
      <span class="rc-f"><em>Pridelené</em>${fmtDate(e.granted_at)}</span></div></div></div>`).join('')}</div>` : '<div class="empty">Zákazník nemá prístup k žiadnemu digitálnemu obsahu.</div>'}
    <div style="margin-top:16px;border-top:1px solid var(--line);padding-top:14px">
      <b>Prideliť prístup ručne</b>
      <p class="muted" style="font-size:12px">Prístup udelíte konkrétnej zákazníkovi ku konkrétnemu produktu (napr. po telefonáte alebo darčeku).</p>
      <div class="row"><div><label for="ent-product">Produkt</label><select id="ent-product">${products.map((p) => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('') || '<option value="">— žiadny produkt —</option>'}</select></div>
      <div><label for="ent-expires">Platí do (voliteľné)</label><input id="ent-expires" type="date"></div></div>
      <div class="row" style="margin-top:10px"><div><label for="ent-reason">Dôvod</label><input id="ent-reason" maxlength="200" placeholder="napr. darček od rodiny"></div><div><button type="button" class="btn gold" id="ent-grant">Prideliť prístup</button></div></div>
    </div>`;
  const ochrana = `<p class="muted" style="margin-top:0">Žiadosť o výmaz osobných údajov (GDPR) musí pred vymazaním potvrdiť správca. Po potvrdení sa údaje zákazníka v jadre odstránia.</p>
    ${erasures.length ? `<div class="rc-grid">${erasures.map((r) => `<div class="rc"><div class="rc-body"><div class="rc-title">Žiadosť ${esc(r.id)}</div>
      <div class="rc-fields"><span class="rc-f"><em>Stav</em>${r.status === 'completed' ? '<span class="pill ok">vykonaná</span>' : '<span class="pill warn">čaká</span>'}</span>
      <span class="rc-f"><em>Požiadala</em>${fmtDate(r.created_at)}</span></div>
      ${r.status !== 'completed' ? `<div style="margin-top:10px"><button type="button" class="btn ghost sm danger" data-erasure="${esc(r.id)}">Vymazať osobné údaje</button></div>` : ''}</div></div>`).join('')}</div>` : '<div class="empty">Zákazník nepožiadala o výmaz osobných údajov.</div>'}`;
  view.innerHTML = `<div class="card"><div class="card-h">Zákazník<div class="card-h-act"><button class="btn ghost" id="cu-back">Späť</button></div></div><div class="card-b">
    <div id="custmsg"></div>
    ${tabsHtml([{ id: 'z', label: 'Základné', html: zakladne }, { id: 's', label: 'Skupiny / tier', html: skupiny }, { id: 'v', label: 'Vernostná úroveň', html: vernost }, { id: 'o', label: 'Objednávky', html: objednavky }, { id: 'p', label: 'Prístupy', html: pristupy }, { id: 'g', label: 'Ochrana údajov', html: ochrana }])}
    <div style="margin-top:16px"><button class="btn gold" id="cu-save">Uložiť</button></div>
  </div></div>`;
  wireTabs(view);
  view.querySelector('#cu-back').onclick = () => vCustomers(view);
  view.querySelector('#cu-save').onclick = async () => {
    const msg = view.querySelector('#custmsg'); msg.innerHTML = '';
    try {
      await api(`/admin/customers/${id}`, { method: 'POST', body: { first_name: view.querySelector('#cu-first').value, last_name: view.querySelector('#cu-last').value } });
      for (const cb of view.querySelectorAll('[data-g]')) { const gid = cb.dataset.g, was = inG.has(gid);
        if (cb.checked && !was) await api(`/admin/customer-groups/${gid}/customers`, { method: 'POST', body: { add: [id] } });
        if (!cb.checked && was) await api(`/admin/customer-groups/${gid}/customers`, { method: 'POST', body: { remove: [id] } }); }
      msg.innerHTML = '<div class="notice">Uložené.</div>';
    } catch (e) { msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
  const tierSave = view.querySelector('#tier-save');
  if (tierSave) tierSave.onclick = async () => {
    const msg = view.querySelector('#custmsg'); msg.innerHTML = '';
    const tier_code = view.querySelector('#tier-code').value || 'automatic';
    tierSave.disabled = true;
    try {
      await api(`/admin/nexus/customers/${encodeURIComponent(id)}/tier`, { method: 'POST', body: { tier_code } });
      await vCustomerDetail(view, id);
    } catch (e) { if (e.message !== '401') msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; tierSave.disabled = false; }
  };
  const grant = view.querySelector('#ent-grant');
  if (grant) grant.onclick = async () => {
    const msg = view.querySelector('#custmsg'); msg.innerHTML = '';
    const product_id = view.querySelector('#ent-product').value;
    if (!product_id) { msg.innerHTML = '<div class="err">Vyberte produkt.</div>'; return; }
    const expires = view.querySelector('#ent-expires').value;
    grant.disabled = true;
    try {
      await api('/admin/entitlements', { method: 'POST', body: { customer_id: id, product_id, ...(expires ? { expires_at: new Date(expires + 'T23:59:59.999Z').toISOString() } : {}), reason: view.querySelector('#ent-reason').value.trim() } });
      await vCustomerDetail(view, id);
    } catch (e) { msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; grant.disabled = false; }
  };
  view.querySelectorAll('[data-erasure]').forEach((b) => b.onclick = async () => {
    const msg = view.querySelector('#custmsg'); msg.innerHTML = '';
    if (!confirm('Naozaj vymazať osobné údaje tejto zákazníka? Údaje sa v jadle odstránia natrvalo a akcia sa nedá vrátiť.')) return;
    b.disabled = true;
    try {
      await api(`/admin/customer-erasures/${encodeURIComponent(b.dataset.erasure)}/execute`, { method: 'POST', body: { confirm: true, customer_id: id } });
      await vCustomerDetail(view, id);
    } catch (e) { msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; b.disabled = false; }
  });
}

async function vCoupons(view) {
  view = freshView(view);
  const { promotions } = await api('/admin/promotions?limit=100&fields=id,code,status,limit,used,*application_method');
  setActions('<button class="btn gold" id="promo-new">+ Nový kupón</button>');
  const nb = document.querySelector('#promo-new'); if (nb) nb.onclick = () => vCouponNew(view);
  listView(view, { title: 'Kupóny a zľavy', rows: promotions, onRow: p => vCouponDetail(view, p.id), empty: 'Zatiaľ žiadne kupóny.', cols: [
    { h: 'Kód', v: p => `<b>${esc(p.code)}</b>` }, { h: 'Stav', v: p => `<span class="pill ${p.status === 'active' ? 'ok' : p.status === 'inactive' ? 'off' : 'warn'}">${esc({ active: 'aktívny', inactive: 'vypnutý', draft: 'rozpracovaný' }[p.status] || p.status)}</span>` },
    { h: 'Zľava', v: p => { const m = p.application_method; return m ? (m.type === 'percentage' ? m.value + ' %' : fmtEur(m.value)) : '—'; } },
    { h: 'Použitie', v: p => { const used = Number(p.used || 0); const limit = p.limit == null ? null : Number(p.limit); return `${used}${limit === null ? ' z neobmedzeného počtu' : ` z ${limit}`}`; } }] });
}
// --- Kupóny: formulár (typ zľavy, rozsah, produkty, platnosť, DPH) a telo požiadavky ---
// Košík v jadre prijíma kupóny len s target_type 'items' a bez target_rules (nexus-cart).
// Preto má „na celý košík“ target_type 'items' bez pravidiel a „len vybrané produkty“
// target_rules items.product.id.
const couponFieldsHtml = (prefix, m = {}, opts = {}) => {
  const isPct = (m.type || 'percentage') === 'percentage';
  const target = opts.target || 'cart';
  const selected = opts.selected || [];
  return `<div class="row">
      <div><label for="${prefix}-type">Typ zľavy</label><select id="${prefix}-type">
        <option value="percentage"${isPct ? ' selected' : ''}>Percentá (%)</option>
        <option value="fixed"${!isPct ? ' selected' : ''}>Pevná suma (€)</option>
      </select></div>
      <div><label for="${prefix}-value">Hodnota</label><input id="${prefix}-value" type="number" min="0" step="${isPct ? '1' : '0.01'}" value="${esc(String(m.value ?? ''))}"></div>
    </div>
    <div class="row" style="margin-top:12px">
      <div><label for="${prefix}-target">Zľava platí na</label><select id="${prefix}-target">
        <option value="cart"${target === 'cart' ? ' selected' : ''}>Na celý košík</option>
        <option value="products"${target === 'products' ? ' selected' : ''}>Len vybrané produkty</option>
      </select></div>
      <div><label>Cena</label><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="${prefix}-tax" ${opts.taxInclusive === false ? '' : 'checked'} style="width:auto"> vrátane DPH</label></div>
    </div>
    <div id="${prefix}-products" ${target === 'products' ? '' : 'hidden'} style="margin-top:12px">
      <label>Produkty, na ktoré zľava platí</label>
      <div class="rc-grid" id="${prefix}-plist">${(opts.products || []).map((p) => `<label class="rc" style="align-items:center"><input type="checkbox" data-prod="${esc(p.id)}" ${selected.includes(p.id) ? 'checked' : ''} style="width:auto"> ${esc(p.title)}</label>`).join('') || '<span class="muted">Načítavam produkty…</span>'}</div>
    </div>
    <div class="row" style="margin-top:12px">
      <div><label for="${prefix}-from">Platí od</label><input id="${prefix}-from" type="date" value="${esc(opts.from || '')}"></div>
      <div><label for="${prefix}-to">Platí do</label><input id="${prefix}-to" type="date" value="${esc(opts.to || '')}"></div>
    </div>`;
};
const couponBody = (view, prefix, code, extra = {}) => {
  const type = view.querySelector(`#${prefix}-type`).value;
  const value = Number(view.querySelector(`#${prefix}-value`).value);
  const target = view.querySelector(`#${prefix}-target`).value;
  const taxInclusive = view.querySelector(`#${prefix}-tax`).checked;
  const from = view.querySelector(`#${prefix}-from`).value;
  const to = view.querySelector(`#${prefix}-to`).value;
  const productIds = [...view.querySelectorAll(`#${prefix}-plist [data-prod]`)].filter((cb) => cb.checked).map((cb) => cb.dataset.prod);
  const am = {
    type, value,
    // Celý košík = 'order'; len vybrané produkty = 'items' + pravidlo na produkty (jadro zľavu rozdeľuje).
    target_type: target === 'products' ? 'items' : 'order',
    allocation: type === 'percentage' ? 'each' : 'across',
    ...(type === 'fixed' ? { currency_code: 'eur' } : {}),
    ...(target === 'products' && productIds.length ? { target_rules: [{ attribute: 'items.product.id', operator: 'in', values: productIds }] } : {}),
  };
  const identifier = `admin-coupon-${String(code || 'kupon').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return {
    type: 'standard', status: 'active', is_automatic: false, is_tax_inclusive: taxInclusive,
    application_method: am,
    ...(from || to ? { campaign: { name: `Kupón ${code || ''}`.trim(), campaign_identifier: identifier, ...(from ? { starts_at: new Date(from + 'T00:00:00.000Z') } : {}), ...(to ? { ends_at: new Date(to + 'T23:59:59.999Z') } : {}) } } : {}),
    ...extra,
  };
};
/** Prepne zobrazenie produktov pri voľbe rozsahu zľavy. */
const wireCouponTarget = (view, prefix) => {
  const sel = view.querySelector(`#${prefix}-target`);
  const box = view.querySelector(`#${prefix}-products`);
  if (!sel || !box) return;
  const sync = () => { box.hidden = sel.value !== 'products'; };
  sel.onchange = sync; sync();
};
async function vCouponNew(view) {
  view = freshView(view);
  let products = [];
  try { products = ((await api('/admin/products?limit=200&fields=id,title')).products || []).map((p) => ({ id: p.id, title: p.title })); } catch {}
  view.innerHTML = `<div class="card"><div class="card-h">Nový kupón<button class="btn ghost" id="pn-back">Späť</button></div><div class="card-b">
    <div id="pnmsg"></div>
    <label for="pn-code">Kód</label><input id="pn-code" placeholder="napr. JAR26" autocomplete="off">
    ${couponFieldsHtml('pn', { type: 'percentage', value: 10 }, { products })}
    <div style="margin-top:16px"><button class="btn gold" id="pn-save">Vytvoriť</button></div>
    <p class="muted" style="margin-top:10px">Kupón vytvoríte tu, QR kód k nemu pridáte v záložke QR kódy. Košík uplatní zľavu, keď je kód zadaný v košíku.</p>
  </div></div>`;
  wireCouponTarget(view, 'pn');
  view.querySelector('#pn-back').onclick = () => vCoupons(view);
  view.querySelector('#pn-save').onclick = async () => {
    const msg = view.querySelector('#pnmsg'); msg.innerHTML = '';
    const code = view.querySelector('#pn-code').value.trim();
    if (!code) { msg.innerHTML = '<div class="err">Zadajte kód kupónu.</div>'; return; }
    const value = Number(view.querySelector('#pn-value').value);
    if (!Number.isFinite(value) || value < 0) { msg.innerHTML = '<div class="err">Hodnota zľavy musí byť číslo nie menšie ako nula.</div>'; return; }
    if (view.querySelector('#pn-target').value === 'products' && !view.querySelectorAll('#pn-plist [data-prod]:checked').length) {
      msg.innerHTML = '<div class="err">Vyberte aspoň jeden produkt, na ktorý zľava platí.</div>'; return;
    }
    try { await api('/admin/promotions', { method: 'POST', body: couponBody(view, 'pn', code) }); await vCoupons(view); }
    catch (e) { msg.innerHTML = `<div class="err">Jadro odmietlo: ${esc(e.message)}</div>`; }
  };
}
async function vCouponDetail(view, id) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam…</div>';
  const { promotion: p } = await api(`/admin/promotions/${id}?fields=id,code,status,limit,used,is_tax_inclusive,*application_method,*campaign`);
  const m = p.application_method || {};
  let products = [];
  try { products = ((await api('/admin/products?limit=200&fields=id,title')).products || []).map((x) => ({ id: x.id, title: x.title })); } catch {}
  const rules = m.target_rules || [];
  const selected = (rules[0]?.values || []).map((v) => v.id || v.value).filter(Boolean);
  const target = selected.length ? 'products' : 'cart';
  const from = p.campaign?.starts_at ? String(p.campaign.starts_at).slice(0, 10) : '';
  const to = p.campaign?.ends_at ? String(p.campaign.ends_at).slice(0, 10) : '';
  const used = Number(p.used || 0), limit = p.limit == null ? null : Number(p.limit);
  view.innerHTML = `<div class="card"><div class="card-h">Kupón ${esc(p.code)}<div class="card-h-act"><button class="btn ghost" id="pd-back">Späť</button></div></div><div class="card-b">
    <div id="pdmsg"></div>
    <div class="row"><div><label>Stav</label><select id="pd-status"><option value="active"${p.status === 'active' ? ' selected' : ''}>aktívny</option><option value="inactive"${p.status === 'inactive' ? ' selected' : ''}>inactive</option><option value="draft"${p.status === 'draft' ? ' selected' : ''}>draft</option></select></div>
    <div><label>Použitia</label><div>${used} ${limit === null ? 'z neobmedzeného počtu' : `z ${limit}`}${limit !== null && used >= limit ? ' <span class="pill off">limit dosiahnutý</span>' : ''}</div></div></div>
    ${couponFieldsHtml('pd', m, { products, selected, target, taxInclusive: p.is_tax_inclusive !== false, from, to })}
    <div class="row" style="margin-top:14px">
      <div><label for="pd-limit">Limit použití (0 = bez limitu)</label><input id="pd-limit" type="number" min="0" step="1" value="${esc(String(limit ?? 0))}"></div>
    </div>
    <p class="muted" style="font-size:12px;margin-top:10px">Zľava platí na nové objednávky. Košík ju uplatní, keď je kód zadaný v košíku; pri možnosti „len vybrané produkty“ sa zľava počíta len z týchto produktov.</p>
    <div style="margin-top:16px"><button class="btn gold" id="pd-save">Uložiť</button></div>
  </div></div>`;
  wireCouponTarget(view, 'pd');
  view.querySelector('#pd-back').onclick = () => vCoupons(view);
  view.querySelector('#pd-save').onclick = async () => {
    const msg = view.querySelector('#pdmsg'); msg.innerHTML = '';
    const value = Number(view.querySelector('#pd-value').value);
    const limitRaw = Number(view.querySelector('#pd-limit').value);
    if (!Number.isFinite(value) || value < 0) { msg.innerHTML = '<div class="err">Hodnota zľavy musí byť číslo nie menšie ako nula.</div>'; return; }
    if (view.querySelector('#pd-type').value === 'percentage' && value > 100) { msg.innerHTML = '<div class="err">Percentuálna zľava môže byť najviac 100 %.</div>'; return; }
    if (view.querySelector('#pd-target').value === 'products' && !view.querySelectorAll('#pd-plist [data-prod]:checked').length) {
      msg.innerHTML = '<div class="err">Vyberte aspoň jeden produkt, na ktorý zľava platí.</div>'; return;
    }
    const body = couponBody(view, 'pd', p.code, {
      status: view.querySelector('#pd-status').value,
      limit: Number.isFinite(limitRaw) && limitRaw > 0 ? Math.trunc(limitRaw) : null,
    });
    if (p.campaign?.id && !body.campaign) body.campaign_id = p.campaign.id;
    try { await api(`/admin/promotions/${id}`, { method: 'POST', body }); await vCoupons(view); }
    catch (e) { msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
}
// agendy skúšajúce endpoint, inak „čaká na backend"
async function tryList(view, { title, endpoint, key, cols, note }) {
  view.innerHTML = '<div class="muted">Načítavam…</div>';
  try {
    const d = await api(endpoint);
    const rows = d[key] || d.items || [];
    listView(view, { title, rows, cols });
  } catch (e) {
    view.innerHTML = `<div class="empty"><div style="font-size:15px;font-weight:600;color:var(--ink);margin-bottom:6px">${esc(title)} — napája sa</div>${esc(note)}</div>`;
  }
}
function stub(view, title, note) {
  view = freshView(view);
  view.innerHTML = `<div class="empty"><div style="font-size:15px;font-weight:600;color:var(--ink);margin-bottom:6px">${esc(title)} — pripravujeme</div>${esc(note)}</div>`;
}

// sub-prepínač v topbare (pills) — jedna obrazovka, viac pohľadov
// `view` je pôvodný uzol #view; po každej výmene ho nahradí `freshView`. Prepodávať musíme
// ten NAJŽIVŠI uzol, inak by sa pohľad vykreslil do odpojeného uzlu a na obrazovke by sa nič nezmenilo.
function liveView(view) {
  let cur = view; while (cur && cur._next) cur = cur._next;
  return cur && cur.isConnected ? cur : freshView(view);
}
function subnav(view, items, idx = 0) {
  const a = document.querySelector('#actions');
  if (a) a.innerHTML = `<div class="pills">${items.map((it, i) => `<button class="pill ${i === idx ? 'on' : ''}" data-i="${i}">${esc(it.label)}</button>`).join('')}</div>`;
  if (a) a.querySelectorAll('.pill').forEach(b => b.onclick = () => { if (+b.dataset.i !== idx) subnav(view, items, +b.dataset.i); });
  items[idx].run(liveView(view));
}
// --- spoločné: stránkovaný zoznam kariet so záložkami stavu ---
const PAGE_LIMIT = 12;
function pagedHtml({ tabs, active, items, count, offset, card, empty }) {
  const from = count ? offset + 1 : 0, to = Math.min(offset + items.length, count);
  return `${tabs ? `<div class="tabs">${tabs.map(t => `<button class="tab ${t.id === active ? 'active' : ''}" data-st="${esc(t.id)}">${esc(t.label)}</button>`).join('')}</div>` : ''}
    <div class="rc-grid">${items.length ? items.map(r => `<button class="rc" data-id="${esc(r.id)}">${card(r)}</button>`).join('') : `<div class="empty">${esc(empty)}</div>`}</div>
    <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:14px;flex-wrap:wrap">
      <span class="muted">${count ? `${from}–${to} z ${count}` : ''}</span>
      <div style="display:flex;gap:8px"><button class="btn ghost" data-pg="prev" ${offset > 0 ? '' : 'disabled'}>← Predchádzajúce</button><button class="btn ghost" data-pg="next" ${offset + PAGE_LIMIT < count ? '' : 'disabled'}>Ďalšie →</button></div>
    </div>`;
}
function wirePaged(view, { items, offset, go, open }) {
  view.querySelectorAll('[data-st]').forEach(b => b.onclick = () => go({ status: b.dataset.st, offset: 0 }));
  view.querySelector('[data-pg="prev"]').onclick = () => go({ offset: Math.max(0, offset - PAGE_LIMIT) });
  view.querySelector('[data-pg="next"]').onclick = () => go({ offset: offset + PAGE_LIMIT });
  view.querySelectorAll('.rc[data-id]').forEach(el => el.onclick = () => open(items.find(x => x.id === el.dataset.id)));
}
async function loadError(view, e, retry) {
  if (e.message === '401') throw e;
  view.innerHTML = `<div class="err">${esc(e.message)}</div><div style="margin-top:12px"><button class="btn ghost" id="x-retry">Obnoviť</button></div>`;
  view.querySelector('#x-retry').onclick = retry;
}
// mená zákazníčok a produktov pre karty (natívne Admin API, len na čítanie)
async function namesFor(customerIds, productIds) {
  const q = (ids) => [...new Set(ids.filter(Boolean))].map(id => 'id[]=' + encodeURIComponent(id)).join('&');
  const [cs, ps] = await Promise.all([
    customerIds.length ? api(`/admin/customers?${q(customerIds)}&fields=id,email,first_name,last_name&limit=100`).catch(e => { if (e.message === '401') throw e; return {}; }) : {},
    productIds.length ? api(`/admin/products?${q(productIds)}&fields=id,title&limit=100`).catch(e => { if (e.message === '401') throw e; return {}; }) : {},
  ]);
  const cust = new Map((cs.customers || []).map(c => [c.id, [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || c.id]));
  const prod = new Map((ps.products || []).map(x => [x.id, x.title]));
  return { cust: id => cust.get(id) || id || '—', prod: id => prod.get(id) || id || '—' };
}

// --- Darčekové poukazy (/admin/vouchers*) — kód je vždy maskovaný, zostatky počíta jadro ---
const V_STATUS = { active: ['aktívny', 'ok'], depleted: ['vyčerpaný', 'off'], expired: ['po platnosti', 'off'], void: ['zneplatnený', 'off'] };
const V_TX = { issued: 'vydaný', redeemed: 'použitý v objednávke', forfeited: 'prepadnutý', reversed: 'stornované použitie', refunded: 'vrátené na poukaz', voided: 'zneplatnený', expired: 'vypršal' };
const V_TABS = [{ id: '', label: 'Všetky' }, { id: 'active', label: 'Aktívne' }, { id: 'depleted', label: 'Vyčerpané' }, { id: 'expired', label: 'Po platnosti' }, { id: 'void', label: 'Zneplatnené' }];
async function vVouchers(view, st = {}) {
  view = freshView(view);
  const status = st.status || '', offset = Math.max(0, st.offset | 0);
  const go = (patch) => vVouchers(view, { status, offset, ...patch });
  view.innerHTML = '<div class="muted">Načítavam poukazy…</div>';
  let d;
  try { d = await api(`/admin/vouchers?limit=${PAGE_LIMIT}&offset=${offset}${status ? '&status=' + status : ''}`); }
  catch (e) { return loadError(view, e, () => go({})); }
  const items = d.vouchers || [];
  view.innerHTML = pagedHtml({ tabs: V_TABS, active: status, items, count: d.count || 0, offset, empty: 'Žiadne poukazy.',
    card: v => `<div class="rc-body"><div class="rc-title">${esc(v.code)}</div><div class="rc-fields">
      <span class="rc-f"><em>Zostatok</em>${fmtEur(v.balance)} z ${fmtEur(v.initial_amount)}</span>
      <span class="rc-f"><em>Stav</em>${statusPill(V_STATUS, v.status)}</span>
      <span class="rc-f"><em>Platí do</em>${v.expires_at ? fmtDate(v.expires_at) : '—'}</span></div></div>` })
    + `<div class="card" style="margin-top:20px"><div class="card-h">Vrátiť peniaze na poukaz</div><div class="card-b">
      <p class="muted">Ak zákazník zaplatila objednávku poukazom, vrátite sumu späť na jej poukaz. Jadro nepustí viac, než bolo poukazom zaplatené.</p>
      <div id="vrmsg"></div>
      <form id="vr" class="row"><div><label>ID objednávky</label><input id="vr-o" placeholder="order_…" required></div>
      <div><label>Suma (EUR)</label><input id="vr-a" type="number" step="0.01" min="0.01" required></div>
      <div><label>Poznámka (voliteľné)</label><input id="vr-n" maxlength="300"></div>
      <div style="align-self:end"><button class="btn gold" type="submit">Vrátiť na poukaz</button></div></form></div></div>`;
  wirePaged(view, { items, offset, go, open: v => vVoucherDetail(view, v, () => go({})) });
  const key = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
  view.querySelector('#vr').onsubmit = async (e) => {
    e.preventDefault();
    const msg = view.querySelector('#vrmsg'), btn = e.target.querySelector('button');
    const order_id = view.querySelector('#vr-o').value.trim(), amount = Math.round(Number(view.querySelector('#vr-a').value) * 100) / 100, note = view.querySelector('#vr-n').value.trim();
    if (!/^order_[A-Za-z0-9]{1,64}$/.test(order_id)) { msg.innerHTML = '<div class="err">ID objednávky má tvar order_…</div>'; return; }
    if (!(amount > 0)) { msg.innerHTML = '<div class="err">Zadajte kladnú sumu v eurách.</div>'; return; }
    if (!confirm(`Vrátiť ${fmtEur(amount)} na poukaz z objednávky ${order_id}?`)) return;
    msg.innerHTML = ''; btn.disabled = true;
    try {
      const r = await api('/admin/vouchers/refund', { method: 'POST', body: { order_id, amount, idempotency_key: key, ...(note ? { note } : {}) } });
      msg.innerHTML = `<div class="notice">${r.replayed ? 'Toto vrátenie už bolo spracované.' : `Vrátené: ${r.refunds.map(x => `${fmtEur(x.amount)} (nový zostatok ${fmtEur(x.balance)})`).join(', ')}`}</div>`;
    } catch (err) { if (err.message === '401') return; btn.disabled = false; msg.innerHTML = `<div class="err">${esc(err.message)}</div>`; }
  };
}
async function vVoucherDetail(view, v, back) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam…</div>';
  let tx = [], mail = null;
  try { tx = (await api(`/admin/vouchers/${encodeURIComponent(v.id)}/transactions?limit=50`)).transactions || []; }
  catch (e) { if (e.message === '401') return; }
  // Náhľad e-mailu, ktorý putuje obdarovanej (šablona je v časti Obsah → E-maily).
  try { mail = (await api('/admin/email-templates/gift-voucher-recipient-sk/preview', { method: 'POST', body: { texts: {} } })).preview || null; }
  catch (e) { mail = null; }
  const card = voucherHtml({ value: v.initial_amount, currency: v.currency_code, code: v.code, expires_at: v.expires_at, note: 'Kód je v tejto tlači maskovaný – plný kód dostala obdarovaná e-mailom.' });
  view.innerHTML = `<div class="card"><div class="card-h">Poukaz ${esc(v.code)}<div class="card-h-act">
      <button type="button" class="btn gold" id="v-print">Tlačiť poukaz</button>
      <button class="btn ghost" id="v-back">Späť</button></div></div><div class="card-b">
    <div id="vmsg"></div>
    <div class="row"><div><label>Zostatok</label><div>${fmtEur(v.balance)} z ${fmtEur(v.initial_amount)}</div></div><div><label>Stav</label><div>${statusPill(V_STATUS, v.status)}</div></div></div>
    <div class="row"><div><label>Vydaný</label><div>${fmtDate(v.issued_at)}</div></div><div><label>Platí do</label><div>${v.expires_at ? fmtDate(v.expires_at) : '—'}</div></div></div>
    <div class="row"><div><label>Objednávka nákupu</label><div>${esc(v.source_order_id || '—')}</div></div><div><label>Doručenie</label><div>${esc(v.delivery_method || '—')} · ${esc(v.delivery_status || '—')}</div></div></div>
    ${v.voided_at ? `<p class="muted">Zneplatnený ${fmtDate(v.voided_at)}: ${esc(v.void_reason || '')}</p>` : ''}
    <div class="voucher-preview">${card}</div>
    <p class="muted" style="font-size:12px;margin-top:10px">Náhľad poukazu v značke ANASTASIA. Hodnotu a platnosť overuje backend – v náhľade je kód maskovaný, plný kód dostala obdarovaná e-mailom.</p>
    ${mail ? `<div style="margin-top:16px;border-top:1px solid var(--line);padding-top:12px">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>E-mail pre obdarovanú</b><span class="muted" style="font-size:12px">${esc(mail.subject || '')}</span></div>
      <iframe class="voucher-mail" title="Náhľad e-mailu pre obdarovanú" sandbox="" srcdoc="${esc(mail.html || '')}"></iframe>
    </div>` : ''}
    <label style="margin-top:14px">História</label>
    <div class="rc-grid">${tx.map(t => `<div class="rc"><div class="rc-body"><div class="rc-title">${esc(V_TX[t.type] || t.type)} · ${fmtEur(t.amount)}</div><div class="rc-fields">
      <span class="rc-f"><em>Kedy</em>${fmtDate(t.created_at)}</span><span class="rc-f"><em>Zostatok po</em>${fmtEur(t.balance_after)}</span>
      ${t.order_id ? `<span class="rc-f"><em>Objednávka</em>${esc(t.order_id)}</span>` : ''}${t.reversed_at ? '<span class="pill off">stornované</span>' : ''}</div></div></div>`).join('') || '<div class="empty">Bez záznamov.</div>'}</div>
    ${v.status === 'active' ? `<div style="margin-top:18px;border-top:1px solid var(--line);padding-top:14px"><label>Dôvod zneplatnenia</label><input id="v-reason" maxlength="300" placeholder="napr. podvodná objednávka">
      <div style="margin-top:10px"><button class="btn ghost" id="v-void">Zneplatniť poukaz</button></div></div>` : ''}
  </div></div>`;
  view.querySelector('#v-back').onclick = back;
  const printBtn = view.querySelector('#v-print');
  if (printBtn) printBtn.onclick = () => openPrintHtml('Darčekový poukaz – ANASTASIA', card, VOUCHER_CSS);
  const vb = view.querySelector('#v-void');
  if (vb) vb.onclick = async () => {
    const reason = view.querySelector('#v-reason').value.trim(), msg = view.querySelector('#vmsg');
    if (!reason) { msg.innerHTML = '<div class="err">Uveďte dôvod zneplatnenia.</div>'; return; }
    if (!confirm(`Naozaj zneplatniť poukaz? Zostatok ${fmtEur(v.balance)} prepadne a nedá sa to vrátiť.`)) return;
    msg.innerHTML = ''; vb.disabled = true;
    try { const r = await api(`/admin/vouchers/${encodeURIComponent(v.id)}/void`, { method: 'POST', body: { reason } }); await vVoucherDetail(view, r.voucher, back); flash('#vmsg', '<div class="notice">Poukaz je zneplatnený.</div>'); }
    catch (e) { if (e.message === '401') return; vb.disabled = false; msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
}
const VS_DELIVERY = { recipient_email: 'e-mailom obdarovanej', buyer_pdf: 'PDF kupujúcej', both: 'obdarovanej aj PDF kupujúcej' };
async function vVoucherSettings(view, notice) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam nastavenie…</div>';
  let s, cats;
  try { [{ settings: s }, { product_categories: cats }] = await Promise.all([api('/admin/vouchers/settings'), api('/admin/product-categories?limit=200&fields=id,name')]); }
  catch (e) { return loadError(view, e, () => vVoucherSettings(view, notice)); }
  const chk = (id, on, label) => `<label style="margin-top:12px;display:flex;gap:8px;align-items:center"><input type="checkbox" id="${id}" style="width:auto" ${on ? 'checked' : ''}> ${label}</label>`;
  view.innerHTML = `<div class="card"><div class="card-h">Nastavenie darčekových poukazov</div><div class="card-b">
    <p class="muted">Zmena platí pre nové poukazy. Už vydané poukazy si držia hodnotu, platnosť a pravidlá z dňa nákupu.</p>
    <div id="vsmsg">${notice || ''}</div>
    ${chk('vs-on', s.enabled, 'Poukazy sú v predaji na webe')}
    <div class="row" style="margin-top:12px"><div><label>Hodnoty v € (oddeľte bodkočiarkou, najviac 10)</label><input id="vs-values" value="${esc(s.values.map(x => String(x).replace('.', ',')).join('; '))}" placeholder="50; 100; 200"></div>
    <div><label>Platnosť (mesiace, 1–60)</label><input id="vs-months" type="number" min="1" max="60" step="1" value="${s.validity_months}"></div></div>
    <div class="row"><div><label>Doručenie</label><select id="vs-delivery">${Object.entries(VS_DELIVERY).map(([k, l]) => `<option value="${k}" ${s.delivery_method === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div><label>Kde sa dá poukaz použiť</label><select id="vs-scope"><option value="all" ${s.scope_type === 'all' ? 'selected' : ''}>na celý e-shop</option><option value="categories" ${s.scope_type === 'categories' ? 'selected' : ''}>len vo vybraných kategóriách</option></select></div></div>
    <div id="vs-cats" ${s.scope_type === 'categories' ? '' : 'hidden'}><label>Kategórie</label><div style="display:flex;flex-wrap:wrap;gap:4px 18px">${(cats || []).map(c => `<label style="display:flex;gap:6px;align-items:center;font-weight:400"><input type="checkbox" data-cat="${esc(c.id)}" style="width:auto" ${s.category_ids.includes(c.id) ? 'checked' : ''}> ${esc(c.name)}</label>`).join('') || '<span class="muted">Žiadne kategórie.</span>'}</div></div>
    ${chk('vs-partial', s.partial_redemption, 'Poukaz sa dá čerpať postupne (zostatok ostáva na ďalší nákup)')}
    <div style="margin-top:18px"><button class="btn gold" id="vs-save">Uložiť nastavenie</button></div>
  </div></div>`;
  const $ = (q) => view.querySelector(q), msg = $('#vsmsg');
  $('#vs-scope').onchange = () => { $('#vs-cats').hidden = $('#vs-scope').value !== 'categories'; };
  $('#vs-save').onclick = async () => {
    const parts = $('#vs-values').value.split(/[;\s]+/).filter(Boolean);
    const values = parts.map(p => p.replace(',', '.'));
    const months = Number($('#vs-months').value), scope_type = $('#vs-scope').value;
    const category_ids = scope_type === 'categories' ? [...view.querySelectorAll('[data-cat]:checked')].map(x => x.dataset.cat) : [];
    const err = !values.length || values.length > 10 || values.some(v => !/^\d+(\.\d{1,2})?$/.test(v) || Number(v) < 1 || Number(v) > 10000) ? 'Hodnoty zadajte ako sumy od 1 do 10 000 € oddelené bodkočiarkou, najviac 10.'
      : new Set(values.map(Number)).size !== values.length ? 'Každá hodnota môže byť len raz.'
      : !Number.isInteger(months) || months < 1 || months > 60 ? 'Platnosť zadajte v celých mesiacoch od 1 do 60.'
      : scope_type === 'categories' && !category_ids.length ? 'Vyberte aspoň jednu kategóriu.' : '';
    if (err) { msg.innerHTML = `<div class="err">${err}</div>`; return; }
    const btn = $('#vs-save'); btn.disabled = true; msg.innerHTML = '';
    try {
      await api('/admin/vouchers/settings', { method: 'POST', body: { enabled: $('#vs-on').checked, values: values.map(Number), validity_months: months, scope_type, category_ids, partial_redemption: $('#vs-partial').checked, delivery_method: $('#vs-delivery').value } });
      await vVoucherSettings(view, '<div class="notice">Nastavenie je uložené a ponuka poukazov na webe je aktualizovaná.</div>');
    } catch (e) { if (e.message === '401') return; btn.disabled = false; msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
}
const vQr = qrAgenda({ api, esc, fmtDate, freshView, openPrintHtml });
const vPoukazy = (view) => subnav(view, [{ label: 'Kupóny a zľavy', run: vCoupons }, { label: 'QR kódy', run: vQr }, { label: 'Darčekové poukazy', run: vVouchers }, { label: 'Nastavenie poukazov', run: vVoucherSettings }]);
// --- Konzultácie (/admin/bookings*) — termíny drží rezervačné jadro, tu prehľad a zrušenie ---
const B_STATUS = { held: ['čaká na platbu', 'warn'], confirmed: ['potvrdená', 'ok'], canceled: ['zrušená', 'off'], completed: ['prebehla', 'ok'] };
const B_TABS = [{ id: '', label: 'Všetky' }, { id: 'confirmed', label: 'Potvrdené' }, { id: 'held', label: 'Čakajú na platbu' }, { id: 'completed', label: 'Prebehli' }, { id: 'canceled', label: 'Zrušené' }];
async function vKonzultacie(view, st = {}) {
  view = freshView(view);
  const status = st.status || '', offset = Math.max(0, st.offset | 0);
  const go = (patch) => vKonzultacie(view, { status, offset, ...patch });
  view.innerHTML = '<div class="muted">Načítavam konzultácie…</div>';
  let d, n;
  try {
    d = await api(`/admin/bookings?limit=${PAGE_LIMIT}&offset=${offset}${status ? '&status=' + status : ''}`);
    n = await namesFor((d.bookings || []).map(b => b.customer_id), (d.bookings || []).map(b => b.product_id));
  } catch (e) { return loadError(view, e, () => go({})); }
  const items = (d.bookings || []).map(b => ({ ...b, customer_label: n.cust(b.customer_id), product_label: n.prod(b.product_id) }));
  // Stavové záložky patria do hornej lišty – rovnako ako v ostatných častiach administrácie.
  setActions(`<div class="pills">${B_TABS.map(t => `<button class="pill ${t.id === status ? 'on' : ''}" data-st="${esc(t.id)}">${esc(t.label)}</button>`).join('')}</div>`);
  document.querySelectorAll('#actions .pills .pill').forEach(b => b.onclick = () => go({ status: b.dataset.st, offset: 0 }));
  view.innerHTML = pagedHtml({ tabs: null, active: status, items, count: d.count || 0, offset, empty: 'Žiadne konzultácie.',
    card: b => `<div class="rc-body"><div class="rc-title">${esc(b.customer_label)}</div><div class="rc-fields">
      <span class="rc-f"><em>Termín</em>${fmtDate(b.starts_at)}</span><span class="rc-f"><em>Konzultácia</em>${esc(b.product_label)}</span>
      <span class="rc-f"><em>Stav</em>${statusPill(B_STATUS, b.status)}</span></div></div>` });
  wirePaged(view, { items, offset, go, open: b => vBookingDetail(view, b, () => go({})) });
  // Export kalendára (.ics) – termíny sa dajú pridať do kalendára na mobile aj na počítači.
  setActions('<button class="btn ghost" id="ics-export">Export kalendára (.ics)</button>');
  const icsBtn = document.querySelector('#ics-export');
  if (icsBtn) icsBtn.onclick = () => {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ANASTASIA//Konzultacie//SK', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    for (const b of items) {
      if (!b.starts_at) continue;
      const stamp = (d) => new Date(d).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      const end = b.ends_at || new Date(new Date(b.starts_at).getTime() + 45 * 60000).toISOString();
      lines.push('BEGIN:VEVENT', `UID:${esc(b.id)}@anastasia`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(b.starts_at)}`, `DTEND:${stamp(end)}`,
        `SUMMARY:${icsEscape(`Konzultácia – ${b.product_label || 'ANASTASIA'}`)}`,
        `DESCRIPTION:${icsEscape(`Zákazník: ${b.customer_label || '—'}`)}`, 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    downloadText('konzultacie.ics', lines.join('\r\n'), 'text/calendar;charset=utf-8');
  };
}
const icsEscape = (s) => String(s ?? '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
function vBookingDetail(view, b, back) {
  view = freshView(view);
  // Termín naviazaný na košík/objednávku backend samostatne nezruší (BOOKING_CANCEL_ORDER_FIRST): ruší sa zrušením objednávky.
  const inOrder = Boolean(b.metadata?.checkout_cart_id);
  const active = (b.status === 'held' || b.status === 'confirmed') && !inOrder;
  view.innerHTML = `<div class="card"><div class="card-h">Konzultácia · ${esc(b.customer_label)}<button class="btn ghost" id="b-back">Späť</button></div><div class="card-b">
    <div id="bmsg"></div>
    <div class="row"><div><label>Termín</label><div>${fmtDate(b.starts_at)} – ${fmtDate(b.ends_at)}</div></div><div><label>Stav</label><div>${statusPill(B_STATUS, b.status)}</div></div></div>
    <div class="row"><div><label>Konzultácia</label><div>${esc(b.product_label)}</div></div><div><label>Objednávka</label><div>${b.order_id ? `<a href="#/objednavky" data-ord="${esc(b.order_id)}">${esc(b.order_id)}</a>` : '—'}</div></div></div>
    ${b.status === 'held' && b.held_until ? `<p class="muted">Termín je držaný do ${fmtDate(b.held_until)}; potom sa sám uvoľní.</p>` : ''}
    ${inOrder && b.status === 'confirmed' ? `<p class="muted">Termín je zaplatený v objednávke. Zrušíte ho zrušením objednávky${b.order_id ? ` (<a href="#/objednavky" data-ord="${esc(b.order_id)}">otvoriť objednávku</a>)` : ''}; zákazníkovi odíde e-mail o zrušení a zaplatená suma sa jej automaticky vráti.</p>` : ''}
    ${inOrder && b.status === 'held' ? '<p class="muted">Zákazník má termín v rozpracovanej pokladni. Ak nezaplatí, termín sa sám uvoľní.</p>' : ''}
    ${b.canceled_at ? `<p class="muted">Zrušená ${fmtDate(b.canceled_at)}${b.cancel_reason ? ': ' + esc(b.cancel_reason) : ''}</p>` : ''}
    ${active ? `<div style="margin-top:18px;border-top:1px solid var(--line);padding-top:14px"><label>Dôvod zrušenia (voliteľné)</label><input id="b-reason" maxlength="500">
      <div style="margin-top:10px"><button class="btn ghost" id="b-cancel">Zrušiť termín</button></div>
      <p class="muted" style="font-size:12px;margin-top:8px">${b.status === 'confirmed' ? 'Zákazníkovi odíde e-mail o zrušení. Peniaze vrátite v detaile objednávky.' : 'Termín sa uvoľní pre ostatných zákazníkov.'}</p></div>` : ''}
  </div></div>`;
  view.querySelector('#b-back').onclick = back;
  view.querySelectorAll('[data-ord]').forEach(ol => { ol.onclick = (e) => { e.preventDefault(); vOrderDetail(view, b.order_id); }; });
  const cb = view.querySelector('#b-cancel');
  if (cb) cb.onclick = async () => {
    if (!confirm('Naozaj zrušiť tento termín?')) return;
    const msg = view.querySelector('#bmsg'), reason = view.querySelector('#b-reason').value.trim(); msg.innerHTML = ''; cb.disabled = true;
    try { const r = await api(`/admin/bookings/${encodeURIComponent(b.id)}/cancel`, { method: 'POST', body: reason ? { reason } : {} }); vBookingDetail(view, { ...b, ...r.booking }, back); flash('#bmsg', '<div class="notice">Termín je zrušený.</div>'); }
    catch (e) { if (e.message === '401') return; cb.disabled = false; msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
}

// --- Typy konzultácií (/admin/booking/types) — typ = produkt s cenou, ktorý si zákazník rezervuje na webe ---
const BT_FORM = { online: 'online', in_person: 'osobne' };
async function vBookingTypes(view, notice) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam typy konzultácií…</div>';
  let d;
  try { d = await api('/admin/booking/types?include_archived=true'); }
  catch (e) { return loadError(view, e, () => vBookingTypes(view)); }
  const types = d.types || [];
  view.innerHTML = `${notice ? `<div class="notice">${esc(notice)}</div>` : ''}
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px"><p class="muted" style="margin:0">Aktívne typy si zákazníci rezervujú na stránke Konzultácie → Vybrať termín.</p><button class="btn gold" id="bt-new">Nový typ konzultácie</button></div>
    <div class="rc-grid">${types.length ? types.map(t => `<button class="rc" data-id="${esc(t.id)}"><div class="rc-body"><div class="rc-title">${esc(t.title)}</div><div class="rc-fields">
      <span class="rc-f"><em>Cena</em>${fmtEur(t.price_eur)}</span><span class="rc-f"><em>Dĺžka</em>${t.duration_minutes} min${t.buffer_minutes ? ` + ${t.buffer_minutes} min pauza` : ''}</span>
      <span class="rc-f"><em>Forma</em>${esc(BT_FORM[t.form] || t.form)}</span>
      <span class="rc-f"><em>Stav</em>${t.archived ? '<span class="pill off">archivovaný</span>' : t.active ? '<span class="pill ok">v ponuke</span>' : '<span class="pill warn">skrytý</span>'}</span></div></div></button>`).join('') : '<div class="empty">Zatiaľ žiadny typ konzultácie. Vytvorte prvý, aby si zákazníci mohli rezervovať termín.</div>'}</div>`;
  view.querySelector('#bt-new').onclick = () => vBookingTypeForm(view, null);
  view.querySelectorAll('.rc[data-id]').forEach(el => el.onclick = () => vBookingTypeForm(view, types.find(t => t.id === el.dataset.id)));
}
function vBookingTypeForm(view, t) {
  view = freshView(view);
  const isNew = !t;
  t = t || { title: '', description: '', price_eur: '', duration_minutes: 60, buffer_minutes: 15, form: 'online', active: true, archived: false };
  view.innerHTML = `<div class="card"><div class="card-h">${isNew ? 'Nový typ konzultácie' : esc(t.title)}<button class="btn ghost" id="bt-back">Späť</button></div><div class="card-b">
    <div id="btmsg"></div>
    <form id="bt-form">
      <label>Názov</label><input id="bt-title" maxlength="120" required value="${esc(t.title)}">
      <label style="margin-top:12px">Popis (voliteľné)</label><textarea id="bt-desc" rows="3" maxlength="2000">${esc(t.description)}</textarea>
      <div class="row" style="margin-top:12px">
        <div><label>Cena (EUR s DPH)</label><input id="bt-price" type="number" step="0.01" min="0" required value="${esc(t.price_eur ?? '')}"></div>
        <div><label>Forma</label><select id="bt-formsel"><option value="online" ${t.form === 'online' ? 'selected' : ''}>online</option><option value="in_person" ${t.form === 'in_person' ? 'selected' : ''}>osobne</option></select></div>
      </div>
      <div class="row" style="margin-top:12px">
        <div><label>Dĺžka (minúty)</label><input id="bt-dur" type="number" step="5" min="15" max="480" required value="${esc(t.duration_minutes)}"></div>
        <div><label>Pauza po konzultácii (minúty)</label><input id="bt-buf" type="number" step="5" min="0" max="240" required value="${esc(t.buffer_minutes)}"></div>
      </div>
      ${t.archived ? '' : `<label style="margin-top:12px;display:flex;gap:8px;align-items:center"><input type="checkbox" id="bt-active" style="width:auto" ${t.active ? 'checked' : ''}> V ponuke na webe</label>`}
      <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn gold" type="submit">${isNew ? 'Vytvoriť' : 'Uložiť'}</button>
        ${isNew ? '' : `<button class="btn ghost" type="button" id="bt-arch">${t.archived ? 'Obnoviť z archívu' : 'Archivovať'}</button>`}</div>
      ${isNew ? '' : '<p class="muted" style="font-size:12px;margin-top:8px">Zmena ceny platí pre nové rezervácie. Archivovaný typ zmizne z webu; existujúce termíny ostávajú platné.</p>'}
    </form>
  </div></div>`;
  const back = (n) => vBookingTypes(view, n);
  view.querySelector('#bt-back').onclick = () => back();
  const msg = view.querySelector('#btmsg');
  const fail = (btn, e) => { if (e.message === '401') return; btn.disabled = false; msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; };
  view.querySelector('#bt-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]'), v = id => view.querySelector(id).value.trim();
    const body = { title: v('#bt-title'), description: v('#bt-desc'), price_eur: Math.round(Number(v('#bt-price')) * 100) / 100,
      duration_minutes: Number(v('#bt-dur')), buffer_minutes: Number(v('#bt-buf')), form: v('#bt-formsel') };
    const act = view.querySelector('#bt-active'); if (act) body.active = act.checked; else if (isNew) body.active = true;
    if (body.title.length < 2) { msg.innerHTML = '<div class="err">Názov musí mať aspoň 2 znaky.</div>'; return; }
    if (!(body.price_eur >= 0) || v('#bt-price') === '') { msg.innerHTML = '<div class="err">Zadajte cenu v eurách.</div>'; return; }
    if (!Number.isInteger(body.duration_minutes) || body.duration_minutes < 15 || body.duration_minutes > 480 || body.duration_minutes % 5) { msg.innerHTML = '<div class="err">Dĺžka musí byť 15 až 480 minút, v násobkoch 5.</div>'; return; }
    if (!Number.isInteger(body.buffer_minutes) || body.buffer_minutes < 0 || body.buffer_minutes > 240) { msg.innerHTML = '<div class="err">Pauza musí byť 0 až 240 minút.</div>'; return; }
    msg.innerHTML = ''; btn.disabled = true;
    try {
      await api(isNew ? '/admin/booking/types' : `/admin/booking/types/${encodeURIComponent(t.id)}`, { method: 'POST', body });
      back(isNew ? 'Typ konzultácie je vytvorený. Nastavte ešte dostupnosť, aby sa na webe zobrazili termíny.' : 'Zmeny sú uložené.');
    } catch (err) { fail(btn, err); }
  };
  const ab = view.querySelector('#bt-arch');
  if (ab) ab.onclick = async () => {
    if (!t.archived && !confirm('Archivovať tento typ? Zmizne z webu, existujúce rezervácie ostanú platné.')) return;
    ab.disabled = true;
    try { await api(`/admin/booking/types/${encodeURIComponent(t.id)}`, { method: 'POST', body: t.archived ? { archived: false, active: true } : { archived: true } }); back(t.archived ? 'Typ je obnovený a znova v ponuke.' : 'Typ je archivovaný.'); }
    catch (err) { fail(ab, err); }
  };
}

// --- Dostupnosť (/admin/booking/availability) — časové úseky týždňa (po–ne), z ktorých web ponúka termíny ---
const AV_TZ = 'Europe/Bratislava';
const avYmd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: AV_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const avAdd = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const avMonday = (day) => { const wd = new Date(`${day}T12:00:00Z`).getUTCDay(); return avAdd(day, -((wd + 6) % 7)); };
const avDay = (day, o) => new Intl.DateTimeFormat('sk-SK', { timeZone: 'UTC', ...o }).format(new Date(`${day}T12:00:00Z`));
const avTime = (iso) => new Intl.DateTimeFormat('sk-SK', { timeZone: AV_TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
async function vAvailability(view, st = {}) {
  view = freshView(view);
  const week = st.week || avMonday(avYmd(new Date()));
  view.innerHTML = '<div class="muted">Načítavam dostupnosť…</div>';
  let d;
  try { d = await api(`/admin/booking/availability?week_start=${week}`); }
  catch (e) { return loadError(view, e, () => vAvailability(view, st)); }
  const days = (st.draft || d.days).map(x => ({ date: x.date, ranges: x.ranges.map(r => ({ ...r })) }));
  const bookings = (d.bookings || []).filter(b => b.status === 'held' || b.status === 'confirmed');
  const past = avAdd(week, 6) < avYmd(new Date());
  const rangeHtml = (di, r, ri) => `<div class="availability-range" data-r="${di}:${ri}"><input type="time" step="900" value="${esc(r.start_time)}" data-f="start_time" aria-label="Od"><span aria-hidden="true">–</span><input type="time" step="900" value="${esc(r.end_time)}" data-f="end_time" aria-label="Do"><button type="button" class="btn ghost" data-del="${di}:${ri}" aria-label="Odstrániť úsek">×</button></div>`;
  view.innerHTML = `${st.notice ? `<div class="notice">${esc(st.notice)}</div>` : ''}<div id="avmsg"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="btn ghost" id="av-prev">← Predchádzajúci</button><strong>${esc(avDay(week, { day: 'numeric', month: 'numeric' }))} – ${esc(avDay(avAdd(week, 6), { day: 'numeric', month: 'numeric', year: 'numeric' }))}</strong><button class="btn ghost" id="av-next">Nasledujúci →</button></div>
      <button class="btn ghost" id="av-copy">Prevziať z predchádzajúceho týždňa</button>
    </div>
    <p class="muted">Zadajte, kedy máte čas na konzultácie (čas Bratislava). Web z toho ponúkne termíny podľa dĺžky a pauzy každého typu. Deň bez úseku = zatvorené.</p>
    <div class="rc-grid availability-week">${days.map((x, di) => {
      const bk = bookings.filter(b => avYmd(new Date(b.starts_at)) === x.date);
      return `<div class="rc" style="cursor:default"><div class="rc-body"><div class="rc-title" style="text-transform:none">${esc(avDay(x.date, { weekday: 'long', day: 'numeric', month: 'numeric' }))}</div>
        <div class="availability-slots">${x.ranges.map((r, ri) => rangeHtml(di, r, ri)).join('') || '<span class="muted">Zatvorené</span>'}</div>
        <button type="button" class="btn ghost" data-add="${di}">+ Pridať úsek</button>
        ${bk.length ? `<div class="availability-bookings">${bk.map(b => `<div class="muted" style="font-size:12px">${esc(avTime(b.starts_at))}–${esc(avTime(b.ends_at))} · ${esc(b.customer?.name || '')} · ${esc(b.product?.title || '')} ${statusPill(B_STATUS, b.status)}</div>`).join('')}</div>` : ''}
      </div></div>`;
    }).join('')}</div>
    <div style="margin-top:16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="btn gold" id="av-save" ${past ? 'disabled' : ''}>Uložiť týždeň</button>${past ? '<span class="muted">Minulý týždeň sa už nemení.</span>' : ''}</div>`;
  const collect = () => days.map((x, di) => ({ date: x.date, ranges: x.ranges.map((_, ri) => {
    const row = view.querySelector(`[data-r="${di}:${ri}"]`);
    return { start_time: row.querySelector('[data-f=start_time]').value, end_time: row.querySelector('[data-f=end_time]').value };
  }) }));
  const redraw = (draft, notice) => vAvailability(view, { week, draft, notice });
  view.querySelector('#av-prev').onclick = () => vAvailability(view, { week: avAdd(week, -7) });
  view.querySelector('#av-next').onclick = () => vAvailability(view, { week: avAdd(week, 7) });
  view.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { const c = collect(), r = c[+b.dataset.add].ranges, last = r.at(-1); r.push(last ? { start_time: last.end_time, end_time: last.end_time < '20:00' ? `${String(Math.min(23, +last.end_time.slice(0, 2) + 2)).padStart(2, '0')}:00` : '23:00' } : { start_time: '09:00', end_time: '12:00' }); redraw(c); });
  view.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { const [di, ri] = b.dataset.del.split(':').map(Number), c = collect(); c[di].ranges.splice(ri, 1); redraw(c); });
  view.querySelector('#av-copy').onclick = async () => {
    const btn = view.querySelector('#av-copy'); btn.disabled = true;
    try { const p = await api(`/admin/booking/availability?week_start=${avAdd(week, -7)}`); redraw(days.map((x, i) => ({ date: x.date, ranges: p.days[i]?.ranges || [] })), 'Úseky sú prevzaté. Skontrolujte ich a uložte.'); }
    catch (e) { if (e.message === '401') return; btn.disabled = false; view.querySelector('#avmsg').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
  view.querySelector('#av-save').onclick = async () => {
    const btn = view.querySelector('#av-save'), msg = view.querySelector('#avmsg'), body = { week_start: week, days: collect() };
    const bad = body.days.find(x => x.ranges.some(r => !r.start_time || !r.end_time || r.start_time >= r.end_time));
    if (bad) { msg.innerHTML = `<div class="err">${esc(avDay(bad.date, { weekday: 'long', day: 'numeric', month: 'numeric' }))}: začiatok úseku musí byť pred koncom.</div>`; return; }
    msg.innerHTML = ''; btn.disabled = true;
    try { await api('/admin/booking/availability', { method: 'POST', body }); vAvailability(view, { week, notice: 'Dostupnosť je uložená. Termíny na webe sa hneď aktualizovali.' }); }
    catch (e) {
      if (e.message === '401') return; btn.disabled = false;
      msg.innerHTML = `<div class="err">${/rezervac/i.test(e.message) ? 'Úsek nejde odobrať ani skrátiť, lebo do neho zasahuje rezervácia. Najprv ju zrušte v záložke Rezervácie.' : esc(e.message)}</div>`;
    }
  };
}
const vKonzultacieMenu = (view) => subnav(view, [{ label: 'Rezervácie', run: vKonzultacie }, { label: 'Typy konzultácií', run: vBookingTypes }, { label: 'Dostupnosť', run: vAvailability }]);

// --- Správy (/admin/chat/*) — odpoveď odíde zákazníkovi aj e-mailom ---
const C_TABS = [{ id: 'open', label: 'Otvorené' }, { id: 'closed', label: 'Uzavreté' }, { id: 'all', label: 'Všetky' }];
const vSpravyMenu = (view) => subnav(view, [
  { label: 'Konverzácie', run: vSpravy },
  { label: 'Šablóny odpovedí', run: vChatTemplates },
]);
async function vSpravy(view, st = {}) {
  view = freshView(view);
  const status = st.status || 'open', offset = Math.max(0, st.offset | 0);
  const go = (patch) => vSpravy(view, { status, offset, ...patch });
  view.innerHTML = '<div class="muted">Načítavam správy…</div>';
  let d;
  try { d = await api(`/admin/chat/conversations?status=${status}&limit=${PAGE_LIMIT}&offset=${offset}`); }
  catch (e) { return loadError(view, e, () => go({})); }
  const items = d.conversations || [];
  view.innerHTML = (d.unread ? `<div class="notice">Neprečítané konverzácie: ${d.unread}</div>` : '') + pagedHtml({ tabs: C_TABS, active: status, items, count: d.count || 0, offset, empty: 'Žiadne konverzácie.',
    card: c => `<div class="rc-body"><div class="rc-title">${c.unread ? '● ' : ''}${esc(c.customer?.name || c.customer?.email || 'Zákazník')}</div><div class="rc-fields">
      <span class="rc-f"><em>Téma</em>${esc(c.subject || '—')}</span><span class="rc-f"><em>Posledná správa</em>${fmtDate(c.last_message_at)}</span>
      <span class="rc-f">${c.unread ? '<span class="pill warn">neprečítaná</span>' : ''}${c.status === 'closed' ? '<span class="pill off">uzavretá</span>' : ''}${c.muted ? ' <span class="pill off">stlmená</span>' : ''}${c.customer?.chat_blocked ? ' <span class="pill off">chat zablokovaný</span>' : ''}</span></div></div>` });
  wirePaged(view, { items, offset, go, open: c => vConversation(view, c.id, () => go({})) });
}
// --- Správy → Šablóny odpovedí: opakovane používané texty ---
async function vChatTemplates(view) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam šablóny…</div>';
  let templates = [];
  try { templates = (await api('/admin/chat/templates')).templates || []; }
  catch (e) { if (e.message === '401') throw e; view.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
  view.innerHTML = `<div class="card" style="margin-bottom:16px"><div class="card-h">Nová šablóna</div><div class="card-b">
    <div id="ct-msg"></div>
    <label for="ct-title">Názov</label><input id="ct-title" maxlength="60" placeholder="napr. Doručenie zásielky">
    <label for="ct-text" style="margin-top:10px">Text odpovede</label><textarea id="ct-text" rows="4" maxlength="1000" placeholder="Text, ktorý pošlete zákazníkovi."></textarea>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn gold" id="ct-save">Uložiť šablónu</button><button class="btn ghost" id="ct-reset" hidden>Zrušiť úpravu</button></div>
  </div></div>
  <div class="card"><div class="card-h">Uložené šablóny <span class="muted">(${templates.length})</span></div><div class="card-b">
    ${templates.length ? `<div class="rc-grid">${templates.map(t => `<div class="rc"><div class="rc-body">
        <div class="rc-title">${esc(t.title)}</div>
        <div class="rc-fields"><span class="rc-f"><em>Text</em><span style="white-space:pre-wrap">${esc(t.text)}</span></span>
        ${t.updated_at ? `<span class="rc-f"><em>Zmenené</em>${fmtDate(t.updated_at)}</span>` : ''}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          <button type="button" class="btn ghost sm" data-edit="${esc(t.id)}">Upraviť</button>
          <button type="button" class="btn ghost sm danger" data-del="${esc(t.id)}" data-name="${esc(t.title)}">Zmazať</button>
        </div></div></div>`).join('')}</div>`
      : '<div class="empty">Zatiaľ nemáte uložené žiadne šablóny. Vložte najčastejšie odpovede – v chate ich vložíte jedným kliknutím.</div>'}
  </div></div>`;
  const msg = view.querySelector('#ct-msg');
  const title = view.querySelector('#ct-title'), text = view.querySelector('#ct-text');
  let editing = null;
  view.querySelector('#ct-save').onclick = async () => {
    const body = { title: title.value.trim(), text: text.value.trim() };
    if (editing) body.id = editing;
    msg.innerHTML = ''; view.querySelector('#ct-save').disabled = true;
    try {
      await api('/admin/chat/templates', { method: 'POST', body });
      await vChatTemplates(view);
    } catch (e) {
      if (e.message !== '401') msg.innerHTML = `<div class="err">${esc(e.message)}</div>`;
      view.querySelector('#ct-save').disabled = false;
    }
  };
  view.querySelector('#ct-reset').onclick = () => { editing = null; title.value = ''; text.value = ''; view.querySelector('#ct-reset').hidden = true; };
  view.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
    const t = templates.find(x => x.id === b.dataset.edit);
    if (!t) return;
    editing = t.id; title.value = t.title; text.value = t.text;
    view.querySelector('#ct-reset').hidden = false;
    view.querySelector('#ct-save').textContent = 'Uložiť zmenu';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    title.focus();
  });
  view.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm(`Naozaj zmazať šablónu „${b.dataset.name}“?`)) return;
    b.disabled = true;
    try { await api(`/admin/chat/templates/${encodeURIComponent(b.dataset.del)}`, { method: 'DELETE' }); await vChatTemplates(view); }
    catch (e) { if (e.message !== '401') msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; b.disabled = false; }
  });
}
async function vConversation(view, id, back, notice) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam konverzáciu…</div>';
  let d;
  try { d = await api(`/admin/chat/conversations/${encodeURIComponent(id)}`); }
  catch (e) { return loadError(view, e, () => vConversation(view, id, back)); }
  const c = d.conversation, cu = c.customer || {};
  if (c.unread) api(`/admin/chat/conversations/${encodeURIComponent(id)}/read`, { method: 'POST', body: {} }).catch(() => {});
  view.innerHTML = `<div class="card"><div class="card-h">${esc(cu.name || cu.email || 'Zákazník')}${c.subject ? ' · ' + esc(c.subject) : ''}<button class="btn ghost" id="c-back">Späť</button></div><div class="card-b">
    <div id="cmsg">${notice ? `<div class="notice">${esc(notice)}</div>` : ''}</div>
    <p class="muted">${esc(cu.email || '')}${c.order_id ? ' · objednávka ' + esc(c.order_id) : ''}${c.booking_id ? ' · konzultácia ' + esc(c.booking_id) : ''}</p>
    <div style="display:flex;flex-direction:column;gap:10px;max-height:420px;overflow:auto;padding:4px 0" id="c-thread">
      ${(d.messages || []).map(m => `<div style="max-width:80%;align-self:${m.author === 'lucia' ? 'flex-end' : 'flex-start'};background:${m.author === 'lucia' ? 'var(--soft)' : '#fff'};border:1px solid var(--line);border-radius:12px;padding:10px 12px">
        <div style="white-space:pre-wrap">${esc(m.body)}</div><div class="muted" style="font-size:11px;margin-top:4px">${m.author === 'lucia' ? 'Vy' : 'Zákazník'} · ${fmtDate(m.created_at)}</div></div>`).join('') || '<div class="empty">Zatiaľ bez správ.</div>'}
    </div>
    ${cu.chat_blocked ? '<p class="muted">Zákazník má chat zablokovaný — nemôže písať nové správy.</p>' : ''}
    <form id="c-reply" style="margin-top:12px"><label>Odpoveď <button type="button" class="subtle-link" id="c-tpl">vložiť šablónu</button></label><textarea id="c-body" rows="4" maxlength="5000" required></textarea>
      <div style="margin-top:8px"><button class="btn gold" type="submit">Odoslať</button> <span class="muted" style="font-size:12px">Zákazníkovi príde aj e-mail.</span></div></form>
    <div id="c-tpl-list" hidden style="margin-top:10px;border:1px solid var(--line);border-radius:10px;padding:10px;background:#fafbf7"></div>
    <div style="margin-top:18px;border-top:1px solid var(--line);padding-top:14px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn ghost" data-act="${c.status === 'closed' ? 'reopen' : 'close'}">${c.status === 'closed' ? 'Znovu otvoriť' : 'Uzavrieť konverzáciu'}</button>
      <button class="btn ghost" data-act="${c.muted ? 'unmute' : 'mute'}">${c.muted ? 'Zrušiť stlmenie' : 'Stlmiť upozornenia'}</button>
      <button class="btn ghost" id="c-block">${cu.chat_blocked ? 'Odblokovať chat zákazníka' : 'Zablokovať chat zákazníka'}</button>
    </div>
  </div></div>`;
  const th = view.querySelector('#c-thread'); th.scrollTop = th.scrollHeight;
  view.querySelector('#c-back').onclick = back;
  // Šablóny odpovedí: kliknutie vloží text do odpovede.
  const tplBox = view.querySelector('#c-tpl-list');
  view.querySelector('#c-tpl').onclick = async () => {
    if (!tplBox.hidden) { tplBox.hidden = true; return; }
    tplBox.hidden = false;
    tplBox.innerHTML = '<div class="muted">Načítavam šablóny…</div>';
    let templates = [];
    try { templates = (await api('/admin/chat/templates')).templates || []; }
    catch (e) { tplBox.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
    tplBox.innerHTML = templates.length
      ? `<div style="display:flex;flex-direction:column;gap:6px">${templates.map(t => `<button type="button" class="btn ghost sm" data-tpl="${esc(t.id)}" style="justify-content:flex-start;text-align:left">${esc(t.title)}</button>`).join('')}</div>`
      : '<div class="muted">Zatiaľ nemáte uložené žiadne šablóny. Vytvoríte ich v časti Správy → Šablóny odpovedí.</div>';
    tplBox.querySelectorAll('[data-tpl]').forEach(b => b.onclick = () => {
      const t = templates.find(x => x.id === b.dataset.tpl);
      if (!t) return;
      const area = view.querySelector('#c-body');
      area.value = area.value ? `${area.value}\n${t.text}` : t.text;
      area.focus(); tplBox.hidden = true;
    });
  };
  const fail = (btn, e) => { if (e.message === '401') return; btn.disabled = false; view.querySelector('#cmsg').innerHTML = `<div class="err">${esc(e.message)}</div>`; };
  view.querySelector('#c-reply').onsubmit = async (e) => {
    e.preventDefault(); const btn = e.target.querySelector('button'), body = view.querySelector('#c-body').value.trim();
    if (!body) return; btn.disabled = true;
    try { await api(`/admin/chat/conversations/${encodeURIComponent(id)}/messages`, { method: 'POST', body: { body } }); await vConversation(view, id, back, 'Odpoveď je odoslaná.'); }
    catch (err) { fail(btn, err); }
  };
  const ACT = { close: 'Konverzácia je uzavretá.', reopen: 'Konverzácia je znovu otvorená.', mute: 'Upozornenia sú stlmené.', unmute: 'Upozornenia sú zapnuté.' };
  view.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { await api(`/admin/chat/conversations/${encodeURIComponent(id)}`, { method: 'POST', body: { action: b.dataset.act } }); await vConversation(view, id, back, ACT[b.dataset.act]); }
    catch (err) { fail(b, err); }
  });
  const bb = view.querySelector('#c-block');
  bb.onclick = async () => {
    const blocked = !cu.chat_blocked;
    if (!confirm(blocked ? 'Zablokovať zákazníkovi písanie do chatu? Dá sa to kedykoľvek vrátiť.' : 'Odblokovať zákazníkovi chat?')) return;
    bb.disabled = true;
    try { await api(`/admin/chat/customers/${encodeURIComponent(cu.id)}/block`, { method: 'POST', body: { blocked } }); await vConversation(view, id, back, blocked ? 'Chat zákazníci je zablokovaný.' : 'Chat zákazníci je odblokovaný.'); }
    catch (err) { fail(bb, err); }
  };
}
async function vEmaily(view) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam…</div>';
  const { templates } = await api('/admin/email-templates');
  listView(view, {
    title: 'E-mailové šablóny', rows: (templates || []).map(t => ({ ...t, id: t.name })), onRow: t => vEmailDetail(view, t),
    empty: 'Žiadne šablóny.', card: t => `<div class="rc-body"><div class="rc-title">${esc(t.label || t.name)}</div>
      <div class="rc-fields"><span class="rc-f"><em>Komu</em>${esc({ customer: 'zákazníkovi', admin: 'vám (obchodu)' }[t.audience] || t.audience || '—')}</span>
      <span class="rc-f"><em>Stav</em><span class="pill ${t.enabled ? 'ok' : 'off'}">${t.enabled ? 'zapnutá' : 'vypnutá'}</span>${t.customized ? '<span class="pill warn">upravená</span>' : ''}</span></div></div>`,
  });
}
// Úprava e-mailu: vľavo texty (predmet, nadpis, odseky) so zástupnými poľami, vpravo živý náhľad.
// Server overí texty (dĺžka, povolené {polia}); obsah e-mailu sa skladá na serveri, admin posiela len texty.
async function vEmailDetail(view, t) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam…</div>';
  let tpl;
  try { tpl = (await api(`/admin/email-templates/${t.name}`)).template; } catch (e) { view.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
  const slots = tpl.slots || [], ph = tpl.placeholders || [];
  const field = (sl) => `<div class="em-field"><label for="em-${esc(sl.key)}">${esc(sl.label)}${sl.optional ? ' <span class="muted">(nepovinné)</span>' : ''}</label>
    ${sl.kind === 'line' ? `<input id="em-${esc(sl.key)}" data-slot="${esc(sl.key)}" value="${esc(sl.value ?? '')}" maxlength="200">` : `<textarea id="em-${esc(sl.key)}" data-slot="${esc(sl.key)}" rows="3">${esc(sl.value ?? '')}</textarea>`}
    ${sl.value !== sl.default ? `<button type="button" class="subtle-link em-reset1" data-slot="${esc(sl.key)}">Vrátiť pôvodný text</button>` : ''}</div>`;
  view.innerHTML = `<div class="card"><div class="card-h">${esc(tpl.label || t.label || t.name)}<div class="card-h-act"><button class="btn ghost" id="e-back">Späť</button><button class="btn gold" id="e-save">Uložiť e-mail</button></div></div><div class="card-b">
    <div id="emsg"></div>
    <p class="muted" style="margin-top:0">${esc(tpl.description || '')}</p>
    <div class="em-grid"><div>
      ${tpl.required ? '<p class="pill warn">Tento e-mail odchádza vždy, nedá sa vypnúť.</p>' : `<label class="em-toggle"><input type="checkbox" id="e-enabled"${t.enabled !== false ? ' checked' : ''}> E-mail je zapnutý (odchádza zákazníkom)</label>`}
      ${ph.length ? `<div class="em-ph"><span class="muted">Vložiť údaj do textu:</span> ${ph.map(x => `<button type="button" class="em-chip" data-ph="${esc(x.key)}" title="Vloží {${esc(x.key)}}">${esc(x.label)}</button>`).join('')}</div>` : ''}
      ${slots.map(field).join('')}
      <div class="em-foot"><button type="button" class="btn ghost" id="e-reset">Obnoviť všetky pôvodné texty</button></div>
    </div><div class="em-preview"><div class="em-subj"><span class="muted">Predmet:</span> <b id="e-subj"></b></div><iframe title="Náhľad e-mailu" sandbox></iframe><p class="muted" style="font-size:12px">Náhľad používa ukážkové údaje (číslo objednávky, meno, suma).</p></div></div>
  </div></div>`;
  let last = null;
  const texts = () => Object.fromEntries([...view.querySelectorAll('[data-slot]')].filter(el => el.matches('input,textarea')).map(el => [el.dataset.slot, el.value]));
  const preview = async () => {
    const body = { texts: texts() };
    try { const r = await api(`/admin/email-templates/${t.name}/preview`, { method: 'POST', body }); const pv = r.preview || r;
      view.querySelector('#e-subj').textContent = pv.subject || ''; view.querySelector('iframe').srcdoc = pv.html || ''; view.querySelector('#emsg').innerHTML = ''; }
    catch (e) { view.querySelector('#emsg').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
  const later = () => { clearTimeout(last); last = setTimeout(preview, 450); };
  view.querySelectorAll('input[data-slot],textarea[data-slot]').forEach(el => { el.addEventListener('input', later); el.addEventListener('focus', () => { view._emFocus = el; }); });
  view.querySelectorAll('.em-chip').forEach(b => b.onmousedown = (e) => {
    e.preventDefault(); const el = view._emFocus || view.querySelector('textarea[data-slot],input[data-slot]'); if (!el) return;
    const ins = `{${b.dataset.ph}}`, a = el.selectionStart ?? el.value.length, z = el.selectionEnd ?? a;
    el.value = el.value.slice(0, a) + ins + el.value.slice(z); el.focus(); el.setSelectionRange(a + ins.length, a + ins.length); later();
  });
  view.querySelectorAll('.em-reset1').forEach(b => b.onclick = () => { const sl = slots.find(x => x.key === b.dataset.slot); const el = view.querySelector(`#em-${CSS.escape(b.dataset.slot)}`); if (sl && el) { el.value = sl.default; later(); } });
  view.querySelector('#e-back').onclick = () => vEmaily(view);
  view.querySelector('#e-reset').onclick = async () => {
    if (!confirm('Obnoviť všetky pôvodné texty tohto e-mailu?')) return;
    try { await api(`/admin/email-templates/${t.name}`, { method: 'DELETE' }); vEmailDetail(view, t); } catch (e) { view.querySelector('#emsg').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
  view.querySelector('#e-save').onclick = async () => {
    const btn = view.querySelector('#e-save'); btn.disabled = true;
    const body = { texts: texts() }; const en = view.querySelector('#e-enabled'); if (en) body.enabled = en.checked;
    try { await api(`/admin/email-templates/${t.name}`, { method: 'POST', body }); view.querySelector('#emsg').innerHTML = '<div class="ok">E-mail je uložený. Ďalšie odoslané e-maily už použijú nové texty.</div>'; }
    catch (e) { view.querySelector('#emsg').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    btn.disabled = false;
  };
  preview();
}
async function vNewsletter(view) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam…</div>';
  const { consents } = await api('/admin/newsletter?limit=200');
  listView(view, {
    title: 'Newsletter — súhlasy', rows: (consents || []).map((c, i) => ({ ...c, id: c.id ?? i })), empty: 'Zatiaľ žiadne prihlásenia.',
    card: c => `<div class="rc-body"><div class="rc-title">${esc(c.email)}</div><div class="rc-fields">
      <span class="rc-f"><em>Stav</em><span class="pill ${c.status === 'subscribed' || c.status === 'active' ? 'ok' : 'off'}">${esc(c.status || '—')}</span></span>
      <span class="rc-f"><em>Zdroj</em>${esc(c.source || '—')}</span></div></div>`,
  });
}
// --- Obsah → Stránky a texty: texty webových stránok editovateľné v rich texte ---
async function vPageTexts(view) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam obsah webu…</div>';
  try {
    view.innerHTML = await contentPages(api, esc);
  } catch (e) {
    if (e.message === '401') throw e;
    view.innerHTML = `<div class="err">${esc(e.message)}</div>`;
    return;
  }
  view.querySelectorAll('[data-page]').forEach(b => b.onclick = () => vContentPage(view, b.dataset.page));
  view.querySelectorAll('[data-extra]').forEach(b => b.onclick = () => vPageTextEdit(view, b.dataset.extra));
}
async function vContentPage(view, key) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam stránku…</div>';
  try {
    view.innerHTML = await contentPage(api, key, esc);
  } catch (e) {
    if (e.message === '401') throw e;
    view.innerHTML = `<div class="err">${esc(e.message)}</div>`;
    return;
  }
  wireContentPage(view, api, key, { reload: () => vContentPage(view, key), back: () => vPageTexts(view) });
}
async function vPageTextEdit(view, slug) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam text…</div>';
  let page = null;
  try { page = ((await api('/admin/pages')).pages || []).find(p => p.slug === slug); }
  catch (e) { if (e.message === '401') throw e; view.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
  if (!page) { view.innerHTML = '<div class="err">Text sa nenašiel.</div>'; return; }
  view.innerHTML = `<div class="card"><div class="card-h">${esc(page.label)}<div class="card-h-act">
      <button type="button" class="btn ghost" id="pt-back">Späť</button>
      <button type="button" class="btn ghost" id="pt-reset" ${page.is_default ? 'disabled' : ''}>Obnoviť pôvodné znenie</button>
      <button type="button" class="btn gold" id="pt-save">Uložiť znenie</button>
    </div></div><div class="card-b">
    <div id="pt-msg"></div>
    <p class="muted" style="margin-top:0">${esc(page.description || '')} Píšte tak, ako by ste chceli text čítať zákazník – bez značiek a kódu.</p>
    <div class="em-grid">
      <div>${wysiwygHtml('pt-editor', page.html)}</div>
      <div class="em-preview"><div class="em-subj"><span class="muted">Náhľad:</span> <b>Takto sa text zobrazí</b></div>
        <iframe id="pt-preview" title="Náhľad textu stránky" sandbox=""></iframe></div>
    </div>
    <p class="muted" style="font-size:12px;margin-top:10px">Znenie sa na webe zobrazí až po uložení. Ak text nie je vložený, zostane pôvodné.</p>
  </div></div>`;
  wireWysiwyg(view);
  const editor = view.querySelector('#pt-editor');
  const preview = view.querySelector('#pt-preview');
  const msg = view.querySelector('#pt-msg');
  const refreshPreview = () => { preview.srcdoc = `<!doctype html><html lang="sk"><head><meta charset="utf-8"><style>body{font:15px/1.6 Georgia,serif;color:#222;padding:18px;max-width:640px}h2{font-size:20px}h3{font-size:17px}p{margin:0 0 12px}</style></head><body>${cleanRichText(editor.innerHTML) || '<p style="color:#888">Zatiaľ prázdne.</p>'}</body></html>`; };
  refreshPreview();
  editor.addEventListener('input', refreshPreview);
  view.querySelector('#pt-back').onclick = () => vPageTexts(view);
  view.querySelector('#pt-save').onclick = async () => {
    const btn = view.querySelector('#pt-save');
    msg.innerHTML = ''; btn.disabled = true;
    try {
      await api('/admin/pages', { method: 'POST', body: { slug, html: cleanRichText(editor.innerHTML) } });
      msg.innerHTML = '<div class="ok">Znenie je uložené. Na webe sa zobrazí podľa adresy stránky.</div>';
      await vPageTextEdit(view, slug);
    } catch (e) {
      if (e.message !== '401') msg.innerHTML = `<div class="err">${esc(e.message)}</div>`;
      btn.disabled = false;
    }
  };
  view.querySelector('#pt-reset').onclick = async () => {
    if (!confirm('Obnoviť pôvodné znenie tejto stránky? Zmena, ktorú ste uložili, sa zahodí.')) return;
    const btn = view.querySelector('#pt-reset');
    msg.innerHTML = ''; btn.disabled = true;
    try {
      await api(`/admin/pages/${encodeURIComponent(slug)}`, { method: 'DELETE' });
      msg.innerHTML = '<div class="ok">Pôvodné znenie je obnovené.</div>';
      await vPageTextEdit(view, slug);
    } catch (e) {
      if (e.message !== '401') msg.innerHTML = `<div class="err">${esc(e.message)}</div>`;
      btn.disabled = false;
    }
  };
}
// --- Obsah → Médiá: knihovna verejných obrázkov ---
async function vMediaLibrary(view) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam knihovnu…</div>';
  let files = [];
  try { files = (await api('/admin/media')).files || []; }
  catch (e) { if (e.message === '401') throw e; view.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
  const kb = (n) => (Number(n) / 1024).toFixed(0) + ' kB';
  view.innerHTML = `<div class="card"><div class="card-h">Knihovna obrázkov</div><div class="card-b">
    <div id="md-msg"></div>
    <p class="muted" style="margin-top:0">Obrázky, ktoré tu nahráte, sa uložia na server a môžete ich použiť na webe aj v e-mailoch.
    Kliknutím na „Kopírovať URL“ skopírujete priamu adresu obrázka.</p>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px">
      <input type="file" id="md-file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple>
      <button type="button" class="btn gold" id="md-upload">Nahrať obrázky</button>
    </div>
    <div class="media-grid" id="md-grid">${files.map(f => `<figure class="media-item">
        <img src="${esc(f.url)}" alt="${esc(f.name)}" loading="lazy">
        <figcaption><b title="${esc(f.name)}">${esc(f.name)}</b><small>${kb(f.size)} · ${fmtDate(f.uploaded_at)}</small>
          <div class="media-act">
            <button type="button" class="btn ghost sm" data-copy="${esc(f.url)}">Kopírovať URL</button>
            <a class="btn ghost sm" href="${esc(f.url)}" target="_blank" rel="noopener">Otvoriť</a>
            <button type="button" class="btn ghost sm danger" data-del="${esc(f.key)}" data-name="${esc(f.name)}">Zmazať</button>
          </div></figcaption></figure>`).join('')}</div>
    ${files.length ? '' : '<div class="empty">Zatiaľ tu nie je žiadny obrázok. Nahrajte prvý obrázok vyššie.</div>'}
  </div></div>`;
  const msg = view.querySelector('#md-msg');
  view.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => {
    const ok = await copyToClipboard(b.dataset.copy, b);
    if (!ok) msg.innerHTML = '<div class="err">Prehliadač nedovolil skopírovať. Adresu skopírujte ručne.</div>';
  });
  view.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const name = b.dataset.name || 'obrázok';
    if (!confirm(`Naozaj zmazať obrázok „${name}“? Súbor sa odstráni zo servera.`)) return;
    msg.innerHTML = ''; b.disabled = true;
    try {
      await api(`/admin/media/${encodeURIComponent(b.dataset.del)}`, { method: 'DELETE' });
      msg.innerHTML = '<div class="ok">Obrázok je zmazaný.</div>';
      await vMediaLibrary(view);
    } catch (e) {
      if (e.message !== '401') msg.innerHTML = `<div class="err">${esc(e.message)}</div>`;
      b.disabled = false;
    }
  });
  const upload = view.querySelector('#md-upload');
  upload.onclick = async () => {
    const input = view.querySelector('#md-file');
    const chosen = [...input.files];
    if (!chosen.length) { msg.innerHTML = '<div class="err">Najprv vyberte obrázok.</div>'; return; }
    const bad = chosen.find(f => !/^image\/(jpeg|png|webp|gif|avif)$/.test(f.type) || f.size > 12 * 1024 * 1024);
    if (bad) { msg.innerHTML = `<div class="err">${esc(bad.name)}: povolené sú obrázky (JPG, PNG, WebP, GIF, AVIF) do 12 MB.</div>`; return; }
    msg.innerHTML = '<div class="muted">Nahrávam…</div>'; upload.disabled = true;
    try {
      const fd = new FormData(); chosen.forEach(f => fd.append('files', f));
      const res = await fetch(API + '/admin/uploads', { method: 'POST', headers: token ? { authorization: 'Bearer ' + token } : {}, body: fd });
      if (res.status === 401) { token = ''; localStorage.removeItem('ana_token'); renderLogin('Prihlásenie vypršalo.'); return; }
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.message || 'Nahratie zlyhalo.');
      const uploaded = (d.files || []).map(f => ({ key: f.key || f.url.split('/').pop(), url: f.url, name: f.name || f.key, size: f.size || 0, content_type: f.content_type || f.mimetype || '' }));
      await api('/admin/media', { method: 'POST', body: { files: uploaded } });
      msg.innerHTML = '<div class="ok">Obrázky sú nahraté.</div>';
      await vMediaLibrary(view);
    } catch (err) {
      msg.innerHTML = `<div class="err">${esc(err.message)}</div>`; upload.disabled = false;
    }
  };
}
// --- Ambasádori: Fáza 2 – pripravujeme (UI nad prázdnymi dátami, backend ešte nemá) ---
const AMBASSADOR_PHASE = 'Fáza 2 – pripravujeme';
const AMBASSADOR_STATUS = { active: ['aktívny', 'ok'], invited: ['pozvaný', 'warn'], paused: ['pozastavený', 'off'], draft: ['rozpracovaný', 'off'] };
const AMBASSADOR_COLUMNS = [['Meno', 'Meno'], ['E-mail', 'E-mail'], ['Kód / odkaz', 'Kód / odkaz'], ['Provize', 'Provize'], ['Obrat', 'Obrat'], ['Stav', 'Stav']];
async function vAmbasadori(view) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam ambasádorov…</div>';
  let list = [];
  try { list = (await api('/admin/ambassadors?limit=100')).ambassadors || []; }
  catch (e) { if (e.message === '401') throw e; list = []; }
  const commission = Number((await api('/admin/ambassadors/settings').catch(() => ({}))).commission_percent ?? 10);
  view.innerHTML = `<div class="card" style="margin-bottom:16px"><div class="card-h">Ambasádori<div class="card-h-act"><span class="pill warn">${esc(AMBASSADOR_PHASE)}</span></div></div><div class="card-b">
    <p class="muted" style="margin-top:0">Ambasadorský režim (odporúčanie zákazníkov za províziu) pripravujeme. Zatiaľ sa na webe nič nezapína a žiadne provízie sa nevyplácajú.
    Návrh dátového modelu je v <code class="rc-code">backend/docs/wp/ambasador-faza2.md</code>.</p>
    ${list.length ? `<div class="ot-wrap"><table class="ot lv"><thead><tr>${AMBASSADOR_COLUMNS.map(([, h]) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>
      ${list.map(a => `<tr data-id="${esc(a.id)}" tabindex="0" role="link">${AMBASSADOR_COLUMNS.map(([key]) => `<td>${esc(a[key] ?? '—')}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">Zatiaľ nemáme žiadnych ambasádorov – režim sa pripravuje.</div>'}
  </div></div>
  <div class="card"><div class="card-h">Nastavenie provízie</div><div class="card-b">
    <p class="muted" style="margin-top:0">Provízia sa počíta z výšky objednávky, ktorú ambasADOR priviedol, a vypláca sa mu podľa dohodnutého cyklu. Percento ani výplaty sa zatiaľ nemenia.</p>
    <div class="row"><div><label>Provizia (%)</label><input id="am-commission" type="number" min="0" max="100" step="1" value="${esc(String(commission))}" disabled></div>
    <div><label>Stav režimu</label><div><span class="pill warn">${esc(AMBASSADOR_PHASE)}</span></div></div></div>
    <p class="muted" style="font-size:12px;margin-top:10px">Ovládanie bude aktívne, keď backend dodá atribúcie objednávok a prevádzku provízie.</p>
  </div></div>`;
  view.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => vAmbasadorDetail(view, { id: tr.dataset.id, ...(list.find(x => x.id === tr.dataset.id) || {}) }));
}
function vAmbasadorDetail(view, a) {
  view = freshView(view);
  view.innerHTML = `<div class="card"><div class="card-h">AmbasADOR<div class="card-h-act"><span class="pill warn">${esc(AMBASSADOR_PHASE)}</span><button class="btn ghost" id="am-back">Späť</button></div></div><div class="card-b">
    <div class="row"><div><label>Meno</label><div>${esc(a.name || a.customer_label || '—')}</div></div><div><label>E-mail</label><div>${esc(a.email || '—')}</div></div></div>
    <div class="row"><div><label>Kód / odkaz</label><div>${esc(a.code || a.referral_code || '—')}</div></div><div><label>Provize</label><div>${esc(String(a.commission_percent ?? '—'))} %</div></div></div>
    <div class="row"><div><label>Obrat</label><div>${esc(a.revenue != null ? fmtEur(a.revenue) : '—')}</div></div><div><label>Stav</label><div>${statusPill(AMBASSADOR_STATUS, a.status || 'draft')}</div></div></div>
    <p class="muted" style="font-size:12px;margin-top:12px">Detail ambasadora bude obsahovať odkaz na odporúčanie, zoznam privedených objednávok a prehľad výplat.</p>
  </div></div>`;
  view.querySelector('#am-back').onclick = () => vAmbasadori(view);
}
const vObsah = (view) => subnav(view, [
  { label: 'E-maily', run: vEmaily },
  { label: 'Newsletter', run: vNewsletter },
  { label: 'Stránky a texty', run: vPageTexts },
  { label: 'Médiá', run: vMediaLibrary },
  { label: 'Preklady', run: (v) => stub(v, 'Preklady', `Anglickú a ruskú verziu webu pripravujeme my. Texty píšete po slovensky a preklad vám dodáme na schválenie. Pri zmene textu nám napíšte na ${SUPPORT_EMAIL}.`) },
]);
// --- Doprava a platby: prehľad z jadra len na čítanie (žiadne kľúče, žiadne tajomstvá) ---
const PROVIDER_LABEL = { pp_system_default: 'Manuálna platba (bez brány)', pp_cod_cod: 'Na dobierku (+2 €)', pp_bank_transfer_bank_transfer: 'Prevodom na účet', pp_stripe_stripe: 'Platobná karta (Stripe)', pp_membership_stripe_membership: 'Platobná karta – Klub', manual_manual: 'Vlastná doprava' };
const provLabel = (id) => PROVIDER_LABEL[id] || id || '—';
async function vDopravaPlatby(view) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam dopravu a platby…</div>';
  const soft = (e) => { if (e.message === '401') throw e; return null; };
  const [rg, so, sl] = await Promise.all([
    api('/admin/regions?limit=50&fields=id,name,currency_code,automatic_taxes,*countries,*payment_providers').catch(soft),
    api('/admin/shipping-options?limit=100&fields=id,name,price_type,provider_id,*prices,*prices.price_rules,*service_zone,*type,*rules').catch(soft),
    api('/admin/stock-locations?limit=50&fields=id,name,*address').catch(soft),
  ]);
  const blk = (title, body) => `<div class="card" style="margin-bottom:16px"><div class="card-h">${esc(title)}</div><div class="card-b">${body}</div></div>`;
  const unread = '<div class="err">Údaje sa teraz nedajú načítať. Skúste obnoviť stránku.</div>';
  const regions = rg?.regions || [], options = so?.shipping_options || [], locs = sl?.stock_locations || [];
  const regionsHtml = !rg ? unread : `<div class="rc-grid">${regions.map(r => `<div class="rc"><div class="rc-body"><div class="rc-title">${esc(r.name)}</div><div class="rc-fields">
      <span class="rc-f"><em>Mena</em>${esc((r.currency_code || '').toUpperCase())}</span>
      <span class="rc-f"><em>Krajiny</em>${esc((r.countries || []).map(c => (c.iso_2 || '').toUpperCase()).join(', ') || '—')}</span>
      <span class="rc-f"><em>Platby</em>${(r.payment_providers || []).map(pp => `<span class="pill ${pp.is_enabled === false ? 'off' : 'ok'}">${esc(provLabel(pp.id))}</span>`).join(' ') || '<span class="pill off">žiadna platobná metóda</span>'}</span></div></div></div>`).join('') || '<div class="empty">Žiadny predajný región. Bez neho sa nedá nakupovať.</div>'}</div>`;
  const eurPrice = (o) => (o.prices || []).find(x => x.currency_code === 'eur' && !(x.price_rules?.length || x.rules_count > 0));
  const regionName = (id) => regions.find(r => r.id === id)?.name || String(id || '—');
  // Cenové hladiny: každá cena s vlastným pravidlom (región) – takto vidno, kde koľko stojí.
  const levelsOf = (o) => (o.prices || []).map(p => {
    const rule = (p.price_rules || [])[0];
    const where = rule?.attribute === 'region_id' ? regionName(rule.value) : 'všeobecná cena';
    return { amount: Number(p.amount) || 0, where, currency: p.currency_code };
  }).filter(l => l.currency === 'eur');
  const optionsHtml = !so ? unread : `<div class="rc-grid">${options.map(o => { const pr = eurPrice(o), ret = (o.rules || []).some(x => x.attribute === 'is_return' && String(x.value) === 'true');
    const levels = levelsOf(o);
    return `<div class="rc"><div class="rc-body"><div class="rc-title">${esc(o.name)}</div><div class="rc-fields">
      <span class="rc-f"><em>Cena</em>${o.price_type === 'calculated' ? 'počíta dopravca' : pr ? (Number(pr.amount) === 0 ? 'zadarmo' : fmtEur(pr.amount)) : '<span class="pill warn">bez ceny v EUR</span>'}</span>
      ${levels.length > 1 ? `<span class="rc-f"><em>Cenové hladiny</em>${levels.map(l => `${esc(l.where)}: ${fmtEur(l.amount)}`).join(' · ')}</span>` : ''}
      <span class="rc-f"><em>Dopravca</em>${esc(provLabel(o.provider_id))}</span>
      <span class="rc-f"><em>Oblasť</em>${esc(o.service_zone?.name || '—')}</span>
      ${ret ? '<span class="pill off">len pre vrátenie</span>' : ''}</div></div></div>`; }).join('') || '<div class="empty">Žiadny spôsob dopravy. Fyzický tovar sa nedá odoslať.</div>'}</div>`;
  const locsHtml = !sl ? unread : `<div class="rc-grid">${locs.map(l => `<div class="rc"><div class="rc-body"><div class="rc-title">${esc(l.name)}</div><div class="rc-fields">
      <span class="rc-f"><em>Adresa</em>${esc([l.address?.address_1, l.address?.city, (l.address?.country_code || '').toUpperCase()].filter(Boolean).join(', ') || '—')}</span></div></div></div>`).join('') || '<div class="empty">Žiadny sklad.</div>'}</div>`;
  view.innerHTML = blk('Predajné regióny a platby', regionsHtml) + blk('Spôsoby dopravy', optionsHtml) + blk('Sklady', locsHtml)
    + `<p class="muted" style="font-size:12px">Prehľad je len na čítanie. Platobné brány a dopravcov s prístupovými kľúčmi zapája náš tím bezpečne na serveri — kľúče sa v administrácii nikdy nezobrazujú. Ak potrebujete zmenu, napíšte na <a href="mailto:podpora@l-code-dynamics.com">podpora@l-code-dynamics.com</a>.</p>`;
}
// --- Používatelia a pozvánky (natívne /admin/users, /admin/invites). Roly (RBAC) zatiaľ nie sú zapnuté: každý správca má plný prístup. ---
const inviteLink = (t) => `${location.origin}${location.pathname}#/pozvanka/${encodeURIComponent(t)}`;
async function vPouzivatelia(view, notice) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam používateľov…</div>';
  let us, inv;
  try { [us, inv] = await Promise.all([api('/admin/users?limit=100&fields=id,email,first_name,last_name,created_at'), api('/admin/invites?limit=100&fields=id,email,accepted,expires_at,token,created_at')]); }
  catch (e) { return loadError(view, e, () => vPouzivatelia(view)); }
  const users = us.users || [], invites = (inv.invites || []).filter(i => !i.accepted);
  view.innerHTML = `<div id="umsg">${notice || ''}</div>
    <div class="card" style="margin-bottom:16px"><div class="card-h">Správcovia</div><div class="card-b"><div class="rc-grid">${users.map(u => `<div class="rc"><div class="rc-body"><div class="rc-title">${esc([u.first_name, u.last_name].filter(Boolean).join(' ') || u.email)}</div><div class="rc-fields">
      <span class="rc-f"><em>E-mail</em>${esc(u.email)}</span><span class="rc-f"><em>Od</em>${fmtDate(u.created_at)}</span>${ME && ME.id === u.id ? '<span class="pill ok">vy</span>' : ''}</div></div></div>`).join('')}</div>
      <p class="muted" style="font-size:12px;margin-top:10px">Každý správca má zatiaľ plný prístup do administrácie. Pozývajte len ľudí, ktorým dôverujete.</p></div></div>
    <div class="card"><div class="card-h">Pozvať ďalšieho správcu</div><div class="card-b">
      <form id="u-inv" class="row"><div><label>E-mail</label><input id="u-email" type="email" required></div><div style="align-self:end"><button class="btn gold" type="submit">Vytvoriť pozvánku</button></div></form>
      ${invites.length ? `<label style="margin-top:14px">Čakajúce pozvánky</label><div class="rc-grid">${invites.map(i => { const exp = i.expires_at && new Date(i.expires_at) < new Date();
        return `<div class="rc"><div class="rc-body"><div class="rc-title">${esc(i.email)}</div><div class="rc-fields">
        <span class="rc-f"><em>Platí do</em>${fmtDate(i.expires_at)}${exp ? ' <span class="pill off">vypršala</span>' : ''}</span></div>
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">${!exp && i.token ? `<button type="button" class="btn ghost" data-copy="${esc(i.id)}">Kopírovať odkaz</button>` : ''}<button type="button" class="btn ghost" data-resend="${esc(i.id)}">Obnoviť pozvánku</button><button type="button" class="btn ghost" data-del="${esc(i.id)}">Zrušiť</button></div></div></div>`; }).join('')}</div>` : ''}
      <p class="muted" style="font-size:12px;margin-top:10px">Odkaz pozvánky pošlite novému správcovi sami (e-mailom alebo správou). Odkaz je jednorazový a má obmedzenú platnosť.</p>
    </div></div>`;
  const msg = (h) => { view.querySelector('#umsg').innerHTML = h; };
  const copy = async (t) => { const l = inviteLink(t); try { await navigator.clipboard.writeText(l); msg('<div class="notice">Odkaz pozvánky je skopírovaný.</div>'); } catch { msg(`<div class="notice">Odkaz pozvánky: <input readonly value="${esc(l)}" onclick="this.select()"></div>`); } };
  const fail = (b, e) => { if (e.message === '401') return; if (b) b.disabled = false; msg(`<div class="err">${esc(e.message)}</div>`); };
  view.querySelector('#u-inv').onsubmit = async (e) => {
    e.preventDefault(); const b = e.target.querySelector('button'), email = view.querySelector('#u-email').value.trim();
    if (!confirm(`Pozvať ${email} ako správcu s plným prístupom?`)) return;
    b.disabled = true;
    try { const { invite } = await api('/admin/invites', { method: 'POST', body: { email } }); await vPouzivatelia(view); if (invite?.token) await copy(invite.token); }
    catch (err) { fail(b, err); }
  };
  view.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copy(invites.find(i => i.id === b.dataset.copy).token));
  view.querySelectorAll('[data-resend]').forEach(b => b.onclick = async () => { b.disabled = true;
    try { const { invite } = await api(`/admin/invites/${encodeURIComponent(b.dataset.resend)}/resend`, { method: 'POST', body: {} }); await vPouzivatelia(view); if (invite?.token) await copy(invite.token); }
    catch (err) { fail(b, err); } });
  view.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (!confirm('Zrušiť túto pozvánku? Odkaz prestane fungovať.')) return; b.disabled = true;
    try { await api(`/admin/invites/${encodeURIComponent(b.dataset.del)}`, { method: 'DELETE' }); await vPouzivatelia(view, '<div class="notice">Pozvánka je zrušená.</div>'); }
    catch (err) { fail(b, err); } });
}
// Prijatie pozvánky (bez prihlásenia): registrácia identity → prijatie pozvánky → prihlásenie.
function renderInviteAccept(invToken, msg) {
  root.innerHTML = authShell(`<form class="box" id="ia">
    <p class="eyebrow">Pozvánka do administrácie</p><h1>Vytvorte si účet</h1><p class="intro">Po vytvorení účtu vás rovno prihlásime.</p>
    ${msg ? `<div class="err">${esc(msg)}</div>` : ''}
    <label for="ia-email">E-mail (ten, na ktorý prišla pozvánka)</label><input id="ia-email" type="email" required autocomplete="username">
    <div class="row"><div><label for="ia-first">Meno</label><input id="ia-first" required autocomplete="given-name"></div><div><label for="ia-last">Priezvisko</label><input id="ia-last" required autocomplete="family-name"></div></div>
    <label for="ia-pass">Heslo (aspoň 12 znakov)</label><input id="ia-pass" type="password" minlength="12" required autocomplete="new-password">
    <button class="btn primary" type="submit">Vytvoriť účet</button>
  </form>`);
  root.querySelector('#ia').onsubmit = async (e) => {
    e.preventDefault();
    const email = root.querySelector('#ia-email').value.trim(), password = root.querySelector('#ia-pass').value;
    const first_name = root.querySelector('#ia-first').value.trim(), last_name = root.querySelector('#ia-last').value.trim();
    if (password.length < 12) return renderInviteAccept(invToken, 'Heslo musí mať aspoň 12 znakov.');
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try {
      const reg = await fetch(API + '/auth/user/emailpass/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const rd = await reg.json().catch(() => ({}));
      if (!reg.ok || !rd.token) throw new Error(rd?.message || 'Účet sa nepodarilo vytvoriť.');
      const acc = await fetch(API + '/admin/invites/accept?token=' + encodeURIComponent(invToken), { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + rd.token }, body: JSON.stringify({ email, first_name, last_name }) });
      const ad = await acc.json().catch(() => ({}));
      if (!acc.ok) throw new Error(ad?.message || 'Pozvánka je neplatná alebo vypršala. Požiadajte o novú.');
      await login(email, password);
      location.hash = '#/';
    } catch (err) { renderInviteAccept(invToken, err.message); }
  };
}
// --- Pripojenia: produktové feedy a dopravca (Nastavenia → Pripojenia) ---
// Feed URL a stav dopravcov číta jadro; API kľúč dopravcu sa ukladá šifrovaný na serveri
// a do prehliadača sa nikdy neposiela späť.
const FEEDS = [
  { id: 'heureka', label: 'Heureka', path: '/feeds/heureka.xml', hint: 'XML pre porovnávač Heureka – tento odkaz vložte do administrácie Heuriky.' },
  { id: 'google', label: 'Google Merchant Center', path: '/feeds/google.xml', hint: 'RSS 2.0 pre Google Merchant Center – tento odkaz vložte do Merchant Centra.' },
];
const CARRIERS = [
  { id: 'packeta', label: 'Packeta', hint: 'Výdajné miesta Packeta a Zásielkovňa.' },
  { id: 'sps', label: 'SPS', hint: 'Kuriérna služba Slovenskej pošty.' },
  { id: 'gls', label: 'GLS', hint: 'GLS Slovensko – na adresu aj na výdajné miesto.' },
  { id: 'dpd', label: 'DPD', hint: 'DPD Slovensko – na adresu aj na výdajné miesto.' },
];
async function copyToClipboard(text, btn) {
  const done = () => { const old = btn.textContent; btn.textContent = 'Skopírované'; setTimeout(() => { btn.textContent = old; }, 1800); };
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); done(); return true; }
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) throw new Error('copy');
    done(); return true;
  } catch { return false; }
}
async function vPripojenia(view) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam pripojenia…</div>';
  const soft = (e) => { if (e.message === '401') throw e; return null; };
  const [feedsR, carriersR] = await Promise.all([
    api('/admin/feeds').catch(soft),
    api('/admin/carriers').catch(soft),
  ]);
  const feeds = FEEDS.map((f) => {
    const fromApi = (feedsR?.feeds || []).find((x) => x.id === f.id);
    return { ...f, url: fromApi?.url || `${API}${f.path}`, hint: fromApi?.hint || f.hint };
  });
  const count = feedsR?.products;
  const carriers = CARRIERS.map((c) => {
    const fromApi = (carriersR?.carriers || []).find((x) => x.id === c.id);
    return { ...c, active: !!fromApi?.active, has_key: !!fromApi?.has_key, key_hint: fromApi?.key_hint || null, status_label: fromApi?.status_label || 'nepripojené' };
  });
  const active = carriers.find((c) => c.active) || null;
  // Aj keď jadro neodpovie, URL feedov aj zoznam dopravcov poznáme – obrazovka ostane použiteľná.
  const feedsHtml = `<div class="rc-grid">${feeds.map((f) => `<div class="rc"><div class="rc-body">
      <div class="rc-title">${esc(f.label)}</div>
      <div class="rc-fields"><span class="rc-f"><em>Odkaz na feed</em><code class="rc-code">${esc(f.url)}</code></span>
        <span class="rc-f"><em>Stav</em>${count === null || count === undefined ? '<span class="pill off">nedá sa overiť</span>' : `<span class="pill ${count ? 'ok' : 'warn'}">${count ? `${count} produktov` : 'zatiaľ žiadne produkty'}</span>`}</span></div>
      <p class="muted" style="font-size:12px;margin:8px 0 0">${esc(f.hint)}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        <button type="button" class="btn ghost sm" data-copy="${esc(f.url)}">Kopírovať odkaz</button>
        <a class="btn ghost sm" href="${esc(f.url)}" target="_blank" rel="noopener">Otvoriť feed</a>
      </div></div></div>`).join('')}</div>`;
  const carriersHtml = `<div class="rc-grid">${carriers.map((c) => `<label class="rc carrier-pick">
      <input type="radio" name="carrier" value="${esc(c.id)}" ${c.active ? 'checked' : ''}>
      <div class="rc-body"><div class="rc-title">${esc(c.label)}</div>
        <div class="rc-fields"><span class="rc-f"><em>Stav</em><span class="pill ${c.active && c.has_key ? 'warn' : 'off'}">${esc(c.status_label)}</span></span>
        ${c.active && c.key_hint ? `<span class="rc-f"><em>API kľúč</em>${esc(c.key_hint)}</span>` : ''}</div>
        <p class="muted" style="font-size:12px;margin:8px 0 0">${esc(c.hint)}</p>
      </div></label>`).join('')}</div>`;
  view.innerHTML = `<div id="pm-msg"></div>
    <div class="card" style="margin-bottom:16px"><div class="card-h">Produktové feedy</div><div class="card-b">
      <p class="muted" style="margin-top:0">Feed si porovnávač stiahne sám z odkazu – nič netreba nahrávať. Vo feede sú len zverejnené produkty v predajnom kanáli, s cenou s DPH.</p>
      ${feedsHtml}
    </div></div>
    <div class="card"><div class="card-h">Dopravca</div><div class="card-b">
      <p class="muted" style="margin-top:0">Vyberte dopravcu a vložte jeho API kľúč. Kľúč sa uloží na serveri šifrovaný a nikdy sa vám znova neukáže.
      ${active ? ` Teraz je vybraný <b>${esc(active.label)}</b>.` : ''}</p>
      ${carriersHtml}
      <div class="row" style="margin-top:14px;align-items:flex-end">
        <div><label for="carrier-key">API kľúč dopravcu</label><input id="carrier-key" type="password" autocomplete="off" placeholder="vložte kľúč od dopravcu"></div>
        <div><button type="button" class="btn gold" id="carrier-save">Uložiť</button></div>
      </div>
      <p class="muted" style="font-size:12px;margin-top:10px">Pripojenie k API dopravcu ešte nie je zapojené – stav ostáva „nepripojené“ dovtedy, kým dopravcu potvrdíme.</p>
    </div></div>`;
  view.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => {
    const ok = await copyToClipboard(b.dataset.copy, b);
    if (!ok) { const msg = view.querySelector('#pm-msg'); msg.innerHTML = '<div class="err">Prehliadač nedovolil skopírovať. Odkaz si skopírujte ručne.</div>'; }
  });
  const save = view.querySelector('#carrier-save');
  if (save) {
    if (carriersR === null) { save.disabled = true; save.title = 'Jadro neodpovedá – stav sa nedá uložiť.'; }
    save.onclick = async () => {
      const msg = view.querySelector('#pm-msg');
      const picked = view.querySelector('input[name="carrier"]:checked');
      const key = view.querySelector('#carrier-key').value.trim();
      if (!picked) { msg.innerHTML = '<div class="err">Vyberte dopravcu.</div>'; return; }
      if (!key) { msg.innerHTML = '<div class="err">Vložte API kľúč dopravcu.</div>'; return; }
      msg.innerHTML = ''; save.disabled = true;
      try {
        await api('/admin/carriers', { method: 'POST', body: { provider: picked.value, api_key: key } });
        msg.innerHTML = '<div class="ok">Dopravca je uložený. Kľúč je na serveri šifrovaný.</div>';
        await vPripojenia(view);
      } catch (e) {
        if (e.message !== '401') msg.innerHTML = `<div class="err">${esc(e.message)}</div>`;
        save.disabled = false;
      }
    };
  }
}
// --- Nastavenia → História zmien: čo kto v administrácii zmenil (z auditu jadra) ---
const AUDIT_LABEL = {
  'admin.theme.update': 'Zmena farieb administrácie',
  'admin.carrier.update': 'Zmena dopravcu',
  'admin.page.update': 'Zmena textu stránky',
  'admin.page.reset': 'Obnovenie pôvodného textu stránky',
  'admin.media.add': 'Pridanie obrázka do knihovny',
  'admin.media.delete': 'Zmažanie obrázka z knihovny',
};
async function vAuditLog(view) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam historianiu…</div>';
  let entries = [], count = 0, offset = 0;
  try {
    const data = await api(`/admin/ops/audit?limit=50&offset=${offset}`);
    entries = data.entries || []; count = Number(data.count) || 0;
  } catch (e) {
    if (e.message === '401') throw e;
    view.innerHTML = `<div class="err">${esc(e.message)}</div>`; return;
  }
  const changed = (c) => {
    if (!c || typeof c !== 'object') return '';
    const keys = Object.keys(c);
    if (!keys.length) return '';
    return keys.map(k => `${k}: ${typeof c[k] === 'object' ? JSON.stringify(c[k]) : String(c[k])}`).join(' · ');
  };
  view.innerHTML = `<div class="card"><div class="card-h">História zmien<span class="muted">(${count})</span></div><div class="card-b">
    <p class="muted" style="margin-top:0">Záznamy o tom, čo kto zmenil v administrácii. Píše sa to automaticky pri každej uloženej zmene.</p>
    ${entries.length ? `<div class="rc-grid">${entries.map(en => `<div class="rc"><div class="rc-body">
        <div class="rc-title">${esc(AUDIT_LABEL[en.action] || en.action)}</div>
        <div class="rc-fields">
          <span class="rc-f"><em>Kedy</em>${fmtDate(en.created_at)}</span>
          <span class="rc-f"><em>Kto</em>${esc(en.actor_id || '—')}</span>
          <span class="rc-f"><em>Čo</em>${esc(en.entity_type || '—')}${en.entity_id ? ` · ${esc(String(en.entity_id).slice(0, 24))}` : ''}</span>
        </div>
        ${changed(en.changes) ? `<p class="muted" style="font-size:12px;margin:8px 0 0;overflow-wrap:anywhere">${esc(changed(en.changes).slice(0, 300))}</p>` : ''}
      </div></div>`).join('')}</div>` : '<div class="empty">Zatiaľ nie je zaznamenaná žiadna zmena.</div>'}
    <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;margin-top:14px;flex-wrap:wrap">
      <span class="muted">${count ? `${offset + 1}–${offset + entries.length} z ${count}` : 'Žiadne záznamy'}</span>
      <div style="display:flex;gap:8px"><button class="btn ghost" id="au-prev" ${offset <= 0 ? 'disabled' : ''}>← Predchádzajúce</button><button class="btn ghost" id="au-next" ${offset + entries.length >= count ? 'disabled' : ''}>Ďalšie →</button></div>
    </div>
  </div></div>`;
  view.querySelector('#au-prev').onclick = () => { if (offset > 0) { offset = Math.max(0, offset - 50); vAuditLog(view); } };
  view.querySelector('#au-next').onclick = () => { if (offset + entries.length < count) { offset += 50; vAuditLog(view); } };
}
// --- Vernostné úrovne (loyalty): UI nad hotovým backendom ---
// Percentá a prahy posiela server; klient nič nedopočítava.
const LOYALTY_TIER_LABEL = { ZR1: 'Bronze', ZR2: 'Silver', ZR3: 'Gold', ZR4: 'VIP' };
async function vLoyaltyPolicy(view) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam vernostné úrovne…</div>';
  let policy = null, error = null;
  try { policy = await api('/admin/nexus/loyalty-policy'); }
  catch (e) { if (e.message === '401') throw e; error = e.message; }
  if (!policy) {
    view.innerHTML = `<div class="card"><div class="card-h">Vernostné úrovne</div><div class="card-b">
      <div class="err">${esc(error || 'Nastavenie sa nepodarilo načítať.')}</div>
      <p class="muted" style="margin-top:10px">Vernostné úrovne musia byť v jadre zapnuté. Ak ich vidíte prvýkrát, požiadajte podporu o ich sprístupnenie.</p>
    </div></div>`;
    return;
  }
  const tiers = policy.tiers || [];
  const row = (t, i) => `<div class="loyalty-row" data-tier="${esc(t.code)}">
      <input class="rc-search" data-f="name" value="${esc(t.name || '')}" placeholder="Bronze" maxlength="60" aria-label="Názov úrovne">
      <div class="row" style="gap:6px;align-items:center"><input class="rc-search" data-f="discount_percent" type="number" min="0" max="50" step="0.5" value="${esc(String(t.discount_percent ?? 0))}" aria-label="Zľava v percentách"><span class="muted">%</span></div>
      <input class="rc-search" data-f="spend_threshold_eur" type="number" min="0" step="1" value="${t.spend_threshold_eur == null ? '' : esc(String(t.spend_threshold_eur))}" placeholder="napr. 500" aria-label="Prah zaplatenej útraty v eurách">
      <label style="display:flex;gap:6px;align-items:center;justify-content:center"><input type="checkbox" data-f="enabled" ${t.enabled !== false ? 'checked' : ''} style="width:auto"> zapnuté</label>
      <code class="rc-code">${esc(t.code)}</code>
    </div>`;
  view.innerHTML = `<div class="card"><div class="card-h">Vernostné úrovne</div><div class="card-b">
    <div id="lp-msg"></div>
    ${tiers.length ? `<div class="loyalty-head"><span>Názov</span><span>Zľava</span><span>Prah útraty (€)</span><span>Zapnuté</span><span>Kód</span></div>
      <div id="lp-rows">${tiers.map(row).join('')}</div>`
      : '<div class="notice">Vernostné úrovne ešte nie sú nastavené. Nastavte zľavu a prah, aby zákazníci dostávali zľavu.</div>'}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
      <button type="button" class="btn ghost" id="lp-add">+ Pridať úroveň</button>
      <button type="button" class="btn gold" id="lp-save">Uložiť zmeny</button>
    </div>
    <p class="muted" style="font-size:12px;margin-top:12px">Zľava sa počíta na serveri pri nákupe. Úroveň sa priradí automaticky podľa celkovej útraty zákazníci. Ak jej úroveň nastavíte ručne, automatické priradenie ju už nepremení.</p>
  </div></div>`;
  const rows = view.querySelector('#lp-rows');
  const msg = view.querySelector('#lp-msg');
  const addTier = () => {
    const used = new Set([...rows.querySelectorAll('[data-tier]')].map((el) => el.dataset.tier));
    let n = 1; while (used.has(`ZR${n}`)) n++;
    const code = `ZR${n}`;
    const el = document.createElement('div');
    el.className = 'loyalty-row';
    el.dataset.tier = code;
    el.innerHTML = `<input class="rc-search" data-f="name" value="" placeholder="Názov úrovne" maxlength="60" aria-label="Názov úrovne">
      <div class="row" style="gap:6px;align-items:center"><input class="rc-search" data-f="discount_percent" type="number" min="0" max="50" step="0.5" value="0" aria-label="Zľava v percentách"><span class="muted">%</span></div>
      <input class="rc-search" data-f="spend_threshold_eur" type="number" min="0" step="1" value="" placeholder="napr. 500" aria-label="Prah zaplatené útraty v eurách">
      <label style="display:flex;gap:6px;align-items:center;justify-content:center"><input type="checkbox" data-f="enabled" checked style="width:auto"> zapnuté</label>
      <code class="rc-code">${code}</code>`;
    rows.appendChild(el);
  };
  view.querySelector('#lp-add').onclick = addTier;
  view.querySelector('#lp-save').onclick = async () => {
    const body = [...rows.querySelectorAll('.loyalty-row')].map((el) => ({
      code: el.dataset.tier,
      name: el.querySelector('[data-f=name]').value.trim(),
      discount_percent: Number(el.querySelector('[data-f=discount_percent]').value) || 0,
      spend_threshold_eur: el.querySelector('[data-f=spend_threshold_eur]').value.trim() === '' ? null : Number(el.querySelector('[data-f=spend_threshold_eur]').value),
      enabled: el.querySelector('[data-f=enabled]').checked,
    }));
    msg.innerHTML = ''; view.querySelector('#lp-save').disabled = true;
    try {
      const res = await api('/admin/nexus/loyalty-policy', { method: 'PUT', body: { tiers: body } });
      const synced = res?.worker_sync?.synced !== false;
      msg.innerHTML = synced
        ? '<div class="ok">Zľavy a prahy sú uložené. Zľava sa počíta pri nákupe v košíku.</div>'
        : '<div class="notice">Politika je uložená, ale cenový server ju ešte neprebral. Skúste to uložiť znova alebo to oznámte podpore.</div>';
      await vLoyaltyPolicy(view);
    } catch (e) {
      if (e.message !== '401') msg.innerHTML = `<div class="err">${esc(e.message)}</div>`;
      view.querySelector('#lp-save').disabled = false;
    }
  };
}
const vNastavenia = (view) => subnav(view, [
  { label: 'Vzhľad', run: vAppearance },
  { label: 'Pripojenia', run: vPripojenia },
  { label: 'Doprava a platby', run: vDopravaPlatby },
  { label: 'Vernostné úrovne', run: vLoyaltyPolicy },
  { label: 'Používatelia', run: (v) => vPouzivatelia(v) },
  { label: 'História zmien', run: vAuditLog },
  { label: 'Účtovníctvo', run: (v) => stub(v, 'Účtovníctvo', `Prepojenie s účtovníctvom (POHODA alebo Money S3) pripravujeme. Dovtedy si objednávky môžete pozrieť v časti Objednávky. Otázky posielajte na ${SUPPORT_EMAIL}.`) },
]);
// --- sprievodca: centrum nápovedy (#/pomoc, #/pomoc/<návod>), pomoc na stránke a úvodná prehliadka ---
// Obsah je v guide.mjs; tu je len zobrazenie. Všetok text ide cez esc().
const normText = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const guideById = (id) => GUIDES.find(g => g.id === id) || null;
const groupLabel = (id) => (GUIDE_GROUPS.find(g => g.id === id) || {}).label || '';
const guideHay = (g) => normText([g.title, g.summary, g.why, ...(g.steps || []), ...(g.after || []), ...(g.careful || []), ...((g.extra && g.extra.items) || []), groupLabel(g.group)].join(' '));
const supportLink = `<a href="mailto:${esc(SUPPORT_EMAIL)}">${esc(SUPPORT_EMAIL)}</a>`;

function ctxHelpHtml(key) {
  const h = PAGE_HELP[key]; if (!h) return '';
  const links = (h.guides || []).map(guideById).filter(Boolean);
  return `<section class="ctx-help" id="ctx-help" hidden aria-labelledby="ctx-help-t">
    <div class="ctx-help-h"><h2 id="ctx-help-t">${esc(h.title)}</h2><button type="button" class="ctx-close" id="ctx-help-close" aria-label="Zavrieť vysvetlenie"><span aria-hidden="true">×</span></button></div>
    <p>${esc(h.text)}</p>
    ${h.points && h.points.length ? `<ul>${h.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
    <div class="ctx-links">${links.map(g => `<a class="subtle-link" href="#/pomoc/${esc(g.id)}">${esc(g.title)} →</a>`).join('')}</div>
    ${h.tour ? `<button type="button" class="btn ghost" id="ctx-tour">${navIcon('arrow')}Spustiť prehliadku administrácie</button>` : ''}
  </section>`;
}
function wireCtxHelp() {
  const btn = root.querySelector('#ctx-help-btn'), panel = root.querySelector('#ctx-help');
  if (!btn || !panel) return;
  const set = (open) => { panel.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
  btn.onclick = () => { const open = panel.hidden; set(open); if (open) panel.querySelector('#ctx-help-close')?.focus(); };
  document.addEventListener('mousedown', (e) => { if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) set(false); });
  const cl = panel.querySelector('#ctx-help-close'); if (cl) cl.onclick = () => { set(false); btn.focus(); };
  const onEsc = (e) => { if (e.key === 'Escape' && !panel.hidden) { set(false); btn.focus(); } };
  panel.addEventListener('keydown', onEsc); btn.addEventListener('keydown', onEsc);
  const t = panel.querySelector('#ctx-tour'); if (t) t.onclick = () => { set(false); restartTour(); };
}

function vPomoc(view) {
  view = freshView(view);
  window.scrollTo(0, 0);
  const id = decodeURIComponent((location.hash.replace(/^#\/?/, '').split('/')[1] || ''));
  const g = id ? guideById(id) : null;
  if (g) return guideDetail(view, g);
  const card = (x) => `<a class="guide-card" href="#/pomoc/${esc(x.id)}">${navIcon(x.icon || 'doc')}<span><strong>${esc(x.title)}</strong><small>${esc(x.summary)}</small></span></a>`;
  const render = (list) => {
    if (!list.length) return '';
    return GUIDE_GROUPS.map(gr => { const items = list.filter(x => x.group === gr.id); return items.length ? `<section class="help-group" aria-labelledby="hg-${esc(gr.id)}"><h2 id="hg-${esc(gr.id)}">${esc(gr.label)}</h2><div class="guide-grid">${items.map(card).join('')}</div></section>` : ''; }).join('');
  };
  view.innerHTML = `<div class="help-top">
      <div class="help-search"><label for="help-q">Hľadať v návodoch</label><input id="help-q" type="search" placeholder="Napríklad vrátiť peniaze, kupón, termín…" autocomplete="off"><p class="muted help-count" id="help-count" aria-live="polite">${GUIDES.length} návodov</p></div>
      <div class="help-tour"><h2>Prehliadka administrácie</h2><p>Krátko vás prevedie všetkými časťami administrácie a vysvetlí, na čo slúžia.</p><button type="button" class="btn primary" id="help-tour">${navIcon('arrow')}Spustiť prehliadku znova</button></div>
    </div>
    <div id="help-list">${render(GUIDES)}</div>
    <aside class="help-card"><h3>Neviete si rady?</h3><p>Napíšte nám na ${supportLink}. Opíšte, čo ste robili a čo sa zobrazilo, a my vám pomôžeme.</p></aside>`;
  view.querySelector('#help-tour').onclick = restartTour;
  const q = view.querySelector('#help-q'), listEl = view.querySelector('#help-list'), cnt = view.querySelector('#help-count');
  const nav = (n) => n === 1 ? '1 návod' : n >= 2 && n <= 4 ? `${n} návody` : `${n} návodov`;
  q.oninput = () => {
    const terms = normText(q.value).split(/\s+/).filter(Boolean);
    const list = terms.length ? GUIDES.filter(x => { const h = guideHay(x); return terms.every(t => h.includes(t)); }) : GUIDES;
    listEl.innerHTML = list.length ? render(list) : `<div class="empty">Na „${esc(q.value.trim())}“ sme nenašli žiadny návod. Skúste iné slovo alebo nám napíšte na ${supportLink}.</div>`;
    cnt.textContent = terms.length ? `Nájdené: ${nav(list.length)}` : nav(GUIDES.length);
  };
}
function guideDetail(view, g) {
  const list = (arr, cls = '') => `<ul${cls ? ` class="${cls}"` : ''}>${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
  const related = GUIDES.filter(x => x.group === g.group && x.id !== g.id);
  view.innerHTML = `<a class="subtle-link help-back" href="#/pomoc">← Všetky návody</a>
    <article class="card guide" aria-labelledby="guide-t"><div class="card-b">
      <header class="guide-head"><div><p class="eyebrow">${esc(groupLabel(g.group))}</p>
      <h2 id="guide-t">${esc(g.title)}</h2>
      <p class="intro">${esc(g.summary)}</p></div>
      <div class="guide-actions"><a class="btn primary" href="${esc(g.href)}">${esc(g.hrefLabel)}${navIcon('arrow')}</a></div></header>
      <div class="guide-cols"><div>
      <section class="guide-sec"><h3>Prečo</h3><p>${esc(g.why)}</p></section>
      <section class="guide-sec"><h3>Ako na to</h3><ol class="guide-steps">${g.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol></section>
      </div><div>
      ${g.extra ? `<section class="guide-sec"><h3>${esc(g.extra.title)}</h3>${list(g.extra.items)}</section>` : ''}
      ${g.after && g.after.length ? `<section class="guide-sec"><h3>Čo sa stane potom</h3>${list(g.after)}</section>` : ''}
      ${g.careful && g.careful.length ? `<section class="guide-sec guide-careful"><h3>Na čo si dať pozor</h3>${list(g.careful)}</section>` : ''}
      ${related.length ? `<section class="guide-sec guide-related"><h3>Súvisiace návody</h3><ul>${related.map(x => `<li><a href="#/pomoc/${esc(x.id)}">${esc(x.title)}</a></li>`).join('')}</ul></section>` : ''}
      </div></div>
    </div></article>`;
}

// Úvodná prehliadka. „Videné“ sa pamätá pre každý účet zvlášť; keď je úložisko prehliadača nedostupné, aspoň do obnovenia stránky.
let TOUR_PENDING = false, TOUR_OPEN = null;
const TOUR_SEEN_MEM = new Set();
const tourKey = () => 'ana_tour_seen:' + (ME?.id || ME?.email || 'anon');
function tourSeen() { const k = tourKey(); if (TOUR_SEEN_MEM.has(k)) return true; try { return localStorage.getItem(k) === '1'; } catch { return false; } }
function markTourSeen() { const k = tourKey(); TOUR_SEEN_MEM.add(k); try { localStorage.setItem(k, '1'); } catch { /* súkromné okno: stačí pamäť */ } }
function restartTour() {
  TOUR_PENDING = true;
  const key = location.hash.replace(/^#\/?/, '').split('/')[0];
  if (key === '' || !(key in ROUTES)) route(); else location.hash = '#/';
}
function maybeStartTour() {
  if (TOUR_OPEN) return;
  if (!TOUR_PENDING && tourSeen()) return;
  TOUR_PENDING = false;
  startTour();
}
function startTour() {
  if (TOUR_OPEN || !TOUR.length) return;
  const mq = window.matchMedia('(max-width: 800px)');
  const prevFocus = document.activeElement;
  const block = $('<div class="tour-block" aria-hidden="true"></div>');
  const spot = $('<div class="tour-spot" aria-hidden="true" hidden></div>');
  const card = $(`<div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-t" aria-describedby="tour-d">
    <div class="tour-top"><span class="tour-count" id="tour-c"></span><button type="button" class="tour-skip" data-a="skip">Preskočiť prehliadku</button></div>
    <div class="tour-bar" aria-hidden="true"><span></span></div>
    <h2 id="tour-t" tabindex="-1"></h2>
    <div class="tour-body" id="tour-d"></div>
    <div class="tour-nav"><button type="button" class="btn ghost" data-a="prev">Späť</button><button type="button" class="btn primary" data-a="next">Ďalej</button></div>
  </div>`);
  document.body.append(block, spot, card);
  root.inert = true;
  const prevBtn = card.querySelector('[data-a="prev"]'), nextBtn = card.querySelector('[data-a="next"]'), titleEl = card.querySelector('#tour-t');
  let i = 0, target = null, step = TOUR[0], showSeq = 0, raf = 0;
  const sidebar = (open) => {
    const sb = root.querySelector('#sidebar'), tg = root.querySelector('#nav-toggle');
    if (!sb) return false;
    const was = sb.classList.contains('mobile-open');
    sb.classList.toggle('mobile-open', open);
    root.querySelector('#scrim')?.classList.remove('on');
    if (tg) { tg.setAttribute('aria-expanded', String(open)); tg.setAttribute('aria-label', open ? 'Zavrieť navigáciu' : 'Otvoriť navigáciu'); }
    return was !== open;
  };
  const place = () => {
    const vw = document.documentElement.clientWidth, vh = window.innerHeight, m = 16;
    const cw = Math.min(400, vw - 2 * m);
    card.style.width = cw + 'px'; card.style.maxHeight = (vh - 2 * m) + 'px';
    const ch = card.offsetHeight;
    const r = target && target.isConnected ? target.getBoundingClientRect() : null;
    if (!r || (!r.width && !r.height)) {
      spot.hidden = true; block.classList.add('dim');
      card.style.left = Math.round((vw - cw) / 2) + 'px'; card.style.top = Math.round(Math.max(m, (vh - ch) / 2)) + 'px';
      return;
    }
    const pad = 6;
    spot.hidden = false; block.classList.remove('dim');
    Object.assign(spot.style, { left: (r.left - pad) + 'px', top: (r.top - pad) + 'px', width: (r.width + 2 * pad) + 'px', height: (r.height + 2 * pad) + 'px' });
    let left, top;
    if (step.sidebar && r.right + 24 + cw <= vw - m) { left = r.right + 24; top = r.top + r.height / 2 - ch / 2; }
    else {
      if (r.bottom + pad + 12 + ch <= vh - m) top = r.bottom + pad + 12;
      else if (r.top - pad - 12 - ch >= m) top = r.top - pad - 12 - ch;
      else top = null;
      left = r.left + r.width / 2 - cw / 2;
      // Vysoký prvok: karta vedľa neho (vpravo, inak vľavo); keď nie je miesto, prekryje jeho spodok.
      if (top == null) {
        const vis = Math.max(m, Math.min(vh - m - ch, (Math.max(r.top, 0) + Math.min(r.bottom, vh)) / 2 - ch / 2));
        if (r.right + pad + 16 + cw <= vw - m) { left = r.right + pad + 16; top = vis; }
        else if (r.left - pad - 16 - cw >= m) { left = r.left - pad - 16 - cw; top = vis; }
        else top = vh - m - ch;
      }
    }
    card.style.left = Math.round(Math.min(Math.max(m, left), vw - m - cw)) + 'px';
    card.style.top = Math.round(Math.min(Math.max(m, top), vh - m - ch)) + 'px';
  };
  const onMove = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };
  const show = async (n) => {
    const my = ++showSeq;
    i = Math.max(0, Math.min(TOUR.length - 1, n)); step = TOUR[i];
    if (mq.matches && sidebar(!!step.sidebar)) await new Promise(r => setTimeout(r, 240));
    if (my !== showSeq || !card.isConnected) return;
    const el = step.target ? document.querySelector(step.target) : null;
    target = el && el.getClientRects().length ? el : null;
    card.querySelector('#tour-c').textContent = `Krok ${i + 1} z ${TOUR.length}`;
    card.querySelector('.tour-bar span').style.width = `${Math.round((i + 1) / TOUR.length * 100)}%`;
    titleEl.textContent = step.title;
    card.querySelector('#tour-d').innerHTML = `<p>${esc(step.what)}</p><h3>Prečo je to dôležité</h3><p>${esc(step.why)}</p><h3>Ako to funguje</h3><p>${esc(step.how)}</p>`;
    prevBtn.disabled = i === 0;
    nextBtn.textContent = i === TOUR.length - 1 ? 'Dokončiť' : 'Ďalej';
    card.scrollTop = 0;
    if (target) target.scrollIntoView({ block: step.sidebar ? 'nearest' : (target.offsetHeight > window.innerHeight * 0.55 ? 'start' : 'center') });
    place();
    titleEl.focus({ preventScroll: true });
  };
  const close = () => {
    if (!card.isConnected) return;
    showSeq++; cancelAnimationFrame(raf);
    markTourSeen();
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onMove); window.removeEventListener('scroll', onMove, true);
    block.remove(); spot.remove(); card.remove();
    root.inert = false;
    if (mq.matches) sidebar(false);
    TOUR_OPEN = null;
    if (prevFocus && prevFocus.isConnected && typeof prevFocus.focus === 'function') prevFocus.focus({ preventScroll: true });
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); if (i < TOUR.length - 1) show(i + 1); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); if (i > 0) show(i - 1); return; }
    if (e.key === 'Tab') {
      const f = [...card.querySelectorAll('button:not(:disabled)')];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1], a = document.activeElement;
      if (e.shiftKey && (a === first || a === titleEl || !card.contains(a))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (a === last || !card.contains(a))) { e.preventDefault(); first.focus(); }
    }
  };
  card.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'skip') close();
    else if (a === 'prev' && i > 0) show(i - 1);
    else if (a === 'next') { if (i < TOUR.length - 1) show(i + 1); else close(); }
  });
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onMove); window.addEventListener('scroll', onMove, true);
  TOUR_OPEN = { close };
  show(0);
}

async function vEntitlements(view) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam…</div>';
  const { entitlements } = await api('/admin/entitlements?limit=200');
  const names = await namesFor((entitlements || []).map(e => e.customer_id), (entitlements || []).map(e => e.product_id));
  const rows = (entitlements || []).map(e => ({ ...e, product_title: e.product_title || (names.prod(e.product_id) === e.product_id ? 'Produkt sa nepodarilo načítať' : names.prod(e.product_id)), customer_email: e.customer_email || (names.cust(e.customer_id) === e.customer_id ? 'Zákazníka sa nepodarilo načítať' : names.cust(e.customer_id)) }));
  listView(view, {
    title: 'Prístupy a knižnica', rows, onRow: e => vEntitlementDetail(view, e),
    empty: 'Zatiaľ žiadne priradené prístupy. Pridelia sa automaticky po nákupe (jedna identita – všetky nákupy).',
    card: e => `<div class="rc-body"><div class="rc-title">${esc(e.product_title || e.product_id || 'Prístup')}</div><div class="rc-fields">
      <span class="rc-f"><em>Zákazník</em>${esc(e.customer_email || e.customer_id || '—')}</span>
      <span class="rc-f"><em>Stav</em><span class="pill ${e.status === 'active' ? 'ok' : 'off'}">${esc(e.status === 'active' ? 'Aktívny' : e.status === 'revoked' ? 'Odobratý' : 'Neaktívny')}</span></span>
      ${e.expires_at ? `<span class="rc-f"><em>Platí do</em>${fmtDate(e.expires_at)}</span>` : ''}</div></div>`,
  });
}
async function vEntitlementDetail(view, e) {
  view = freshView(view);
  view.innerHTML = `<div class="card"><div class="card-h">Prístup<button class="btn ghost" id="e-back">Späť</button></div><div class="card-b">
    <div id="emsg"></div>
    <div class="row"><div><label>Produkt</label><div>${esc(e.product_title || e.product_id || '—')}</div></div>
    <div><label>Zákazník</label><div>${esc(e.customer_email || e.customer_id || '—')}</div></div></div>
    <div class="row"><div><label>Stav</label><div><span class="pill ${e.status === 'active' ? 'ok' : 'off'}">${esc(e.status === 'active' ? 'Aktívny' : e.status === 'revoked' ? 'Odobratý' : 'Neaktívny')}</span></div></div>
    <div><label>Platí do</label><div>${e.expires_at ? fmtDate(e.expires_at) : 'trvalý'}</div></div></div>
    <p class="muted" style="margin-top:12px">${e.source === 'migration' ? 'Prístup prenesený zo starého obchodu.' : e.source === 'admin' ? 'Prístup pridelený v administrácii.' : 'Prístup k zakúpenému produktu.'}</p>
    ${e.status === 'active' ? '<div style="margin-top:16px"><button class="btn ghost" id="e-revoke">Odobrať prístup</button></div>' : ''}
  </div></div>`;
  view.querySelector('#e-back').onclick = () => vEntitlements(view);
  const rb = view.querySelector('#e-revoke');
  if (rb) rb.onclick = async () => { if (!confirm(`Odobrať zákazníkovi ${e.customer_email} prístup k produktu ${e.product_title}?`)) return; const msg = view.querySelector('#emsg'); msg.innerHTML = '';
    try { await api(`/admin/entitlements/${e.id}/revoke`, { method: 'POST' }); vEntitlements(view); }
    catch (err) { msg.innerHTML = `<div class="err">${esc(err.message)}</div>`; } };
}
const vZakaznicky = (view) => subnav(view, [{ label: 'Zákazníci', run: vCustomers }, { label: 'Prístupy a knižnica', run: vEntitlements }]);

const statusPill = (map, s) => { const [l, c] = map[s] || [s || '—', 'off']; return `<span class="pill ${c}">${esc(l)}</span>`; };
const ROUTES = {
  '': ['', '', vDashboard],
  'objednavky': ['Objednávky', 'Prehľad a vybavenie objednávok', vOrders],
  'produkty': ['Produkty', 'Katalóg, ceny a akcie', vProducts],
  'kategorie': ['Kategórie', 'Stromy a zaradenie', vCategories],
  'zakaznicky': ['Zákazníci', 'Účty, história a prístupy', vZakaznicky],
  'konzultacie': ['Konzultácie', 'Rezervácie, typy konzultácií a dostupnosť', vKonzultacieMenu],
  'spravy': ['Správy', 'Konverzácie so zákazníkmi a šablóny odpovedí', vSpravyMenu],
  'poukazy': ['Poukazy a zľavy', 'Kupóny, QR a darčekové poukazy', vPoukazy],
  'obsah': ['Obsah a e-maily', 'Stránky, texty, médiá a preklady', vObsah],
  'ambasadori': ['Ambasádori', 'Odporúčanie zákazníkov za províziu – Fáza 2, pripravujeme', vAmbasadori],
  'nastavenia': ['Nastavenia', 'Vzhľad, doprava, platby, používatelia a fakturácia', vNastavenia],
  'pomoc': ['Potrebujete poradiť?', 'Návody krok za krokom: prečo daná funkcia existuje, ako ju použiť a čo sa stane potom', vPomoc],
};

// Osobný vzhľad obsluhy na backende (/admin/my-theme): rovnaký na každom zariadení, s revíziou a auditom.
const THEME_DEFAULT = { forest: '#203b32', gold: '#d5ba81' };
let THEME = null;
// Tmavý režim je osobné nastavenie zariadenia (uložené v tomto prehliadači, nie na serveri).
const isDarkMode = () => { try { return localStorage.getItem('ana_dark') === '1'; } catch { return false; } };
function setDarkMode(on) {
  try { localStorage.setItem('ana_dark', on ? '1' : '0'); } catch {}
  document.documentElement.dataset.theme = on ? 'dark' : '';
}
setDarkMode(isDarkMode());
function applyTheme(t) {
  const st = document.documentElement.style;
  // Vlastný motív mení bočný panel a dekoratívny akcent; pevné farby obsahu (bordó, zlatá) zostávajú
  // nedotknuté – inak by vlastná voľba farby stratila kontrast textu.
  if (t && t.selection && t.selection.scheme === 'custom') { st.setProperty('--forest', t.selection.navigation); st.setProperty('--accent', t.selection.accent); }
  else { st.removeProperty('--forest'); st.removeProperty('--accent'); }
}
async function loadTheme(force) {
  if (THEME && !force) return THEME;
  try { THEME = await api('/admin/my-theme'); } catch { THEME = null; }
  try { localStorage.removeItem('ana_admin_theme'); } catch {}
  return THEME;
}
async function vAppearance(view) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam…</div>';
  const t = await loadTheme(true);
  if (!t) { view.innerHTML = '<div class="err">Vzhľad sa teraz nedá načítať. Skúste to znova.</div>'; return; }
  const custom = t.selection.scheme === 'custom';
  const forest = custom ? t.selection.navigation : THEME_DEFAULT.forest, gold = custom ? t.selection.accent : THEME_DEFAULT.gold;
  view.innerHTML = `<div class="card"><div class="card-h">Vzhľad administrácie</div><div class="card-b">
    <div id="tmsg"></div>
    <p class="muted">Východzí je zelený motív ANASTASIA. Vlastné farby sa uložia k vášmu účtu, takže ich uvidíte na každom zariadení.</p>
    <div class="row">
      <div><label>Hlavná (bočný panel)</label><input type="color" id="t-forest" value="${esc(forest)}"></div>
      <div><label>Akcent (zlatá)</label><input type="color" id="t-gold" value="${esc(gold)}"></div>
    </div>
    <label style="display:flex;gap:8px;align-items:center;margin-top:16px"><input type="checkbox" id="t-dark" ${isDarkMode() ? 'checked' : ''} style="width:auto"> Tmavý režim (uloží sa len v tomto prehliadači)</label>
    <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap"><button class="btn gold" id="t-save">Uložiť motív</button><button class="btn ghost" id="t-reset">Obnoviť ANASTASIA</button></div>
  </div></div>`;
  view.querySelector('#t-dark').onchange = (e) => setDarkMode(e.target.checked);
  const save = async (selection) => {
    const msg = view.querySelector('#tmsg'); msg.innerHTML = '';
    view.querySelectorAll('button').forEach(b => b.disabled = true);
    try { THEME = await api('/admin/my-theme', { method: 'POST', body: { selection, revision: THEME.revision } }); applyTheme(THEME); msg.innerHTML = '<div class="notice">Uložené.</div>'; }
    catch (e) { msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; await loadTheme(true); }
    finally { view.querySelectorAll('button').forEach(b => b.disabled = false); }
  };
  view.querySelector('#t-save').onclick = () => save({ ...THEME.selection, scheme: 'custom', navigation: view.querySelector('#t-forest').value.toLowerCase(), accent: view.querySelector('#t-gold').value.toLowerCase() });
  view.querySelector('#t-reset').onclick = async () => { await save({ ...THEME.selection, scheme: 'forest' }); view.querySelector('#t-forest').value = THEME_DEFAULT.forest; view.querySelector('#t-gold').value = THEME_DEFAULT.gold; };
}
async function refreshBadges() {
  // Počty v bočnom paneli len z jadra; keď sa nedajú načítať, počítadlo sa nezobrazí.
  const show = (k) => { const el = document.querySelector(`[data-badge="${k}"]`); if (el) { if (BADGES[k] > 0) { el.textContent = BADGES[k]; el.hidden = false; } else el.hidden = true; } };
  await Promise.all([
    api('/admin/orders?fulfillment_status[]=not_fulfilled&status[]=pending&status[]=completed&status[]=requires_action&limit=1').then(d => { BADGES.orders = d.count || 0; show('orders'); }).catch(() => {}),
    api('/admin/chat/conversations?status=open&limit=200').then(d => { BADGES.messages = d.unread || 0; show('messages'); }).catch(() => {}),
  ]);
}

// --- router ---
// Každý pohľad kreslí do čerstvého #view: neskoro dobehnutý starší pohľad (pomalé API) zapíše len do odpojeného
// uzla a neprepíše obrazovku, ktorú už používateľka otvorila (napr. rozpísaný formulár nového produktu).
// Pohľad otvorený zo staršej sekcie (napr. oneskorené prekreslenie po uložení, keď už je otvorená iná sekcia)
// dostane odpojený uzol a nič neprepíše.
function flash(sel, html) { const el = root.querySelector('#view ' + sel); if (el) el.innerHTML = html; }
function freshView(view) {
  let cur = view; while (cur && cur._next) cur = cur._next;
  if (!cur || !cur.isConnected) return document.createElement('div');
  const next = cur.cloneNode(false); cur._next = next; cur.replaceWith(next); return next;
}
let ROUTE_SEQ = 0;
async function route() {
  const seq = ++ROUTE_SEQ;
  if (TOUR_OPEN) TOUR_OPEN.close();
  const parts = (location.hash.replace(/^#\/?/, '') || '').split('/');
  if (parts[0] === 'pozvanka' && parts[1]) return renderInviteAccept(decodeURIComponent(parts[1]));
  if (!token) return renderLogin();
  const key = parts[0];
  const r = ROUTES[key] || ROUTES[''];
  root.innerHTML = shell(key in ROUTES ? key : '', r[0], r[1]);
  loadTheme().then(applyTheme);
  root.querySelector('#logout').onclick = () => { token = ''; localStorage.removeItem('ana_token'); renderLogin(); };
  wireMobileNav();
  loadMe().then(setUserChip);
  refreshBadges();
  wireCtxHelp();
  const view = root.querySelector('#view');
  try { await r[2](view); } catch (e) { if (e.message !== '401') view.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  applyPendingSearch(view);
  wireNotifyCard(view);
  wireShortcuts();
  // Úvodná prehliadka: pri prvom prihlásení (pre daný účet) alebo na vyžiadanie, až keď je Prehľad vykreslený.
  if (seq === ROUTE_SEQ && !(key in ROUTES && key !== '') && token) maybeStartTour();
}
// Prihlásenie a pozvánka: zelený panel so značkou (ako bočný panel adminu) + formulár na krémovom pozadí.
function authShell(form) {
  return `<div class="login">
    <aside class="login-side">${brandHtml()}<div><h2>Priestor pre vašu prácu.</h2><p>Objednávky, produkty, konzultácie aj správy od zákazníčok na jednom mieste.</p></div></aside>
    <main class="login-main">${form}</main>
  </div>`;
}
function renderLogin(msg) {
  root.innerHTML = authShell(`<form class="box" id="lf">
    <p class="eyebrow">Administrácia</p><h1>Prihlásenie</h1><p class="intro">Prihláste sa do svojho pracovného priestoru.</p>
    ${msg ? `<div class="err">${esc(msg)}</div>` : ''}
    <label for="l-email">E-mail</label><input id="l-email" type="email" value="admin@anastasia.local" autocomplete="username">
    <label for="l-pass">Heslo</label><input id="l-pass" type="password" autocomplete="current-password">
    <button class="btn primary" type="submit">Prihlásiť sa</button>
    <p class="api-note">Jadro: ${esc(API)}</p>
  </form>`);
  root.querySelector('#lf').onsubmit = async (e) => {
    e.preventDefault();
    try { await login(root.querySelector('#l-email').value, root.querySelector('#l-pass').value); location.hash = '#/'; route(); }
    catch (err) { renderLogin(err.message); }
  };
}
window.addEventListener('hashchange', route);
route();
