// ANASTASIA admin — vlastní SPA proti Medusa Admin API (NE Medusa /app).
// Vzhled dle backend/docs/wp/admin-design-preview.html. Slovensky. Theming tokeny v styles.css.
// Produkčný build (build.mjs) zapíše adresu jadra do <meta name="ana-api">; lokálne platí localStorage 'ana_api' alebo :9100.
const API = (document.querySelector('meta[name="ana-api"]')?.content || localStorage.getItem('ana_api') || 'http://localhost:9100').replace(/\/+$/, '');
const root = document.getElementById('root');
const $ = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };
const fmtEur = (a) => (a == null ? '—' : new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'eur' }).format(Number(a)));
const fmtDate = (d) => d ? new Date(d).toLocaleString('sk-SK', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
// Variabilný symbol prevodu: rok a číslo objednávky na 6 miest (10 číslic, zhodné s číslom faktúry bez písmen FA).
const orderVs = (o) => `${new Date(o?.created_at || Date.now()).getUTCFullYear()}${String(o?.display_id || '').replace(/\D/g, '').padStart(6, '0')}`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Krátky, čitateľný kód zákazníka (prvých 8 znakov ID) – rovnaký sa používa v celom administrácii.
const custCode = (id) => { const s = String(id ?? ''); return s.length > 12 ? `${s.slice(0, 10)}…` : s; };

import { qrAgenda, qrOtpSvg } from './qr.mjs';

import { TOUR, GUIDES, GUIDE_GROUPS, PAGE_HELP, PRODUCT_TAB_GUIDES, ORDER_TAB_GUIDES, SUPPORT_EMAIL } from './guide.mjs';
import { mountLibraryEditor } from './library-editor.mjs';
import { mountVariantsEditor } from './variants-editor.mjs';
import { openPrintWindow, fillPrintWindow, openPrintHtml, PRINT_FIELDS } from './print.mjs';
import { voucherHtml, voucherListHtml, VOUCHER_CSS } from './voucher.mjs';
import { contentPages, contentPage, wireContentPage } from './content.mjs';
import { securityView } from './security.mjs';
import { newsletterView } from './newsletter.mjs';
import { csvCell } from './csv.mjs';

// --- Rola administrátora: vlastník (všetko) alebo asistent (denná práca bez peňazí a rolí) ---
// Rolu číta server (GET /admin/nexus/admin-roles); klient si ju len zobrazuje.
// Ak trasa nie je nasadená, zostáva predvolené „vlastník“ – jadro aj tak odmietne zákaz.
let ADMIN_ROLE = 'owner';
let ADMIN_ROLE_LOADED = false;
const isOwner = () => ADMIN_ROLE === 'owner';
// Sekcie, ktoré asistent nevidí.
const OWNER_ONLY_SECTIONS = { poukazy: 'Poukazy a zľavy' };
async function loadAdminRole() {
  if (ADMIN_ROLE_LOADED) return;
  ADMIN_ROLE_LOADED = true;
  try {
    const data = await api('/admin/nexus/admin-roles');
    const id = data?.current_user_id || (ME && ME.id) || '';
    const me = (data?.admins || []).find(a => a.id === id);
    if (me?.role === 'assistant') ADMIN_ROLE = 'assistant';
  } catch (e) {
    if (e.message === '401') throw e;
    console.warn('[admin] rolu administrátora sa nepodarilo načítať:', e?.detail || e?.message);
  }
}

// --- API klient ---
let token = localStorage.getItem('ana_token') || '';
// Text chyby, ktorý uvidí používateľ – žiadne technické detaily (cesta, HTTP kód).
// Podrobnosti idú do konzoly, aby sa dali poslať podpore.
function friendlyError(status, serverMessage) {
  const text = String(serverMessage || '').trim();
  const looksTechnical = !text || /→|HTTP|\/admin\/|\/store\/|undefined|null|\{\s*"/i.test(text);
  if (!looksTechnical) return text.replace(/\bjadro\b/g, 'systém');
  if (status === 404) return 'Táto časť administrácie zatiaľ nie je dostupná. Skúte to neskôr alebo to oznámte podpore.';
  if (status === 403) return 'Na túto časť nemáte prístup.';
  if (status === 409) return 'Údaje sa medzitým zmenili. Načítajte stránku znova a skúste to znova.';
  if (status === 429) return 'Príliš veľa požiadaviek. Skúte to o chvíľu.';
  if (status >= 500) return 'Server momentálne neodpovedá. Skúte to o chvíľu.';
  return 'Nepodarilo sa načítať údaje. Skúte to znova.';
}
async function api(path, { method = 'GET', body } = {}) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(API + path, {
    method,
    headers: { ...(isForm ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  if (res.status === 401) { token = ''; localStorage.removeItem('ana_token'); renderLogin('Prihlásenie vypršalo.'); throw new Error('401'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = `${method} ${path} → ${res.status}`;
    console.warn('[admin] API chyba:', detail, data?.message || '');
    const err = new Error(friendlyError(res.status, data?.message));
    err.detail = detail;
    throw err;
  }
  return data;
}
async function login(email, password) {
  const res = await fetch(API + '/auth/user/emailpass', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d?.message || 'Prihlásenie zlyhalo.');
  // Pri zapnutom dvojfaktorovom overení jadro vráti výzvu na kód (nie chybu).
  if (d.mfa_required) return { challenge: d.mfa_challenge || {} };
  if (!d.token) throw new Error(d?.message || 'Prihlásenie zlyhalo.');
  token = d.token; localStorage.setItem('ana_token', token);
  return { token };
}
// Overenie kódu z aplikácie (alebo záložného kódu) po prihlásení.
async function verifyMfa(challengeId, code, method) {
  const res = await fetch(API + `/auth/mfa/challenges/${encodeURIComponent(challengeId)}/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method: method || 'totp', code: String(code || '').trim() }) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.token) throw new Error(d?.message || 'Kód sa nepodarilo overiť. Skúte to znova.');
  token = d.token; localStorage.setItem('ana_token', token);
  return d;
}

// --- tlač štítka a dodacieho listu ---
// Okno sa otvorí SYCHRÓNNE v kliknutí (prehliadač inak zablokuje pop-up),
// údaje objednávok sa načítajú až potom z /admin/orders?id[]=…&fields=PRINT_FIELDS.
// 'label' = adresný štítok A6, 'slip' = dodací list A4.
const PRINT_KIND = { label: 'Štítok', slip: 'Dodací list' };
// Faktúra (daňový doklad) alebo zálohová faktúra ako PDF. Okno sa otvorí hneď v kliknutí, PDF sa doplní po načítaní.
async function openInvoice(id) {
  const w = window.open('', '_blank');
  if (!w) { alert('Povoľte v prehliadači otváranie nových okien a skúste to znova.'); return; }
  w.document.title = 'Faktúra – ANASTASIA';
  w.document.body.innerHTML = '<p style="font:14px Arial;padding:24px">Pripravujem faktúru…</p>';
  try {
    const res = await fetch(API + '/admin/orders/' + encodeURIComponent(id) + '/invoice', { headers: token ? { authorization: 'Bearer ' + token } : {} });
    if (!res.ok) throw new Error('invoice');
    w.location.href = URL.createObjectURL(new Blob([await res.blob()], { type: 'application/pdf' }));
  } catch {
    w.document.body.innerHTML = '<p style="font:14px Arial;padding:24px">Faktúru sa nepodarilo vytvoriť. Skúste to znova.</p>';
  }
}
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
  search: '<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4.2-4.2"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 6.5-2.5 8-2.5 8h17S18 14.5 18 8"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  layers: '<path d="m12 3 9 4.5-9 4.5-9-4.5Z"/><path d="m3 13 9 4.5 9-4.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  chart: '<path d="M4 20V11 M10 20V5 M16 20v-6 M21 20V9"/><path d="M3 20h19"/>',
  tag: '<path d="M3 11V4h7l11 11-7 7Z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  leaf: '<path d="M5 19c0-8 6-13 14-14 1 8-4 14-11 14H5Z"/><path d="M5 19c3-4 6-6.5 9-7.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  box2: '<path d="m3 7 9-4 9 4-9 5Z M3 7v10l9 4 9-4V7 M12 12v9"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  photos: '<rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/><circle cx="8" cy="11" r="1.5"/><path d="m3 18 5-5 4 4 2-2 3 3"/>',
};
const navIcon = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const LOGO = './assets/lucia-logo.png';
// Web k administrácii: anastasia-test-admin.X → anastasia-test.X, admin.X → X.
const SITE_ORIGIN = `${location.protocol}//${location.hostname.replace(/-admin\./, '.').replace(/^admin\./, '')}`;
const brandHtml = (tag = 'div') => `<${tag} class="brand"${tag === 'a' ? ' href="#/"' : ''}><span class="brand-symbol" aria-hidden="true"></span><div><div class="brand-name">ANASTASIA</div><small>Light for the future</small></div></${tag}>`;

// --- dekor: jemné botanické kresby (olivová a levandulová vetvička) ako inline SVG ---
// Kresba je linková, v šalvějovej farbe s nízkou priehľadnosťou – žiadne stiahnuté fotky.
// Olivová vetvička vpravo hore v hlavičke: dve linkové vetvy s listami + klas levandule.
// Decorative crops of the user-approved reference; never used for interactive content.
const BOTANIC_OLIVE = '<span class="botanic botanic-olive" aria-hidden="true"></span>';
const BOTANIC_LAVENDER = '<span class="botanic botanic-lav" aria-hidden="true"></span>';
const LAVENDER_ART = '<span class="lavender-photo" aria-hidden="true"></span>';

const FLAG_SK = `<svg class="flag" viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" fill="#fff"/><rect y="5.34" width="24" height="5.33" fill="#0B4EA2"/><rect y="10.67" width="24" height="5.33" fill="#EE1C25"/><path d="M5.2 4.2h6.2v1.5H9.7v2.1h1.9v1.3H9.7v2.1h1.7v1.5H5.2v-1.5h1.8v-2.1H5.1V7.8h1.9V5.7H5.2Z" fill="#fff" stroke="#EE1C25" stroke-width=".45"/></svg>`;

// --- navigácia (štruktúra podľa schváleného návrhu admin-design-overview) ---
// ready:false = agenda je v admine, ale čaká na jadro → skrytá, kým sa nenapojí.
// group = skupina v bočnom paneli; položka bez skupiny stojí samostatne hore (Prehľad).
const NAV_GROUPS = [
  { k: 'obchod', label: 'OBCHOD' },
  { k: 'obsah', label: 'OBSAH' },
  { k: 'marketing', label: 'MARKETING' },
  { k: 'nastavenia', label: 'NASTAVENIA' },
];
const NAV = [
  { k: '', label: 'Prehľad', icon: 'home', ready: true },
  { k: 'objednavky', label: 'Objednávky', icon: 'bag', ready: true, badge: 'orders', group: 'obchod' },
  { k: 'produkty', label: 'Produkty', icon: 'box', ready: true, group: 'obchod' },
  { k: 'kategorie', label: 'Kategórie', icon: 'layers', ready: true, group: 'obchod' },
  { k: 'poukazy/2', label: 'Darčekové vouchery', icon: 'gift', ready: true, group: 'obchod' },
  { k: 'zakaznicky', label: 'Zákazníci', icon: 'users', ready: true, group: 'obchod' },
  { k: 'konzultacie', label: 'Konzultácie', icon: 'cal', ready: true, group: 'obchod' },
  { k: 'spravy', label: 'Správy', icon: 'chat', ready: true, badge: 'messages', group: 'obsah' },
  { k: 'obsah/2', label: 'Stránky a texty', icon: 'doc', ready: true, group: 'obsah' },
  { k: 'obsah/3', label: 'Médiá', icon: 'box', ready: true, group: 'obsah' },
  { k: 'ambasadori', label: 'Ambasádori', icon: 'star', ready: true, group: 'marketing' },
  { k: 'obsah/1', label: 'Newsletter', icon: 'mail', ready: true, group: 'marketing' },
  { k: 'poukazy', label: 'Zľavy a kupóny', icon: 'gift', ready: true, group: 'marketing' },
  { k: 'nastavenia/2', label: 'Doprava a platby', icon: 'bag', ready: true, group: 'nastavenia' },
  { k: 'nastavenia', label: 'Vzhľad a nastavenia', icon: 'cog', ready: true, group: 'nastavenia' },
  { k: 'nastavenia/4', label: 'Používatelia', icon: 'users', ready: true, group: 'nastavenia' },
  { k: 'nastavenia/1', label: 'Integrácie', icon: 'layers', ready: true, group: 'nastavenia' },
  { k: 'pomoc', label: 'Potrebujete poradiť?', icon: 'help', ready: true, group: 'nastavenia' },
];
let BADGES = {};

function shell(active, title, sub) {
  const cur = (k) => (location.hash.replace(/^#\/?/, '') || '') === k ? ' active" aria-current="page' : '';
  const item = (n) => `<a class="nav-item${cur(n.k)}" href="#/${n.k}">${navIcon(n.icon)}<span>${esc(n.label)}</span>${n.phase2 ? '<span class="nav-phase">Fáza 2</span>' : ''}${n.badge ? `<span class="counter" data-badge="${n.badge}" ${BADGES[n.badge] ? '' : 'hidden'}>${BADGES[n.badge] || ''}</span>` : ''}</a>`;
  const visible = NAV.filter(n => n.ready && (isOwner() || !OWNER_ONLY_SECTIONS[n.k.split('/')[0]]));
  const top = visible.filter(n => !n.group).map(item).join('');
  const groups = NAV_GROUPS.map(g => {
    const its = visible.filter(n => n.group === g.k);
    if (!its.length) return '';
    return `<div class="nav-group"><div class="nav-title">${g.label}</div>${its.map(item).join('')}</div>`;
  }).join('');
  const crumb = active === '' ? 'Prehľad' : (title || '');
  // Prehľad: dátum + pozdrav (meno dopĺňa setUserChip z /admin/users/me); ostatné agendy: názov a popis z ROUTES.
  const d = new Date();
  const today = `${d.toLocaleDateString('sk-SK', { weekday: 'long' })}, ${d.toLocaleDateString('sk-SK', { day: 'numeric', month: 'long' })} ${d.getFullYear()}`.toLocaleUpperCase('sk-SK');
  // Pomoc na stránke: tlačidlo „Ako to funguje“ pri nadpise + skrytý panel s vysvetlením (obsah z guide.mjs).
  const helpBtn = PAGE_HELP[active] ? `<button type="button" class="help-toggle" id="ctx-help-btn" aria-expanded="false" aria-controls="ctx-help">${navIcon('help')}<span>Ako to funguje</span></button>` : '';
  const rangeSet = `<div class="select-box select-cal">
      <svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS.cal}</svg>
      <select class="rc-select" id="dash-range" aria-label="Výber obdobia">
        <option value="7">Posledných 7 dní</option>
        <option value="30" selected>Posledných 30 dní</option>
        <option value="90">Posledných 90 dní</option>
      </select>
    </div>`;
  const head = active === ''
    ? `<p class="eyebrow">${esc(today)}</p>
       <div class="heading dash-head">
         <div class="dash-title">
           <h1 id="greet">Dobrý deň.</h1>
           <p class="intro">Tu je prehľad vášho obchodu. Spolu tvoríme viac svetla pre ľudí.</p>
         </div>
         <div class="dash-meta">
           <blockquote class="quote">„Cesta k sebe<br>začína vnímaním.“</blockquote>
           <div class="range-pick">${rangeSet}</div>
         </div>
       </div>`
    : `<p class="eyebrow">Váš obchod</p><div class="heading"><div><h1>${esc(title)}</h1>${sub ? `<p class="intro">${esc(sub)}</p>` : ''}</div><div class="head-actions">${helpBtn}<div id="actions"></div></div></div>`;
  return `<div class="app${active === '' ? ' is-dashboard' : ''}">
    <aside class="sidebar" id="sidebar" aria-label="Hlavná navigácia">
      ${brandHtml('a')}
      <nav class="nav">
        <div class="nav-top">${top}</div>
        ${groups}
      </nav>
      <a class="side-promo" href="${SITE_ORIGIN}/" target="_blank" rel="noopener" title="Otvoriť web v novom okne">
        <span class="side-promo-art">${LAVENDER_ART}</span>
        <span class="side-promo-txt"><b>ANASTASIA</b><small>Zobraziť web</small></span>
        <span class="side-promo-arrow">${navIcon('arrow')}</span>
      </a>
    </aside>
    <div class="scrim" id="scrim"></div>
    <div class="workspace">
      <header class="topbar">
        ${BOTANIC_OLIVE}
        <div class="mobile-head"><button type="button" id="nav-toggle" aria-label="Otvoriť navigáciu" aria-expanded="false" aria-controls="sidebar">${navIcon('menu')}</button><span class="brand-symbol" aria-hidden="true"></span><span>ANASTASIA</span></div>
        <div class="top-search">
          ${navIcon('search')}
          <input type="search" id="side-q" placeholder="Hľadať produkty, objednávky, zákazníkov…" aria-label="Hľadať v celom obchode" autocomplete="off">
          <kbd class="kbd" id="search-kbd" title="Hľadať (⌘K)">⌘ K</kbd>
          <div class="side-results" id="side-results" hidden></div>
        </div>
        <div class="top-actions">
          <div class="dd" id="dd-lang">
            <button type="button" class="top-btn lang-btn" data-dd="lang" aria-haspopup="true" aria-expanded="false" aria-label="Jazyk rozhrania">${FLAG_SK}<span>SK</span>${navIcon('chev')}</button>
            <div class="dd-menu" data-menu="lang">
              <button type="button" class="dd-item is-on">${FLAG_SK}Slovenčina</button>
              <button type="button" class="dd-item" disabled>English — pripravujeme</button>
              <button type="button" class="dd-item" disabled>Русский — приготовляем</button>
            </div>
          </div>
          <div class="dd" id="dd-bell">
            <button type="button" class="top-btn icon" data-dd="bell" aria-label="Upozornenia" aria-haspopup="true" aria-expanded="false">${navIcon('bell')}<span class="dot" id="bell-dot" hidden></span></button>
            <div class="dd-menu wide" data-menu="bell"><div class="dd-body" id="bell-body"><p class="side-empty">Načítavam…</p></div></div>
          </div>
          <div class="dd" id="dd-user">
            <button type="button" class="user-btn" data-dd="user" aria-haspopup="true" aria-expanded="false">
              <span class="avatar" id="uava" aria-hidden="true"></span>
              <span class="user-txt"><strong id="uname">Váš účet</strong><small>Administrátor</small></span>
              ${navIcon('chev')}
            </button>
            <div class="dd-menu" data-menu="user">
              <button type="button" class="dd-item" id="logout-all">Odhlásiť všade</button>
              <button type="button" class="dd-item" id="logout">${navIcon('out')}Odhlásiť sa</button>
            </div>
          </div>
        </div>
      </header>
      <main class="content" id="main">
        ${BOTANIC_LAVENDER}
        ${active ? `<p class="crumb">Váš obchod / ${esc(crumb)}</p>` : ''}
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

// --- horná lišta: rozbalovacie menu, zvoneček s upozorneniami a skratka ⌘K ---
let BELL = null;            // posledné načítané upozornenia (pre zvoneček)
let DOC_WIRED = false;      // posluchače dokumentu pripájam len raz
const closeMenus = () => root.querySelectorAll('.dd.open').forEach(d => {
  d.classList.remove('open');
  d.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', 'false');
});
function wireTopbar() {
  root.querySelectorAll('[data-dd]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const dd = btn.closest('.dd');
      const open = dd.classList.contains('open');
      closeMenus();
      if (!open) {
        dd.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
        if (btn.dataset.dd === 'bell') loadBellMenu();
      }
    };
  });
  root.querySelectorAll('.dd-menu').forEach(m => m.addEventListener('click', (e) => e.stopPropagation()));
  const kbd = root.querySelector('#search-kbd');
  if (kbd) kbd.onclick = () => { const s = root.querySelector('#side-q'); if (s) { s.focus(); s.select?.(); } };
  if (!DOC_WIRED) {
    DOC_WIRED = true;
    document.addEventListener('click', closeMenus);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });
  }
}
// Obsah rozbalovacieho menu zvonečka: rovnaké údaje ako panel Notifikácie na Prehľade.
async function loadBellMenu() {
  const body = root.querySelector('#bell-body');
  if (!body) return;
  if (!BELL) {
    body.innerHTML = '<p class="side-empty">Načítavam…</p>';
    const soft = (p) => api(p).catch(e => { if (e.message === '401') throw e; return null; });
    const [o, c, inv, prod] = await Promise.all([
      soft('/admin/orders?limit=5&order=-created_at&fields=id,display_id,created_at,payment_status,fulfillment_status,status'),
      soft('/admin/chat/conversations?status=open&limit=5'),
      soft('/admin/inventory-items?limit=200&fields=id,sku,*location_levels'),
      soft('/admin/products?limit=100&fields=id,title,*variants.sku'),
    ]);
    const unread = Number(c?.unread) || 0;
    const notif = [];
    for (const x of (o?.orders || []).slice(0, 3)) notif.push({ icon: 'bag', tone: 'lav', title: `Nová objednávka #${x.display_id ?? ''}`, time: x.created_at, href: '#/objednavky' });
    if (unread > 0) notif.push({ icon: 'chat', tone: 'lav', title: `${unread} neprečítaných správ`, time: null, href: '#/spravy' });
    for (const s of lowStockFrom(inv?.inventory_items || [], prod?.products || []).slice(0, 2)) notif.push({ icon: 'box2', tone: 'warn', title: `Nízky sklad: ${s.title} (${s.stock} ks)`, time: null, href: '#/produkty' });
    BELL = { notif, unread, toFulfill: BADGES.orders || 0 };
  }
  const perm = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  body.innerHTML = notifHtml(BELL.notif, 0) + (perm && perm !== 'granted' && perm !== 'unsupported'
    ? '<button type="button" class="btn ghost sm" id="notify-on" style="margin-top:10px;width:100%">Zapnúť upozornenia v prehliadači</button>' : '');
  const on = body.querySelector('#notify-on');
  if (on) on.onclick = async () => {
    try { const p = await Notification.requestPermission(); if (p === 'granted') { startNotifyPolling(); on.remove(); } }
    catch { /* prehliadač nepodporuje */ }
  };
}

// --- aktuálne prihlásená obsluha (pre pozdrav + avatar) ---
let ME = null;
async function loadMe() { if (ME) return ME; try { ME = (await api('/admin/users/me?fields=id,first_name,last_name,email,metadata')).user || null; } catch { ME = null; } return ME; }
// Všeobecné prezývky, ktoré nie sú krstné meno – pozdrav bez mena („Dobrý deň.“).
const GENERIC_NAMES = new Set(['ceo', 'admin', 'administrator', 'root', 'test', 'user', 'lcode', 'l-code', 'anastasia']);
function meName() {
  const m = ME || {};
  const ok = (v) => { const s = (v || '').trim(); return s && !GENERIC_NAMES.has(s.toLowerCase()) ? s : ''; };
  return ok(m.first_name) || ok(m.last_name);
}
function meInitials() {
  const m = ME || {};
  const fl = [m.first_name, m.last_name].map(s => (s || '').trim()).filter(Boolean);
  if (fl.length >= 2) return (fl[0][0] + fl[1][0]).toUpperCase();
  const n = meName();
  return n ? n.slice(0, 2).toUpperCase() : 'A';
}
function setUserChip() {
  const name = meName(); const nm = document.querySelector('#uname'); const av = document.querySelector('#uava'); const gr = document.querySelector('#greet');
  if (nm) nm.textContent = name || 'Váš účet';
  if (av) {
    const avatar = ME?.metadata?.avatar_url === '/assets/lucia.webp'
      || (location.hostname === 'anastasia-test-admin.l-code-dynamics.com' && ADMIN_ROLE === 'owner')
      ? '/assets/lucia.webp' : '';
    av.textContent = avatar ? '' : meInitials();
    av.style.backgroundImage = avatar ? `url("${avatar.replace(/["\\\\]/g, '')}")` : '';
    av.classList.toggle('has-photo', !!avatar);
  }
  if (gr) gr.textContent = name ? `Dobrý deň, ${name}.` : 'Dobrý deň.';
}

// --- views ---
// --- Prehľad: obdobie, metrika a granularita grafu ---
// DASH_RANGE = koľko dní sa pozeráme späť (7 / 30 / 90); DASH_METRIC = čo sa kreslí.
let DASH_RANGE = 30;
let DASH_METRIC = 'revenue';   // revenue = tržby, orders = počet objednávok
let DASH_GRAN = 'day';         // day = denne, week = týždenne

const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const dayLabel = (d) => new Date(d).toLocaleDateString('sk-SK', { day: '2-digit', month: '2-digit' });
const money0 = (v) => new Intl.NumberFormat('sk-SK', { maximumFractionDigits: 0 }).format(Math.round(Number(v) || 0));
const initialsOf = (name) => (String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('') || '').toUpperCase() || '–';
// Koľko času uplynulo od dátumu (na upozornenia).
const ago = (d) => {
  if (!d) return 'nedávno';
  const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  if (m < 1) return 'pred chvíľou';
  if (m < 60) return `pred ${m} minútami`;
  const h = Math.round(m / 60);
  if (h < 24) return `pred ${h} hodinami`;
  const dd = Math.round(h / 24);
  return dd === 1 ? 'pred 1 dňom' : `pred ${dd} dňami`;
};
const isPaidOrder = (o) => ['captured', 'paid', 'partially_captured'].includes(o.payment_status);
const isShipped = (o) => ['shipped', 'partially_shipped', 'delivered'].includes(o.fulfillment_status);
// Stav objednávky pre tabuľku: Zaplatené (zelená), Odoslané (fialová), Spracovanie (oranžová).
const orderState = (o) => {
  if (isShipped(o)) return ['Odoslané', 'lav'];
  const paid = isPaidOrder(o);
  if (paid && ['fulfilled', 'partially_fulfilled'].includes(o.fulfillment_status)) return ['Zaplatené', 'ok'];
  if (paid) return ['Spracovanie', 'warn'];
  if (['fulfilled', 'partially_fulfilled'].includes(o.fulfillment_status)) return ['Spracovanie', 'warn'];
  return ['Čaká na platbu', 'off'];
};
const lowStockFrom = (inventory, products) => {
  const titleBySku = new Map(products.flatMap(p => (p.variants || []).map(v => [v.sku, p.title])));
  return inventory
    .map(i => ({ sku: i.sku, title: titleBySku.get(i.sku) || i.sku, stock: (i.location_levels || []).reduce((a, l) => a + Number(l.stocked_quantity || 0), 0) }))
    .filter(x => x.stock <= 5).sort((a, b) => a.stock - b.stock);
};
// Percentuálna zmena oproti predchádzajúcemu obdobiu; bez porovnateľných údajov sa % nezobrazí.
const deltaOf = (cur, prev) => {
  if (!prev) return null;
  const p = ((cur - prev) / Math.abs(prev)) * 100;
  if (!isFinite(p)) return null;
  return { up: p >= 0, text: `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(1).replace('.', ',')} %` };
};
const niceMax = (v) => {
  if (!v || v <= 0) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const s = v / p;
  const m = s <= 1 ? 1 : s <= 2 ? 2 : s <= 2.5 ? 2.5 : s <= 5 ? 5 : 10;
  return m * p;
};
// Hladká krivka (Catmull-Rom → kubické Bézier) pre sparkline aj graf.
const smoothPath = (pts) => {
  if (!pts.length) return '';
  if (pts.length < 3) return `M${pts.map(p => `${p[0]} ${p[1]}`).join(' L')}`;
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
};
// Sparkline pre KPI kartu: plynulá vyplnená křivka (levanduľová / šalvějová).
const sparkSvg = (values, color, id = 'sp') => {
  if (!values || values.length < 2) return '';
  const w = 84, h = 30, max = Math.max(...values, 1);
  const pts = values.map((v, i) => [((i / (values.length - 1)) * w), h - (v / max) * (h - 5) - 2.5]);
  const line = smoothPath(pts);
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity=".30"/><stop offset="100%" stop-color="${color}" stop-opacity=".02"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#${id}g)"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
};
// Graf vývoja: stĺpce (levanduľové) + zelená hladká křivka s bodmi, osa v € (čisté inline SVG).
function chartSvg(series, money = true) {
  const W = 660, H = 200, L = 56, R = 12, T = 14, B = 28;
  const iw = W - L - R, ih = H - T - B;
  const max = niceMax(Math.max(...series.map(s => s.value), 0));
  const n = series.length;
  const step = n > 1 ? iw / (n - 1) : iw;
  const bw = Math.max(3, Math.min(18, (iw / Math.max(n, 1)) * 0.5));
  const X = (i) => L + (n > 1 ? i * step : iw / 2);
  const Y = (v) => T + ih - (v / max) * ih;
  const grid = [0, 1 / 3, 2 / 3, 1].map(f => {
    const yy = T + ih - f * ih, val = max * f;
    return `<line class="ch-grid" x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}" stroke-width="1"/>` +
      `<text class="ch-lbl" x="${L - 9}" y="${(yy + 4).toFixed(1)}" text-anchor="end">${money ? `${money0(val)} €` : money0(val)}</text>`;
  }).join('');
  const bars = series.map((s, i) => {
    const h = s.value > 0 ? Math.max(2, (s.value / max) * ih) : 0;
    if (!h) return '';
    return `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${(T + ih - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(4, bw / 2).toFixed(1)}" fill="#D9CCEB"/>`;
  }).join('');
  const pts = series.map((s, i) => [X(i), Y(s.value)]);
  const line = smoothPath(pts);
  const dots = (n <= 32 ? pts : [pts[pts.length - 1]])
    .map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.8" fill="#fff" stroke="#6F8A5E" stroke-width="1.8"/>`).join('');
  const stepL = Math.max(1, Math.ceil(n / 6));
  const labels = series.map((s, i) => (i % stepL === 0 || i === n - 1)
    ? `<text class="ch-lbl" x="${X(i).toFixed(1)}" y="${H - 9}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${esc(s.label)}</text>` : '').join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Vývoj tržieb">${grid}${bars}
    <path d="${line}" fill="none" stroke="#6F8A5E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>${dots}${labels}</svg>`;
}
// Donut s rozdelením objednávok podľa kategórií.
function donutSvg(slices, top, bottom) {
  const r = 54, C = 2 * Math.PI * r;
  const total = slices.reduce((a, s) => a + s.value, 0);
  let off = 0;
  const arcs = slices.map(s => {
    const len = total ? (C * s.value) / total : 0;
    const el = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${s.color}" stroke-width="20" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 70 70)"/>`;
    off += len; return el;
  }).join('');
  return `<svg class="donut" viewBox="0 0 140 140" role="img" aria-label="Podiel objednávok podľa kategórií">${arcs}
    <text class="dn-n" x="70" y="66" text-anchor="middle">${esc(top)}</text>
    <text class="dn-l" x="70" y="86" text-anchor="middle">${esc(bottom)}</text></svg>`;
}
// Zoznam upozornení (nové objednávky, zákazníci, nízky sklad, správy) – z reálnych dát.
const notifHtml = (list, limit = 0) => {
  const items = limit ? list.slice(0, limit) : list;
  if (!items.length) return '<p class="side-empty">Zatiaľ nič netreba riešiť. Obchod je pokojný.</p>';
  return `<ul class="notif">${items.map(n => {
    const inner = `<span class="notif-ic ${n.tone}">${navIcon(n.icon)}</span><span class="notif-txt"><b>${esc(n.title)}</b><small>${esc(ago(n.time))}</small></span>`;
    if (n.expand) return `<li${n.tour ? ` data-tour="${esc(n.tour)}"` : ''}><details><summary>${inner}</summary><div class="notif-detail">${n.expand}</div></details></li>`;
    return `<li${n.tour ? ` data-tour="${esc(n.tour)}"` : ''}>${n.href ? `<a class="notif-link" href="${esc(n.href)}">${inner}</a>` : inner}</li>`;
  }).join('')}</ul>`;
};

async function vDashboard(view) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam…</div>';
  setActions('');
  const soft = (p) => api(p).catch(e => { if (e.message === '401') throw e; return null; });
  await loadMe(); setUserChip();
  // Všetky čísla v prehľade pochádzajú z jadra – žiadne vymyšlené hodnoty.
  const [ordersRes, custRes, prodRes, catRes, invRes, chatRes, bookRes, readiness] = await Promise.all([
    soft('/admin/orders?limit=500&order=-created_at&fields=id,display_id,status,payment_status,fulfillment_status,created_at,total,email,customer_id,*items,*customer,*shipping_address'),
    soft('/admin/customers?limit=500&fields=id,email,first_name,last_name,created_at'),
    soft('/admin/products?limit=200&fields=id,title,thumbnail,*variants.prices,*variants.sku,*categories'),
    soft('/admin/product-categories?limit=100&fields=id,name,handle,is_active,*products.id'),
    soft('/admin/inventory-items?limit=500&fields=id,sku,*location_levels'),
    soft('/admin/chat/conversations?status=open&limit=50'),
    soft('/admin/bookings?status=confirmed&limit=200'),
    soft('/admin/readiness'),
  ]);
  const orders = ordersRes?.orders || [];
  const customers = custRes?.customers || [];
  const products = prodRes?.products || [];
  const categories = catRes?.product_categories || [];
  const inventory = invRes?.inventory_items || [];
  const unread = Number(chatRes?.unread) || 0;

  // --- obdobia: aktuálne a porovnávacie (rovnaká dĺžka bezprostredne predtým) ---
  const now = Date.now(), days = DASH_RANGE;
  const from = now - days * 86400000, prevFrom = now - 2 * days * 86400000;
  const inRange = (d) => { const t = new Date(d).getTime(); return t >= from && t <= now; };
  const inPrev = (d) => { const t = new Date(d).getTime(); return t >= prevFrom && t < from; };
  const rangeOrders = orders.filter(o => inRange(o.created_at));
  const prevOrders = orders.filter(o => inPrev(o.created_at));
  const paidIn = rangeOrders.filter(isPaidOrder);
  const paidPrev = prevOrders.filter(isPaidOrder);
  const revenue = paidIn.reduce((a, o) => a + Number(o.total || 0), 0);
  const prevRevenue = paidPrev.reduce((a, o) => a + Number(o.total || 0), 0);
  const avg = paidIn.length ? revenue / paidIn.length : 0;
  const prevAvg = paidPrev.length ? prevRevenue / paidPrev.length : 0;
  const newCustomers = customers.filter(c => inRange(c.created_at)).length;
  const prevCustomers = customers.filter(c => inPrev(c.created_at)).length;

  // --- rady po dňoch (na graf a sparkline) ---
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) { const d = new Date(now - i * 86400000); buckets.push({ d, key: dayKey(d), revenue: 0, orders: 0 }); }
  const bidx = new Map(buckets.map((b, i) => [b.key, i]));
  for (const o of orders) {
    const i = bidx.get(dayKey(o.created_at));
    if (i === undefined) continue;
    buckets[i].orders += 1;
    if (isPaidOrder(o)) buckets[i].revenue += Number(o.total || 0);
  }
  let series = buckets.map(b => ({ label: dayLabel(b.d), value: DASH_METRIC === 'revenue' ? b.revenue : b.orders }));
  if (DASH_GRAN === 'week') {
    const w = [];
    for (let i = 0; i < series.length; i += 7) {
      const chunk = series.slice(i, i + 7);
      w.push({ label: chunk[0]?.label || '', value: chunk.reduce((a, x) => a + x.value, 0) });
    }
    series = w;
  }
  const sparkRevenue = buckets.map(b => b.revenue);
  const sparkOrders = buckets.map(b => b.orders);
  const sparkCustomers = buckets.map(b => {
    const s = new Date(b.d); s.setHours(0, 0, 0, 0);
    const e = s.getTime() + 86400000;
    return customers.filter(c => { const t = new Date(c.created_at).getTime(); return t >= s.getTime() && t < e; }).length;
  });

  // --- kategórie: objednávky podľa kategórií (donut) ---
  const catName = new Map(categories.map(c => [c.id, c.name]));
  const prodCat = new Map();
  for (const p of products) {
    const cs = (p.categories || []).map(c => c.id || c).filter(Boolean);
    if (cs.length) prodCat.set(p.id, catName.get(cs[0]) || 'Ostatné');
  }
  const catQty = new Map();
  for (const o of rangeOrders) for (const it of (o.items || [])) {
    const nm = prodCat.get(it.product_id) || 'Ostatné';
    catQty.set(nm, (catQty.get(nm) || 0) + Number(it.quantity || 0));
  }
  const DONUT_COLORS = ['#B9A3D6', '#8FA67E', '#D9CCEB', '#7E63A8'];
  let donut = [...catQty.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  if (donut.length > 4) donut = [...donut.slice(0, 4), { label: 'Ostatné', value: donut.slice(4).reduce((a, x) => a + x.value, 0) }];
  donut = donut.map((s, i) => ({ ...s, color: DONUT_COLORS[i % DONUT_COLORS.length] }));
  const catTotal = donut.reduce((a, s) => a + s.value, 0);

  // --- posledné objednávky (tabuľka) ---
  const recent = [...orders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
  const custName = (o) => [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(' ')
    || [o.shipping_address?.first_name, o.shipping_address?.last_name].filter(Boolean).join(' ')
    || o.email || 'Neznámy';
  const recentRows = recent.map(o => {
    const items = o.items || [], first = items[0];
    const nm = custName(o);
    const [st, stTone] = orderState(o);
    return `<tr data-oid="${esc(o.id)}">
      <td class="muted-cell">#${esc(o.display_id ?? o.id ?? '')}</td>
      <td><div class="cust-cell"><span class="avatar">${esc(initialsOf(nm))}</span><b>${esc(nm)}</b></div></td>
      <td><div class="prod-cell">${first?.thumbnail ? `<img class="thumb" src="${esc(first.thumbnail)}" alt="" loading="lazy">` : '<span class="thumb ph"></span>'}<span>${esc(first?.title || first?.product_title || '—')}${items.length > 1 ? ` <span class="muted">+${items.length - 1}</span>` : ''}</span></div></td>
      <td class="sum">${fmtEur(o.total)}</td>
      <td><span class="state ${stTone}">${esc(st)}</span></td>
      <td class="muted-cell">${esc(new Date(o.created_at).toLocaleDateString('sk-SK'))}</td>
      <td><button type="button" class="dots-btn" aria-label="Viac možností">⋮</button></td>
    </tr>`;
  }).join('');

  // --- najpredávanejšie produkty ---
  const prodById = new Map(products.map(p => [p.id, p]));
  const topMap = new Map();
  for (const o of rangeOrders) for (const it of (o.items || [])) {
    const key = it.product_id || it.title || it.id;
    const cur = topMap.get(key) || { title: it.title || it.product_title || '—', thumb: it.thumbnail || '', qty: 0, sum: 0, price: null };
    cur.qty += Number(it.quantity || 0);
    cur.sum += Number(it.total || 0);
    const p = prodById.get(it.product_id);
    if (p) { if (!cur.thumb && p.thumbnail) cur.thumb = p.thumbnail; if (cur.price == null) cur.price = basePrice(p.variants?.[0])?.amount ?? null; }
    topMap.set(key, cur);
  }
  const top = [...topMap.values()].sort((a, b) => b.qty - a.qty || b.sum - a.sum).slice(0, 5);

  // --- nízky sklad, konzultácie, pripravenosť a upozornenia ---
  const lowStock = lowStockFrom(inventory, products).slice(0, 5);
  // Dnešné konzultácie (potvrdené rezervácie) – rovnaký zdroj ako Predchádzajúci prehľad.
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
  const todayBookings = Array.isArray(bookRes?.bookings)
    ? bookRes.bookings.filter(b => { const t = new Date(b.starts_at); return t >= dayStart && t < dayEnd; }).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
    : [];
  const notif = [];
  for (const o of rangeOrders.slice(0, 3)) notif.push({ icon: 'bag', tone: 'rose', title: `Nová objednávka #${o.display_id ?? ''}`, time: o.created_at, href: '#/objednavky' });
  for (const c of customers.filter(c => inRange(c.created_at)).slice(0, 2)) {
    const nm = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'zákazník';
    notif.push({ icon: 'user', tone: 'sage', title: `Nový zákazník ${nm}`, time: c.created_at, href: '#/zakaznicky' });
  }
  for (const s of lowStock.slice(0, 2)) notif.push({ icon: 'box2', tone: 'gold', title: `Nízky sklad: ${s.title} (${s.stock} ks)`, time: null, href: '#/produkty' });
  if (unread > 0) notif.push({ icon: 'mail', tone: 'sage', title: `${unread} neprečítaných správ`, time: null, href: '#/spravy' });
  for (const b of todayBookings.slice(0, 2)) {
    const at = new Date(b.starts_at).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
    notif.push({ icon: 'cal', tone: 'lav', title: `Konzultácia dnes o ${at}`, time: b.starts_at, href: '#/konzultacie' });
  }
  if (readiness && Array.isArray(readiness.checks)) {
    const ok = readiness.checks.filter(c => c.status === 'ok').length;
    const openChecks = readiness.checks.filter(c => c.status !== 'ok');
    const pillOf = (c) => c.status === 'unknown' ? '<span class="pill off">nedá sa overiť</span>' : c.severity === 'blocker' ? '<span class="pill off">bráni predaju</span>' : '<span class="pill warn">odporúčame doplniť</span>';
    notif.push({
      icon: openChecks.length ? 'help' : 'check', tone: openChecks.length ? 'warn' : 'sage',
      title: openChecks.length ? `Pripravenosť obchodu: ${openChecks.length} ${openChecks.length === 1 ? 'vec treba' : 'veci treba'} doplniť` : `Pripravenosť obchodu: všetko v poriadku (${ok}/${readiness.checks.length})`,
      time: null, href: null, tour: openChecks.length ? 'readiness' : null,
      expand: openChecks.length ? `<ul>${openChecks.map(c => `<li><b>${esc(c.title)}</b> ${pillOf(c)}<p>${esc(c.hint || '')}</p>${c.href ? `<a class="link-lav" href="${esc(c.href)}">Vyriešiť →</a>` : ''}</li>`).join('')}</ul>` : '',
    });
  }
  notif.sort((a, b) => (b.time ? new Date(b.time).getTime() : 0) - (a.time ? new Date(a.time).getTime() : 0));
  BELL = { notif, unread, toFulfill: BADGES.orders || 0 };

  // --- KPI karty ---
  const kpi = [
    { label: 'Tržby', value: fmtEur(revenue), icon: 'chart', tone: 'lav', d: deltaOf(revenue, prevRevenue), spark: sparkSvg(sparkRevenue, '#B9A3D6', 'sp0'), note: `zaplatené za ${days} dní` },
    { label: 'Objednávky', value: String(rangeOrders.length), icon: 'bag', tone: 'sage', d: deltaOf(rangeOrders.length, prevOrders.length), spark: sparkSvg(sparkOrders, '#8FA67E', 'sp1'), note: `prijatých za ${days} dní` },
    { label: 'Noví zákazníci', value: String(newCustomers), icon: 'users', tone: 'sage', d: deltaOf(newCustomers, prevCustomers), spark: sparkSvg(sparkCustomers, '#8FA67E', 'sp2'), note: `nových účtov za ${days} dní` },
    { label: 'Priemerná hodnota objednávky', value: fmtEur(avg), icon: 'tag', tone: 'lav', d: deltaOf(avg, prevAvg), spark: '', note: paidIn.length ? `z ${paidIn.length} zaplatených objednávok` : 'zatiaľ bez zaplatených objednávok' },
  ];
  const kpiHtml = kpi.map(k => `<article class="kpi">
    <div class="kpi-label">${esc(k.label)}</div>
    <span class="kpi-ic ${k.tone}">${navIcon(k.icon)}</span>
    <div class="kpi-value">${esc(k.value)}</div>
    <div class="kpi-foot">
      <span class="kpi-delta">${k.d ? `<b class="${k.d.up ? '' : 'down'}">${k.d.up ? '↑' : '↓'} ${esc(k.d.text)}</b><small>oproti minulému obdobiu</small>` : `<small>${esc(k.note)}</small>`}</span>
      ${k.spark || ''}
    </div>
  </article>`).join('');

  // --- bannery (reálne čísla) ---
  const prodCount = Number(prodRes?.count) || products.length;
  const catCount = Number(catRes?.count) || categories.length;
  const catProducts = new Map(categories.map(c => [c.id, []]));
  for (const p of products) for (const c of (p.categories || [])) {
    const id = c.id || c;
    if (!catProducts.has(id)) catProducts.set(id, []);
    if (p.thumbnail && !catProducts.get(id).includes(p.thumbnail)) catProducts.get(id).push(p.thumbnail);
  }
  const catList = categories.slice(0, 4).map(c => ({
    id: c.id,
    name: c.name || '',
    images: catProducts.get(c.id) || [],
  }));

  view.innerHTML = `<div class="dash">
    <div class="dash-main">
      <div class="kpis" data-tour="stats">${kpiHtml}</div>
      <div class="dash-row">
        <section class="dash-card">
          <div class="dash-card-head">
            <h2>Vývoj tržieb</h2>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <div class="select-box">
                <select class="rc-select" id="chart-metric" aria-label="Čo zobraziť">
                  <option value="revenue"${DASH_METRIC === 'revenue' ? ' selected' : ''}>Tržby</option>
                  <option value="orders"${DASH_METRIC === 'orders' ? ' selected' : ''}>Objednávky</option>
                </select>
              </div>
              <div class="select-box">
                <select class="rc-select" id="chart-gran" aria-label="Granularita">
                  <option value="day"${DASH_GRAN === 'day' ? ' selected' : ''}>Denne</option>
                  <option value="week"${DASH_GRAN === 'week' ? ' selected' : ''}>Týždenne</option>
                </select>
              </div>
            </div>
          </div>
          <div class="dash-card-body">${chartSvg(series, DASH_METRIC === 'revenue')}</div>
        </section>
        <section class="dash-card">
          <div class="dash-card-head"><h2>Objednávky podľa kategórií</h2></div>
          <div class="dash-card-body">
            ${donut.length ? `<div class="donut-wrap">${donutSvg(donut, String(rangeOrders.length), 'objednávok')}
              <div class="legend">${donut.map(s => `<div class="legend-row"><span class="legend-dot" style="background:${s.color}"></span><span class="legend-name" title="${esc(s.label)}">${esc(s.label)}</span><span class="n">${catTotal ? Math.round((s.value / catTotal) * 100) : 0}%</span></div>`).join('')}</div>
            </div>` : '<p class="side-empty">Zatiaľ nemáme objednávky na rozdeliť.</p>'}
          </div>
        </section>
      </div>
      <div class="dash-row">
        <section class="dash-card">
          <div class="dash-card-head"><h2>Posledné objednávky</h2><a class="link-lav" href="#/objednavky">Zobraziť všetky →</a></div>
          <table class="dash-table"><thead><tr><th>#</th><th>Zákazník</th><th>Produkty</th><th>Suma</th><th>Stav</th><th>Dátum</th><th></th></tr></thead>
            <tbody>${recentRows || '<tr><td colspan="7" class="side-empty">Zatiaľ žiadne objednávky.</td></tr>'}</tbody></table>
        </section>
        <section class="dash-card">
          <div class="dash-card-head"><h2>Najpredávanejšie produkty</h2>
            <div class="select-box">
              <select class="rc-select" id="top-range" aria-label="Obdobie pre najpredávanejšie produkty">
                <option value="7">Posledných 7 dní</option>
                <option value="30" selected>Posledných 30 dní</option>
                <option value="90">Posledných 90 dní</option>
              </select>
            </div>
          </div>
          ${top.length ? `<div class="top-list">${top.map((p, i) => `<div class="top-item">
              <span class="rank">${i + 1}</span>
              ${p.thumb ? `<img class="thumb" src="${esc(p.thumb)}" alt="" loading="lazy">` : '<span class="thumb ph"></span>'}
              <span class="t-body"><b title="${esc(p.title)}">${esc(p.title)}</b><small>${p.qty} ks</small></span>
              <span class="t-price">${p.price != null ? fmtEur(p.price) : '—'}</span>
              <button type="button" class="dots-btn" aria-label="Viac možností">⋮</button>
            </div>`).join('')}</div>`
          : '<p class="side-empty">Zatiaľ nemáme údaje o predaji produktov.</p>'}
        </section>
      </div>
    </div>
    <aside class="dash-side">
      <section class="side-card">
        <h2>Rýchle akcie</h2>
        <div style="display:grid;gap:8px">
          <a class="btn primary" href="#/produkty">${navIcon('plus')}Pridať produkt</a>
          <a class="btn ghost" href="#/poukazy">${navIcon('tag')}Vytvoriť zľavový kód</a>
          <a class="btn ghost" href="#/obsah/1">${navIcon('mail')}Napísať newsletter</a>
          <a class="btn ghost" href="#/obsah/2">${navIcon('home')}Upraviť homepage</a>
          <a class="btn ghost" href="#/spravy">${navIcon('chat')}Nová správa</a>
        </div>
      </section>
      <section class="side-card" data-tour="tasks">
        <div class="side-head"><h2>Notifikácie</h2><button type="button" class="link-lav" id="notif-all" style="border:0;background:none;cursor:pointer;padding:0">Zobraziť všetky</button></div>
        <div id="notif-body">${notifHtml(notif, 5)}</div>
      </section>
    </aside>
  </div>
  <div class="banners">
    <a class="banner banner-lav" href="#/produkty">
      <span class="banner-art">${BOTANIC_LAVENDER}</span>
      <span class="banner-txt"><b>${prodCount} <span class="bn">${prodCount === 1 ? 'produkt' : prodCount < 5 ? 'produkty' : 'produktov'}</span></b><small>v e-shope</small><span class="bn-link">Spravovať produkty →</span></span>
    </a>
    <a class="banner banner-plain" href="#/kategorie">
      <span class="banner-txt"><b>${catCount} <span class="bn">${catCount === 1 ? 'kategória' : catCount < 5 ? 'kategórie' : 'kategórií'}</span></b><small>Spravovať kategórie →</small></span>
      <span class="banner-cats">${catList.map(c => `<span class="cat-chip" title="${esc(c.name)}"><span class="cat-thumb">${c.images.length ? `<img src="${esc(c.images[0])}" alt="" loading="lazy" data-fallback-images="${esc(JSON.stringify(c.images.slice(1)))}">` : ''}<span class="cat-initial" ${c.images.length ? 'hidden' : ''}>${esc([...c.name][0] || '?')}</span></span><span>${esc(c.name)}</span></span>`).join('')}</span>
    </a>
    <a class="banner banner-sage" href="#/produkty" data-open-reset>
      <span class="banner-txt"><b>Členská zóna RESET 40+</b><small>Správa obsahu, lekcie, pracovné listy</small><span class="bn-link">Prejsť do členskej zóny →</span></span>
      <span class="banner-art">${BOTANIC_OLIVE}</span>
    </a>
  </div>`;

  view.querySelectorAll('.banner-cats .cat-thumb img[data-fallback-images]').forEach(img => {
    let candidates;
    try { candidates = JSON.parse(img.dataset.fallbackImages || '[]'); } catch { candidates = []; }
    img.addEventListener('error', () => {
      const next = candidates.shift();
      if (next) { img.src = next; return; }
      img.hidden = true;
      img.nextElementSibling.hidden = false;
    });
  });

  // --- ovládanie obdobia, metriky a granularity ---
  syncRangeUI();
  const topRange = view.querySelector('#top-range');
  if (topRange) topRange.value = String(DASH_RANGE);
  const dashRange = root.querySelector('#dash-range');
  if (dashRange) { dashRange.value = String(DASH_RANGE); dashRange.onchange = () => { DASH_RANGE = +dashRange.value; vDashboard(view); }; }
  if (topRange) topRange.onchange = () => { DASH_RANGE = +topRange.value; vDashboard(view); };
  const metricSel = view.querySelector('#chart-metric');
  if (metricSel) metricSel.onchange = () => { DASH_METRIC = metricSel.value; vDashboard(view); };
  const granSel = view.querySelector('#chart-gran');
  if (granSel) granSel.onchange = () => { DASH_GRAN = granSel.value; vDashboard(view); };
  const notifAll = view.querySelector('#notif-all');
  if (notifAll) notifAll.onclick = () => {
    const body = view.querySelector('#notif-body');
    if (!body) return;
    const full = body.dataset.full === '1';
    body.dataset.full = full ? '0' : '1';
    body.innerHTML = notifHtml(notif, full ? 5 : 0);
    notifAll.textContent = full ? 'Zobraziť všetky' : 'Zobraziť menej';
  };
  view.querySelectorAll('tr[data-oid]').forEach(tr => {
    tr.style.cursor = 'pointer';
    tr.onclick = () => { location.hash = '#/objednavky'; };
  });
}
// Zosúladí výber obdobia v hlavičke (a vo výbere pri najpredávanejších produktoch).
function syncRangeUI() {
  const now = root.querySelector('#dash-range');
  if (now) now.value = String(DASH_RANGE);
  const label = root.querySelector('#range-now');
  if (label) label.textContent = `Posledných ${DASH_RANGE} dní`;
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
    // ⌘K / Ctrl+K: skok do globálneho hľadania v hornej lište.
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      const g = document.querySelector('#side-q');
      if (g) { g.focus(); g.select?.(); }
      return;
    }
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

// Zoznamy ako prehľadná tabuľka (miniatúra, stĺpce, stavy, akcia). Stránky dodávajú buď `cols`, alebo `card(r)`
// v tvare .rc-media / .rc-title / .rc-f(em = názov stĺpca); z karty sa poskladá riadok tabuľky, takže všetky zoznamy
// vyzerajú rovnako ako Objednávky.
function listView(view, { cols, rows, title, onRow, empty, card, search = true, compact = false }) {
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
  const rowHtml = (x) => `<tr data-id="${esc(x.r.id ?? '')}"${onRow ? ' tabindex="0" role="link"' : ''}>${hasMedia ? `<td class="ot-img lv-media">${x.media}</td>` : ''}<td class="lv-title">${x.title}</td>${labels.map(l => `<td data-label="${esc(l)}">${x.fields.find(f => f.label === l)?.html ?? '<span class="muted">—</span>'}</td>`).join('')}${onRow ? `<td class="ot-act"><button type="button" class="btn ghost sm"${compact ? ' aria-label="Otvoriť"' : ''}>${compact ? '' : 'Otvoriť '}${navIcon('arrow')}</button></td>` : ''}</tr>`;
  const colCount = (hasMedia ? 1 : 0) + 1 + labels.length + (onRow ? 1 : 0);
  const render = (list) => list.length ? list.map(rowHtml).join('') : `<tr><td colspan="${colCount}" class="empty">${esc(empty || 'Zatiaľ tu nič nie je.')}</td></tr>`;
  view.innerHTML = `<section class="card ot-card"><div class="ot-head"><h2>${esc(title)} <span class="muted">(${rows.length})</span></h2>
    ${search && rows.length > 6 ? '<input class="rc-search" type="search" placeholder="Hľadať…" aria-label="Hľadať">' : ''}</div>
    <div class="ot-wrap"><table class="ot lv ${compact ? 'lv-compact' : 'agenda-grid'}"><thead><tr>${hasMedia ? '<th class="ot-img"><span class="sr-only">Obrázok</span></th>' : ''}<th>${esc(titleHead)}</th>${labels.map(l => `<th>${esc(l)}</th>`).join('')}${onRow ? '<th class="ot-act"><span class="sr-only">Akcia</span></th>' : ''}</tr></thead><tbody id="rc-wrap">${render(parsed)}</tbody></table></div></section>`;
  const wire = () => { if (onRow) view.querySelectorAll('#rc-wrap tr[data-id]').forEach(tr => { const open = () => onRow(rows.find(x => String(x.id) === tr.dataset.id) || rows[0]); tr.onclick = open; tr.onkeydown = e => { if (e.target !== tr) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }; }); };
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
// Paleta webu ANASTASIA: tmavý text, levanduľa, zlatá, olivová (všetky čitateľné na bielej).
const RT_COLORS = [['#2e2b38', 'tmavá'], ['#73729c', 'levanduľová'], ['#8b89bd', 'svetlá levanduľová'], ['#a8853a', 'zlatá'], ['#4f5a3f', 'olivová']];
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
    <span class="rt-colors" role="group" aria-label="Farba textu">${RT_COLORS.map(([c, n]) => `<button type="button" data-cmd="foreColor" data-val="${c}" title="Farba textu: ${n}" aria-label="Farba textu ${n}"><span style="background:${c}"></span></button>`).join('')}</span>${sep}
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
const PRODUCT_PAGE_SIZE = 12;
const PRODUCT_STATUS = { published: ['zverejnený', 'ok'], draft: ['koncept', 'warn'] };
async function vProducts(view) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam produkty…</div>';
  setActions('<button class="btn primary" id="p-new">+ Pridať produkt</button>');
  const nb = document.querySelector('#p-new'); if (nb) nb.onclick = () => vProductNew(view);
  let offset = 0, query = '', status = '', type = '', count = 0, busy = false, pending = false, fallback = false;
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
      <td data-label="Stav"><span class="pill ${PRODUCT_STATUS[p.status]?.[1] || 'warn'}">${esc(PRODUCT_STATUS[p.status]?.[0] || p.status || '—')}</span></td>
      <td data-label="Typ">${fallback ? '<span class="muted">—</span>' : p.digital ? '<span class="pill ok">digitálny</span>' : '<span class="muted">fyzický</span>'}</td>
      <td data-label="Cena">${fmtEur(basePrice(p.variants?.[0])?.amount)}</td>
      <td data-label="Sklad">${stock === null ? '<span class="muted">—</span>' : stock <= 0 ? '<span class="pill off">vypredané</span>' : stock <= 5 ? `<span class="pill warn">${stock} ks</span>` : `<span>${stock} ks</span>`}</td>
      <td data-label="Akcia">${(() => { const s = p.metadata?.vyprodej; return (s && s.active && s.akcna_cena != null) ? `<span class="pill warn">${fmtEur(s.akcna_cena)}</span>` : '<span class="muted">—</span>'; })()}</td>
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
    <div class="ot-wrap"><table class="ot lv agenda-grid product-grid"><thead><tr><th class="ot-check"><input type="checkbox" id="p-pick-all" aria-label="Označiť všetky produkty na strane"></th><th class="ot-img"><span class="sr-only">Obrázok</span></th><th>Názov</th><th>Stav</th><th>Typ</th><th>Cena s DPH</th><th>Sklad</th><th>Akcia</th><th class="ot-act"><span class="sr-only">Akcia</span></th></tr></thead><tbody id="p-body"></tbody></table></div>
    <div class="ot-foot"><span class="muted" id="p-range"></span><span class="muted" id="p-note" hidden></span><div style="display:flex;gap:8px"><button class="btn ghost" data-pg="prev">← Predchádzajúce</button><button class="btn ghost" data-pg="next">Ďalšie →</button></div></div>
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
        api(`/admin/product-catalogue?${params}`).catch(async (e) => {
          // Záložný zdroj: katalóg s filtrom typu v jadre zatiaľ nemusí byť dostupný.
          console.warn('[admin] katalóg produktov nedostupný, načítavam záložný zoznam:', e?.detail || e?.message);
          const plain = await api(`/admin/products?limit=${params.get('limit')}&offset=${params.get('offset')}&order=-created_at&fields=id,title,status,handle,thumbnail,metadata,*variants.prices,*variants.sku,*categories`);
          return { ...plain, fallback: true };
        }),
        api('/admin/inventory-items?limit=500&fields=id,sku,*location_levels').catch(() => null),
      ]);
      const products = data.products || [];
      // Poradie robí jadro (zverejnené, fyzické, služby, digitálne). Záložný zoznam zoradíme aspoň na strane rovnako.
      if (data.fallback) {
        const kind = p => p.metadata?.product_kind === 'digital' ? 2 : (p.metadata?.booking || p.metadata?.product_kind === 'service') ? 1 : 0;
        products.sort((a, b) => (a.status === 'published' ? 0 : 1) - (b.status === 'published' ? 0 : 1) || kind(a) - kind(b));
      }
      // Katalóg zo staršieho jadra vracia varianty bez cien a SKU – doplníme ich zo zoznamu produktov.
      if (!data.fallback && products.some(p => !(p.variants || []).length || p.variants.some(v => !v?.id || !Array.isArray(v.prices)))) {
        try {
          const ids = products.map(p => `id[]=${encodeURIComponent(p.id)}`).join('&');
          const full = await api(`/admin/products?${ids}&limit=${products.length}&fields=id,*variants,*variants.prices`);
          const byId = new Map((full.products || []).map(p => [p.id, p.variants || []]));
          products.forEach(p => { if (byId.has(p.id)) p.variants = byId.get(p.id); });
        } catch (e) { console.warn('[admin] ceny variantov sa nepodarilo doplniť:', e?.detail || e?.message); }
      }
      fallback = !!data.fallback;
      count = Number(data.count) || 0;
      stockBySku = new Map((inv?.inventory_items || []).map(i => [i.sku, (i.location_levels || []).reduce((a, l) => a + Number(l.stocked_quantity || 0), 0)]));
      body.innerHTML = products.length ? products.map(row).join('') : `<tr><td colspan="9" class="empty">${count ? 'Žiadny produkt nezodpovedá výberu.' : 'Zatiaľ žiadne produkty.'}</td></tr>`;
      body.querySelectorAll('tr[data-id]').forEach(tr => {
        const open = () => vProductDetail(view, tr.dataset.id);
        tr.onclick = open; tr.onkeydown = e => { if (e.target !== tr) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
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
      const note = view.querySelector('#p-note');
      if (note) { note.hidden = !fallback; note.textContent = fallback ? 'Zoznam sa načítal zo základného jadra – filter digitálnych produktov zatiaľ nefunguje.' : ''; }
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
  let images = (p.images || []).map(i => i.url).filter(Boolean), thumb = p.thumbnail || images[0] || null;
  const sale = (p.metadata && p.metadata.vyprodej) || {};
  const saleOn = !!sale.active;
  const trans = (p.metadata && p.metadata.translations) || { en: {}, ru: {} };
  const enTrans = trans.en || {};
  const ruTrans = trans.ru || {};
  const jazyky = `<div class="row">
      <div>
        <h4 style="margin:0 0 10px;color:var(--text);font-size:14px;display:flex;align-items:center;gap:6px">🇬🇧 Anglická verzia (EN)</h4>
        <label>Názov (EN)</label>
        <input id="p-title-en" value="${esc(enTrans.title || '')}" placeholder="English product title">
        <label>Podtitul (EN)</label>
        <input id="p-sub-en" value="${esc(enTrans.subtitle || '')}" placeholder="Short English subtitle">
        <label>Popis (EN)</label>
        <textarea id="p-desc-en" rows="3" style="width:100%;box-sizing:border-box" placeholder="English detailed description">${esc(enTrans.description || '')}</textarea>
      </div>
      <div>
        <h4 style="margin:0 0 10px;color:var(--text);font-size:14px;display:flex;align-items:center;gap:6px">🇷🇺 Ruská verzia (RU)</h4>
        <label>Názov (RU)</label>
        <input id="p-title-ru" value="${esc(ruTrans.title || '')}" placeholder="Русское название продукта">
        <label>Podtitul (RU)</label>
        <input id="p-sub-ru" value="${esc(ruTrans.subtitle || '')}" placeholder="Краткое описание на русском">
        <label>Popis (RU)</label>
        <textarea id="p-desc-ru" rows="3" style="width:100%;box-sizing:border-box" placeholder="Подробное описание на русском">${esc(ruTrans.description || '')}</textarea>
      </div>
    </div>`;
  const zakladne = `<label>Názov</label><input id="p-title" value="${esc(p.title)}">
    <label>Stav</label><select id="p-status"><option value="published"${p.status === 'published' ? ' selected' : ''}>Zverejnený</option><option value="draft"${p.status === 'draft' ? ' selected' : ''}>Koncept</option></select>`;
  const cena = isOwner() ? `<div class="row"><div><label>Bežná cena (EUR)${variant ? '' : ' — bez variantu'}</label><input id="p-price" type="number" step="0.01" value="${price?.amount ?? ''}" ${variant ? '' : 'disabled'}></div>
    <div><label>Akcia</label><label style="display:inline-flex;gap:8px;align-items:center;white-space:nowrap;margin:6px 0 0"><input type="checkbox" id="p-sale-on" ${saleOn ? 'checked' : ''} style="width:16px!important;flex:none"> Vo výpredaji / akcia</label></div></div>
    <div id="p-sale-box" class="sale-on ${saleOn ? '' : 'hidden'}">
      <div class="row"><div><label>Akčná cena (EUR)</label><input id="p-sale-price" type="number" step="0.01" value="${sale.akcna_cena ?? ''}"></div>
      <div><label>Platí do (voliteľné)</label><input id="p-sale-to" type="date" value="${esc(sale.do || '')}"></div></div>
      <div class="muted" style="font-size:12px;margin-top:6px">Akčná cena sa prejaví ako zľava oproti bežnej cene (číta ju cenový engine jadra).</div>
    </div>` : '<p class="muted" style="margin-top:0">Ceny a akcie spravuje vlastník administrácie. Ak treba cenu zmeniť, obráťte sa na neho.</p>';
  const kategorie = `<label for="p-category">Pridať kategóriu</label><select id="p-category" ${catsR ? '' : 'disabled'}><option value="">Vyberte kategóriu…</option>${cats.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select><div id="p-categories" class="category-chips"></div><a class="subtle-link" href="#/kategorie">Spravovať kategórie →</a>${catsR ? '' : '<p class="muted">Kategórie sa nepodarilo načítať. Pôvodné zaradenie zostane zachované.</p>'}`;
  const popis = wysiwygHtml('p-desc', p.description || '');
  const obrazky = `<div id="p-imgs" class="rc-grid"></div>
    <div class="p-img-actions"><label class="btn ghost p-img-upload"><input type="file" id="p-file" accept="image/jpeg,image/png,image/webp" multiple class="sr-only">Nahrať z počítača</label><button type="button" class="btn gold" id="p-pick">${navIcon('photos')} Vybrať z mediálnej banky</button></div>
    <p class="muted" style="font-size:12px">JPG, PNG a WebP do 5 MB. Poradie zmeníte pretiahnutím alebo šípkami, prvý hlavný obrázok sa zobrazuje v obchode. Odobratím sa fotka nezmaže z mediálnej banky. Zmeny sa uložia tlačidlom Uložiť.</p>`;
  const predaj = `<label>Kód produktu (SKU)</label>${!variant ? '<p class="muted">Produkt nemá variant.</p>' : variant.sku ? `<input id="p-sku" value="${esc(variant.sku)}" maxlength="64" autocomplete="off"><p class="muted" style="font-size:12px">Kód môžete zmeniť. Pozor: QR kódy vytvorené pre starý kód prestanú fungovať a treba ich vytvoriť znova.</p>` : '<input id="p-sku" maxlength="64" placeholder="napr. RUZOVY-OLEJ-50ML" autocomplete="off">'}
    <div class="row"><div><label for="p-ean">EAN (čiarový kód)</label><input id="p-ean" value="${esc(String(variant?.barcode || variant?.ean || ''))}" maxlength="64" inputmode="numeric" autocomplete="off" placeholder="napr. 5901234123457"></div>
    <div><label for="p-weight">Hmotnosť (kg)</label><input id="p-weight" type="number" min="0" step="0.001" value="${esc(String(variant?.weight ?? ''))}" placeholder="napr. 0.25"></div></div>
    <p class="muted" style="font-size:12px;margin-top:6px">EAN a hmotnosť sa doplnia do feedov pre porovnávače a do dopravných údajov.</p>
    <label>Typ produktu (doprava)</label><select id="p-ship"><option value="">— vyberte —</option>${profiles.map(sp => `<option value="${esc(sp.id)}"${sp.id === curProfile ? ' selected' : ''}>${esc(shipLabel(sp))}</option>`).join('')}</select>
    <p class="muted" style="margin-top:14px">Produkt sa v obchode zobrazí len v označených predajných kanáloch.</p>
    <div>${channels.map(c => `<label style="display:inline-flex;gap:6px;margin:4px 12px 4px 0;align-items:center"><input type="checkbox" data-ch="${esc(c.id)}" ${inCh.has(c.id) ? 'checked' : ''} style="width:auto"> ${esc(c.name)}${c.is_disabled ? ' <span class="pill off">vypnutý</span>' : ''}</label>`).join('') || '<span class="muted">Predajné kanály sa nedajú načítať.</span>'}</div>`;
  const sklad = '<p class="muted" style="margin:0">Počet kusov nastavíte pri každom variante v sekcii <b>07 Voľby a varianty</b>, stĺpec <b>Skladom (ks)</b>. Digitálne produkty a služby majú zaškrtnuté Neobmedzené.</p>';
  const completeness = () => {
    const np = Number(view.querySelector('#p-price')?.value ?? price?.amount);
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
  // Editor na jednej stránke: všetky sekcie pod sebou, horné kotvy len posúvajú na sekciu.
  const SECTIONS = [['zaklad', 'Základ a cena'], ['popis', 'Popis'], ['foto', 'Fotografie'], ['predaj', 'Kategórie a predaj'], ['varianty', 'Varianty'], ['sklad', 'Sklad'], ['obsah', 'Zakúpený obsah'], ['jazyky', 'Jazykové mutácie']];
  const sec = (key, n, title, html, wide) => `<section class="pe-sec${wide ? ' wide' : ''}" id="pe-${key}"><header><span class="pe-n">${n}</span><h2>${esc(title)}</h2></header>${html}</section>`;
  const priceTxt = price?.amount != null ? new Intl.NumberFormat('sk-SK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price.amount) : '–';
  view.innerHTML = `<div class="pe">
    <article class="pe-hero">
      <div class="pe-hero-img">${thumb ? `<img src="${esc(thumb)}" alt="">` : '<span>Bez fotografie</span>'}</div>
      <div class="pe-hero-body">
        <span class="pe-state ${p.status === 'published' ? 'on' : ''}"><i></i>${p.status === 'published' ? 'Zverejnený v obchode' : 'Koncept'}</span>
        <h1 class="pe-title">${esc(p.title)}</h1>
        <div class="pe-price"><b>${priceTxt}</b><small>EUR</small>${saleOn && sale.akcna_cena ? `<em>akcia ${esc(String(sale.akcna_cena))} €</em>` : ''}</div>
        <div id="p-checks" class="pe-checks"></div>
        <div class="pe-act"><button class="btn ghost" id="p-back">Späť na produkty</button><button class="btn gold" id="p-save">Uložiť zmeny</button></div>
      </div>
    </article>
    <nav class="pe-nav" aria-label="Sekcie produktu">${SECTIONS.map(([k, l]) => `<button type="button" data-jump="${k}">${esc(l)}</button>`).join('')}</nav>
    <div id="pmsg">${opts.notice ? `<div class="notice">${esc(opts.notice)}</div>` : ''}</div>
    <div class="pe-grid">
      ${sec('zaklad', '01', 'Základné údaje', zakladne)}
      ${sec('cena', '02', 'Cena a akcia', cena)}
      ${sec('popis', '03', 'Popis produktu', popis, true)}
      ${sec('foto', '04', 'Fotografie', obrazky, true)}
      ${sec('predaj', '05', 'Kategórie', kategorie)}
      ${sec('dorucenie', '06', 'Predaj a doručenie', predaj)}
      ${sec('varianty', '07', 'Voľby a varianty', '<div id="p-variants"></div>', true)}
      ${sec('sklad', '08', 'Sklad', sklad, true)}
      ${sec('obsah', '09', 'Zakúpený obsah', '<div id="p-library"></div>', true)}
      ${sec('jazyky', '10', 'Jazykové mutácie (EN / RU)', jazyky, true)}
    </div>
  </div>`;
  view.querySelectorAll('.pe-nav [data-jump]').forEach(b => b.onclick = () => view.querySelector(`#pe-${b.dataset.jump}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  if (opts.tab && opts.tab !== 'zaklad') requestAnimationFrame(() => view.querySelector(`#pe-${opts.tab}`)?.scrollIntoView({ block: 'start' }));
  wireWysiwyg(view);
  const libraryEditor = await mountLibraryEditor(view.querySelector('#p-library'), { api, productId: id });
  mountVariantsEditor(view.querySelector('#p-variants'), { api, productId: id, canPrice: isOwner() }).catch(e => { if (e?.message === '401') renderLogin('Prihlásenie vypršalo.'); });
  const drawCategories = () => {
    view.querySelector('#p-categories').innerHTML = [...inC].map(id => `<button type="button" class="btn ghost" data-category-remove="${esc(id)}" aria-label="Odobrať kategóriu ${esc(cats.find(c => c.id === id)?.name || p.categories?.find(c => c.id === id)?.name || 'z produktu')}">${esc(cats.find(c => c.id === id)?.name || p.categories?.find(c => c.id === id)?.name || 'Priradená kategória')} ×</button>`).join('');
    view.querySelectorAll('[data-category-remove]').forEach(b => b.onclick = () => { inC.delete(b.dataset.categoryRemove); drawCategories(); renderChecks(); });
    [...view.querySelector('#p-category').options].forEach(o => { o.disabled = inC.has(o.value); });
  };
  view.querySelector('#p-category').onchange = e => { if (e.target.value) inC.add(e.target.value); e.target.value = ''; drawCategories(); renderChecks(); };
  drawCategories();
  view.querySelector('#p-back').onclick = () => vProducts(view);
  // Fotky produktu: poradie pretiahnutím alebo šípkami, hlavná fotka, odobratie bez zmazania z mediálnej banky.
  const move = (from, to) => { if (to < 0 || to >= images.length || from === to) return; images.splice(to, 0, images.splice(from, 1)[0]); drawImgs(); };
  const drawImgs = () => {
    const grid = view.querySelector('#p-imgs');
    grid.innerHTML = images.map((u, i) => `<div class="rc p-img${u === thumb ? ' is-main' : ''}" draggable="true" data-i="${i}"><div class="rc-body"><img src="${esc(u)}" alt="" class="product-photo" draggable="false">
      <div class="p-img-bar"><button type="button" class="btn ghost sm" data-mv="${i}" data-to="${i - 1}" aria-label="Posunúť doľava" ${i ? '' : 'disabled'}>←</button><button type="button" class="btn ghost sm" data-mv="${i}" data-to="${i + 1}" aria-label="Posunúť doprava" ${i < images.length - 1 ? '' : 'disabled'}>→</button>${u === thumb ? '<span class="pill ok">hlavný</span>' : `<button type="button" class="btn ghost sm" data-main="${i}">Hlavný</button>`}<button type="button" class="btn ghost sm" data-rm="${i}" title="Súbor ostane v mediálnej banke">Odobrať</button></div></div></div>`).join('') || '<div class="empty">Produkt zatiaľ nemá obrázok.</div>';
    grid.querySelectorAll('[data-main]').forEach(b => b.onclick = () => { thumb = images[+b.dataset.main]; drawImgs(); });
    grid.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { const u = images.splice(+b.dataset.rm, 1)[0]; if (thumb === u) thumb = images[0] || null; drawImgs(); renderChecks(); });
    grid.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => move(+b.dataset.mv, +b.dataset.to));
    let from = -1;
    grid.querySelectorAll('.p-img').forEach(card => {
      card.ondragstart = e => { from = +card.dataset.i; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(from)); };
      card.ondragend = () => card.classList.remove('dragging');
      card.ondragover = e => { e.preventDefault(); card.classList.add('drop-over'); };
      card.ondragleave = () => card.classList.remove('drop-over');
      card.ondrop = e => { e.preventDefault(); card.classList.remove('drop-over'); if (from >= 0) move(from, +card.dataset.i); from = -1; };
    });
  };
  view.querySelector('#p-pick').onclick = async () => {
    const picked = await pickMedia(images);
    const added = picked.filter(u => !images.includes(u));
    if (!added.length) return;
    images.push(...added); if (!thumb) thumb = images[0] || null;
    drawImgs(); renderChecks(); view.querySelector('#pmsg').innerHTML = `<div class="notice">Priradené fotografie: ${added.length}. Nezabudnite Uložiť.</div>`;
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
    // Darčekový poukaz zákazník dostane ako kód e-mailom, súbor nepotrebuje.
    const isVoucher = p.metadata?.voucher_product === true || p.metadata?.voucher_product === 'true';
    const isDigital = !isVoucher && profiles.find(sp => sp.id === shipId)?.type === 'digital';
    const hasFiles = libraryEditor.hasFiles();
    if (wantStatus === 'published' && isDigital && hasFiles === false) {
      msg.innerHTML = '<div class="err">Digitálny produkt nemá žiadny súbor. Najprv v sekcii 08 Zakúpený obsah nahrajte video, nahrávku alebo dokument, ktorý zákazník dostane. Bez súboru produkt nezverejňujte.</div>'; return;
    }
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
      const np = view.querySelector('#p-price')?.value ?? '';
      // Základná cena len cez /admin/shop-prices (zámok, kontrola pôvodnej sumy, audit) – nikdy natívne prices[],
      // ktoré by prepísalo celý price set (iné meny, pravidlá).
      if (isOwner() && variant && np !== '' && Number(np) !== price?.amount) {
        if (!price?.id) throw new Error('Variant zatiaľ nemá základnú cenu v EUR. Obnovte údaje alebo kontaktujte podporu.');
        await api(`/admin/shop-prices/${variant.id}`, { method: 'POST', body: { price_id: price.id, amount: Number(np), expected_amount: Number(price.amount) } });
      }
      let ref = { price_list_id: sale.price_list_id, price_id: sale.price_id };
      let saleMeta = sale;
      if (isOwner()) {
        // Ceny a akcie upravuje iba vlastník – asistent ich nemení.
        const wantSale = view.querySelector('#p-sale-on').checked, sp = view.querySelector('#p-sale-price').value;
        if (wantSale && variant && sp !== '') { ref = await applyVariantSale(variant.id, sp, ref); saleMeta = { active: true, akcna_cena: Number(sp), do: view.querySelector('#p-sale-to').value || null, ...ref }; }
        else { await clearVariantSale(ref); saleMeta = { active: false }; }
      }
      const updatedTranslations = {
        en: {
          title: (view.querySelector('#p-title-en')?.value || '').trim(),
          subtitle: (view.querySelector('#p-sub-en')?.value || '').trim(),
          description: (view.querySelector('#p-desc-en')?.value || '').trim()
        },
        ru: {
          title: (view.querySelector('#p-title-ru')?.value || '').trim(),
          subtitle: (view.querySelector('#p-sub-ru')?.value || '').trim(),
          description: (view.querySelector('#p-desc-ru')?.value || '').trim()
        }
      };
      const metadata = { ...(p.metadata || {}), vyprodej: saleMeta, translations: updatedTranslations };
      // Registry changes use the revision-checked endpoint; never overwrite it from a stale product snapshot.
      delete metadata.protected_media;
      const body = { title: view.querySelector('#p-title').value.trim(), status: wantStatus, description: desc, categories: chosen, metadata, images: images.map(url => ({ url })), thumbnail: thumb };
      const ship = view.querySelector('#p-ship').value; if (ship && ship !== curProfile) body.shipping_profile_id = ship;
      if (channels.length) body.sales_channels = [...view.querySelectorAll('[data-ch]')].filter(cb => cb.checked).map(cb => ({ id: cb.dataset.ch }));
      await api(`/admin/products/${id}`, { method: 'POST', body });
      await libraryEditor.save();
      msg.innerHTML = '<div class="notice">Uložené.</div>';
      setTimeout(() => vProductDetail(view, id), 700);
    } catch (e) { if (e.message === '401') return; msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    finally { btn.disabled = false; }
  };
}
async function vCategories(view) {
  view = freshView(view);
  const { product_categories } = await api('/admin/product-categories?limit=200&fields=id,name,handle,is_active,parent_category_id,products.id');
  setActions('<button class="btn gold" id="cat-new">+ Nová kategória</button>');
  const nb = document.querySelector('#cat-new'); if (nb) nb.onclick = () => vCategoryDetail(view, null);
  // Rovnaké názvy ako na webe, aktívne kategórie navrchu.
  const CAT_LABEL = { 'AI ANASTASIA ACADEMY': 'Programy a služby', 'BIOKOZMETIKA': 'Biokozmetika', 'TVOJ ODEV NOVÝ': 'Tvoj odev nový', 'VETERINA': 'Veterina' };
  const rows = [...product_categories].sort((a, b) => (b.is_active ? 1 : 0) - (a.is_active ? 1 : 0));
  listView(view, { title: 'Kategórie', rows, onRow: c => vCategoryDetail(view, c.id), cols: [
    { h: 'Názov', v: c => esc(CAT_LABEL[c.name] || c.name) }, { h: 'Adresa kategórie', v: c => `<span class="muted">${esc(c.handle)}</span>` },
    { h: 'Nadradená kategória', v: c => esc(product_categories.find(p => p.id === c.parent_category_id)?.name || 'Hlavná kategória') },
    { h: 'Produkty', v: c => (c.products || []).length ? `<b>${(c.products || []).length}</b>` : '<span class="muted">0</span>' },
    { h: 'Na webe', v: c => c.is_active ? '<span class="pill ok">zobrazená</span>' : '<span class="pill off">skrytá</span>' }] });
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
const ORDER_PAGE_SIZE = 6;
/** Stiahnutie súboru v prehliadači (CSV export). */
function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
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
      <td class="ot-cust">${esc(name(o) || '—')}<small>${esc(o.email || '')}</small></td>
      <td class="ot-dor">${esc(shipping(o))}<small>${esc(city(o))}</small></td>
      <td class="ot-items">${esc(first?.title || first?.product_title || '—')}${more}</td>
      <td class="ot-num">${fmtEur(o.total)}</td>
      <td>${archived(o) ? `<span class="pill">${esc(legacy(o)?.payment_status || 'Historický záznam')}</span>` : payPill(o.payment_status)}${method ? `<small>${esc(method.label)}</small>` : ''}</td>
      <td>${archived(o) ? `<span class="pill">${esc(legacy(o)?.status || 'Archív')}</span>` : o.status === 'canceled' ? '<span class="pill off">zrušená</span>' : fulPill(o.fulfillment_status)}</td>
      <td class="ot-act ot-act-print"><div class="ot-acts">
        <button type="button" class="btn ghost sm" data-print="label" title="Vytlačiť adresný štítok (A6)">Štítok</button>
        <button type="button" class="btn ghost sm" data-print="slip" title="Vytlačiť dodací list (A4)">Dodací list</button>
        ${archived(o) ? '' : '<button type="button" class="btn ghost sm" data-invoice title="Faktúra alebo zálohová faktúra (PDF)">Faktúra</button>'}
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
    <div class="ot-wrap"><table class="ot ot-orders"><thead><tr><th class="ot-check"><input type="checkbox" id="o-pick-all" aria-label="Označiť všetky objednávky na strane"></th><th class="ot-img"><span class="sr-only">Produkt</span></th><th>Objednávka</th><th>Zákazník</th><th>Doručenie</th><th>Položky</th><th class="ot-num">Suma s DPH</th><th>Platba</th><th>Vybavenie</th><th class="ot-act"><span class="sr-only">Akcia</span></th></tr></thead><tbody></tbody></table></div>
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
      tr.onclick = open; tr.onkeydown = e => { if (e.target !== tr) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
      tr.querySelectorAll('[data-print]').forEach(b => b.onclick = (e) => { e.stopPropagation(); printOrders([tr.dataset.id], b.dataset.print); });
      tr.querySelectorAll('[data-invoice]').forEach(b => b.onclick = (e) => { e.stopPropagation(); openInvoice(tr.dataset.id); });
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
  // Poznámky k objednávke (autor + čas) a staršia jediná poznámka v metadátach.
  const notes = Array.isArray(o.metadata?.anastasia_notes) ? o.metadata.anastasia_notes : [];
  const legacyNote = String(o.metadata?.anastasia_note || '').trim();
  const notesHtml = notes.length
    ? `<div class="rc-grid">${notes.map(n => `<div class="rc"><div class="rc-body"><div class="rc-title">${esc(n.body || '')}</div>
        <div class="rc-fields"><span class="rc-f"><em>Autor</em>${esc(n.by_email || n.by || 'neznámy')}</span><span class="rc-f"><em>Čas</em>${fmtDate(n.at)}</span></div></div></div>`).join('')}</div>`
    : legacyNote
      ? `<div class="rc-grid"><div class="rc"><div class="rc-body"><div class="rc-title">${esc(legacyNote)}</div>
        <div class="rc-fields"><span class="rc-f"><em>Autor</em><span class="muted">uložené pred zavedením autorstva</span></span></div></div></div></div>`
      : '';
  // Formulár na úpravu doručovacej a fakturačnej adresy.
  const addrEdit = `<div style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px">
    <b>Adresy objednávky</b>
    <p class="muted" style="font-size:12px;margin:4px 0 8px">Ak si zákazník povedal inú adresu, upravte ju tu.</p>
    <details><summary>Upraviť doručovaciu a fakturačnú adresu</summary>
      <div class="row" style="margin-top:10px">
        <div><label for="ad-first">Meno</label><input id="ad-first" value="${esc(a.first_name || '')}"></div>
        <div><label for="ad-last">Priezvisko</label><input id="ad-last" value="${esc(a.last_name || '')}"></div>
      </div>
      <div class="row" style="margin-top:8px">
        <div><label for="ad-1">Ulica</label><input id="ad-1" value="${esc(a.address_1 || '')}"></div>
        <div><label for="ad-2">Ulica 2 (voliteľné)</label><input id="ad-2" value="${esc(a.address_2 || '')}"></div>
      </div>
      <div class="row" style="margin-top:8px">
        <div><label for="ad-pc">PSČ</label><input id="ad-pc" value="${esc(a.postal_code || '')}"></div>
        <div><label for="ad-city">Mesto</label><input id="ad-city" value="${esc(a.city || '')}"></div>
        <div><label for="ad-cc">Krajina (2 písmená)</label><input id="ad-cc" maxlength="2" value="${esc(a.country_code || '')}"></div>
      </div>
      <div class="row" style="margin-top:8px">
        <div><label for="ad-phone">Telefón (voliteľné)</label><input id="ad-phone" value="${esc(a.phone || '')}"></div>
        <div><label style="display:flex;gap:8px;align-items:center;margin-top:20px"><input type="checkbox" id="ad-same" ${billDiffers ? '' : 'checked'} style="width:auto"> Fakturačná adresa je rovnaká ako doručovacia</label></div>
      </div>
      <div id="ad-bill" ${billDiffers ? '' : 'hidden'} style="margin-top:12px;border-top:1px solid var(--line);padding-top:10px">
        <b style="font-size:13px">Fakturačná adresa</b>
        <div class="row" style="margin-top:8px">
          <div><label for="bf-first">Meno</label><input id="bf-first" value="${esc(bAddr.first_name || '')}"></div>
          <div><label for="bf-last">Priezvisko</label><input id="bf-last" value="${esc(bAddr.last_name || '')}"></div>
        </div>
        <div class="row" style="margin-top:8px">
          <div><label for="bf-1">Ulica</label><input id="bf-1" value="${esc(bAddr.address_1 || '')}"></div>
          <div><label for="bf-2">Ulica 2 (voliteľné)</label><input id="bf-2" value="${esc(bAddr.address_2 || '')}"></div>
        </div>
        <div class="row" style="margin-top:8px">
          <div><label for="bf-pc">PSČ</label><input id="bf-pc" value="${esc(bAddr.postal_code || '')}"></div>
          <div><label for="bf-city">Mesto</label><input id="bf-city" value="${esc(bAddr.city || '')}"></div>
          <div><label for="bf-cc">Krajina (2 písmená)</label><input id="bf-cc" maxlength="2" value="${esc(bAddr.country_code || '')}"></div>
        </div>
      </div>
      <div style="margin-top:12px"><button type="button" class="btn gold" id="o-addr-save">Uložiť adresy</button> <span class="muted" id="o-addr-msg" style="font-size:12px"></span></div>
    </details></div>`;
  const prehlad = `<div class="row"><div><label>E-mail</label><div>${esc(o.email)}</div></div><div><label>Dátum</label><div>${fmtDate(history.placed_at || o.created_at)}</div></div></div>
    <div class="row"><div><label>Platba</label><div><span class="pill">${esc(payState)}</span>${method ? `<div style="margin-top:4px"><b>${esc(method.label)}</b></div>` : ''}</div></div>
    <div><label>Vybavenie</label><div><span class="pill">${esc(history.status || (archived ? 'Archív' : FUL_LABEL[o.fulfillment_status] || o.fulfillment_status) || '—')}</span>${canceled ? ' <span class="pill off">objednávka zrušená</span>' : ''}</div></div></div>
    <div class="row"><div><label>Doručenie</label><div>${addr || '<span class="muted">bez adresy (digitálny obsah)</span>'}</div></div>
    <div><label>Doprava</label><div>${(o.shipping_methods || []).map(m => `${esc(m.name)} · ${fmtEur(m.total ?? m.amount)}`).join('<br>') || '—'}</div></div></div>
    <div class="row"><div><label>Fakturačná adresa</label><div>${billAddr || '<span class="muted">žiadna (rovná sa doručeniu)</span>'}</div></div>
    <div><label>Rozdiel</label><div>${billDiffers ? '<span class="pill warn">iná než doručovacia</span>' : '<span class="muted">rovná sa doručovacej</span>'}</div></div></div>
    <div style="margin-top:10px;font-weight:600">Celkom: ${fmtEur(o.total)}</div>
    ${archived ? '' : addrEdit}
    <div style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px">
      <b>Poznámky k objednávke</b>
      <p class="muted" style="font-size:12px;margin:4px 0 8px">Vidí ich len tím administrácie. Ku každej poznámke sa eviduje autor a čas.</p>
      ${notesHtml}
      <label for="o-note">Nová poznámka</label>
      <textarea id="o-note" rows="2" maxlength="2000" placeholder="napr. zákazník si želá zabalenie daru"></textarea>
      <div style="display:flex;gap:8px;align-items:center;margin-top:8px"><button type="button" class="btn ghost" id="o-note-save">Uložiť poznámku</button><span class="muted" id="o-note-msg" style="font-size:12px"></span></div>
    </div>
    ${manual && o.payment_status === 'authorized' && !canceled ? `<div class="notice" style="margin-top:10px">${method.key === 'bank_transfer' ? `Prevod: skontrolujte vo výpise VÚB banky platbu s variabilným symbolom <b>${esc(orderVs(o))}</b> a sumou <b>${fmtEur(o.total)}</b>. Potom v záložke Platby kliknite „Prijať platbu“ – až vtedy sa sprístupní digitálny obsah.` : 'Dobierka: zákazník platí kuriérovi pri prevzatí. Keď vám dopravca peniaze pripíše, v záložke Platby kliknite „Prijať platbu“.'}</div>` : ''}`;
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
      ${left > 0 ? `<div class="row" style="margin-top:6px"><div><label>Suma na vrátenie (EUR)</label><input type="number" step="0.01" min="0.01" max="${left}" data-refamt="${esc(p.id)}" value="${left}"></div>
        <div><label>Dôvod vrátenia (povinný)</label><input data-refreason="${esc(p.id)}" maxlength="500" placeholder="napr. reklamácia – zákazník vracia tovar"></div>
        <div style="grid-column:1/-1;margin-top:8px"><label style="display:inline-flex;gap:8px;align-items:center;white-space:nowrap;margin:0"><input type="checkbox" data-refrestock="${esc(p.id)}" style="width:16px!important;flex:none"> Vrátiť tovar na sklad</label>
          <p class="muted" style="font-size:12px;margin:4px 0 0">Zapnuté, ak tovar fyzicky vraciate späť do skladu.</p></div></div>` : ''}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${!p.captured_at && cap === 0 && !canceled ? `<button class="btn gold" data-cap="${esc(p.id)}">Prijať platbu</button>` : ''}${left > 0 ? `<button class="btn ghost" data-ref="${esc(p.id)}" data-max="${left}">Vrátiť peniaze</button>` : ''}</div></div>`; }).join('') || '<p class="muted">K objednávke nie je evidovaná platba.</p>'}
    <p class="muted" style="font-size:12px;margin-top:10px">${manual ? 'Dobierka a prevod nejdú cez platobnú bránu: „Prijať platbu“ len zaznamená, že peniaze prišli (sprístupní obsah, odíde e-mail). Pri vrátení pošlite peniaze zákazníkovi sami prevodom a sumu tu zaznamenajte.' : 'Vrátenie peňazí prebehne cez platobnú bránu. Jadro potom samo upraví prístupy k digitálnemu obsahu a pošle e-mail.'}</p>`;
  view.innerHTML = `<div class="detail-layout"><div class="card"><div class="card-h">Objednávka #${esc(history.number || o.display_id || '')}<div class="card-h-act">
      <button type="button" class="btn ghost" id="o-print-label">Vytlačiť štítok</button>
      <button type="button" class="btn ghost" id="o-print-slip">Dodací list</button>
      ${archived ? '' : '<button type="button" class="btn ghost" id="o-invoice">Faktúra</button>'}
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
    ${!canceled && !archived && !anyShipped ? `<div style="margin-top:18px;border-top:1px solid var(--line);padding-top:14px">
      <button class="btn ghost" id="o-cancel">Zrušiť objednávku</button>
      <div id="o-cancel-box" hidden style="margin-top:12px">
        <label for="o-cancel-reason">Dôvod zrušenia (povinný)</label>
        <textarea id="o-cancel-reason" rows="2" maxlength="500" placeholder="napr. zákazník zrušil objednávku telefonicky"></textarea>
        <div class="row" style="margin-top:8px"><button type="button" class="btn gold" id="o-cancel-go">Zrušiť objednávku</button><span class="muted" style="font-size:12px">Zaplatená suma sa zákazníkovi vráti cez platobnú bránu. Dôvod zostane v objednávke.</span></div>
      </div></div>` : ''}
  </div></div><aside class="detail-help panel" aria-label="Nápoveda k objednávke"><div class="panel-head"><h2>Ako postupovať</h2></div><div class="card-b" id="order-help" aria-live="polite"></div></aside></div>`;
  wireTabs(view);
  const orderHelp = {
    p: ['Skontrolujte objednávku', 'Tu vidíte zákazníka, doručenie a aktuálny stav platby. Položky objednávky nájdete vo vedľajšej záložke.', 'objednavka-vybavit'],
    i: ['Čo zákazník objednal', 'Pri každej položke vidíte objednané, pripravené a odoslané množstvo. Na vybavenie pokračujte do Odoslanie.', 'objednavka-vybavit'],
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
  view.querySelector('#o-invoice')?.addEventListener('click', () => openInvoice(id));
  // Poznámka k objednávke: server ju uloží s autorom a časom a zapíše do auditu.
  const noteBtn = view.querySelector('#o-note-save');
  if (noteBtn) noteBtn.onclick = async () => {
    const noteMsg = view.querySelector('#o-note-msg');
    const text = (view.querySelector('#o-note')?.value || '').trim();
    if (!text) { noteMsg.innerHTML = '<span style="color:#8a2436">Napíšte poznámku.</span>'; return; }
    noteMsg.textContent = 'Ukladám…'; noteBtn.disabled = true;
    try {
      await api(`/admin/nexus/orders/${id}/notes`, { method: 'POST', body: { body: text } });
      await vOrderDetail(view, id, 'Poznámka je uložená.');
    } catch (e) {
      if (e.message !== '401') noteMsg.innerHTML = `<span style="color:#8a2436">${esc(e.message)}</span>`;
    } finally { noteBtn.disabled = false; }
  };
  // Adresy: doručovacia a fakturačná sa dajú upraviť priamo v objednávke.
  const sameBox = view.querySelector('#ad-same');
  if (sameBox) sameBox.onchange = () => { const box = view.querySelector('#ad-bill'); if (box) box.hidden = sameBox.checked; };
  const addrSave = view.querySelector('#o-addr-save');
  if (addrSave) addrSave.onclick = async () => {
    const msg = view.querySelector('#o-addr-msg');
    const val = (sel) => (view.querySelector(sel)?.value || '').trim();
    const ship = {
      first_name: val('#ad-first'), last_name: val('#ad-last'), address_1: val('#ad-1'), address_2: val('#ad-2'),
      postal_code: val('#ad-pc'), city: val('#ad-city'), country_code: val('#ad-cc').toUpperCase(), phone: val('#ad-phone'),
    };
    if (!ship.address_1 || !ship.city || !ship.postal_code) { msg.innerHTML = '<span style="color:#8a2436">Vyplňte ulicu, mesto a PSČ.</span>'; return; }
    const same = view.querySelector('#ad-same')?.checked;
    const bill = same ? ship : {
      first_name: val('#bf-first'), last_name: val('#bf-last'), address_1: val('#bf-1'), address_2: val('#bf-2'),
      postal_code: val('#bf-pc'), city: val('#bf-city'), country_code: val('#bf-cc').toUpperCase(),
    };
    addrSave.disabled = true; msg.textContent = 'Ukladám…';
    try {
      await api(`/admin/orders/${id}`, { method: 'POST', body: { shipping_address: ship, billing_address: bill } });
      await vOrderDetail(view, id, 'Adresy sú uložené.');
    } catch (e) {
      if (e.message !== '401') msg.innerHTML = `<span style="color:#8a2436">${esc(e.message)}</span>`;
      addrSave.disabled = false;
    }
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
    const reason = (view.querySelector(`[data-refreason="${CSS.escape(b.dataset.ref)}"]`)?.value || '').trim();
    const restock = view.querySelector(`[data-refrestock="${CSS.escape(b.dataset.ref)}"]`)?.checked === true;
    if (!(amt > 0) || amt > max) { view.querySelector('#omsg').innerHTML = `<div class="err">Zadajte sumu od 0,01 do ${esc(fmtEur(max))}.</div>`; return; }
    if (!reason) { view.querySelector('#omsg').innerHTML = '<div class="err">Napíšte dôvod vrátenia.</div>'; return; }
    run(b, `Naozaj vrátiť ${fmtEur(amt)} zákazníkovi? Túto akciu nemožno vrátiť späť.`, () => api(`/admin/nexus/orders/${id}/refund`, { method: 'POST', body: { payment_id: b.dataset.ref, amount: amt, note: reason, restock } }), `Vrátenie ${fmtEur(amt)} bolo odoslané.${restock ? ' Tovar je vrátený na sklad.' : ''} Dôvod: ${reason}`);
  });
  const cb = view.querySelector('#o-cancel');
  if (cb) cb.onclick = () => {
    const box = view.querySelector('#o-cancel-box');
    if (!box) return;
    box.hidden = !box.hidden;
    if (!box.hidden) view.querySelector('#o-cancel-reason')?.focus();
  };
  const cbg = view.querySelector('#o-cancel-go');
  if (cbg) cbg.onclick = async () => {
    const msg = view.querySelector('#omsg'); msg.innerHTML = '';
    const reason = (view.querySelector('#o-cancel-reason')?.value || '').trim();
    if (!reason) { msg.innerHTML = '<div class="err">Napíšte dôvod zrušenia.</div>'; return; }
    if (!confirm('Naozaj zrušiť celú objednávku? Zaplatená suma sa zákazníkovi automaticky vráti cez platobnú bránu.')) return;
    cbg.disabled = true;
    try {
      await api(`/admin/nexus/orders/${id}/cancel`, { method: 'POST', body: { reason } });
      await vOrderDetail(view, id, `Objednávka je zrušená. Dôvod: ${reason}`);
    } catch (e) {
      if (e.message === '401') return;
      cbg.disabled = false;
      msg.innerHTML = `<div class="err">${esc(e.message)}</div>`;
    }
  };
}
async function vCustomers(view) {
  view = freshView(view);
  let offset = 0, query = '', count = 0, tierFilter = '', tierOptions = [], loyalty = false, selected = new Set();
  const PAGE = 25;
  view.innerHTML = `<section class="card ot-card"><div class="ot-head">
      <h2>Zákazníci</h2>
      <div class="ot-head-act">
        <select class="rc-select" id="cu-tier" aria-label="Filter podľa vernostnej úrovne"><option value="">Všetky úrovne</option></select>
        <input class="rc-search" type="search" placeholder="Hľadať meno alebo e-mail…" aria-label="Hľadať zákazníkov">
      </div>
    </div><div id="cu-body"><div class="muted">Načítavam zákazníkov…</div></div></section>`;
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
        tierSel.innerHTML = `<option value="">Všetky úrovne</option><option value="none">Bez úrovne</option>${tierOptions.map((t) => `<option value="${esc(t.code)}">${esc(tierLabel(t))}</option>`).join('')}`;
        tierSel.value = tierFilter;
      }
    }
    const rows = customers.map((c) => {
      const nm = [c.first_name, c.last_name].filter(Boolean).join(' ');
      const av = (nm || c.email || '?').slice(0, 2).toUpperCase();
      const tier = c.tier_name || LOYALTY_TIER_LABEL[c.tier_code] || '';
      const tierCell = !loyalty ? '<span class="muted">—</span>' : tier
        ? `<b>${esc(tier)}</b>${c.locked ? ' <span class="pill">ručné</span>' : c.source === 'auto' ? ' <span class="muted">automaticky</span>' : ''}`
        : '<span class="muted">—</span>';
      return `<tr data-id="${esc(c.id)}" tabindex="0" role="link">
        <td class="ot-check"><input type="checkbox" data-pick="${esc(c.id)}" aria-label="Označiť zákazníka" ${selected.has(c.id) ? 'checked' : ''}></td>
        <td class="ot-img lv-media"><span class="thumb" style="display:grid;place-items:center;font-weight:600;color:var(--forest)">${esc(av)}</span></td>
        <td class="lv-title">${esc(nm || c.email)}</td>
        <td data-label="E-mail">${esc(c.email)}</td>
        <td data-label="Úroveň">${tierCell}</td>
        <td data-label="ID"><code class="rc-code">${esc(custCode(c.id))}</code></td>
        <td data-label="Od">${fmtDate(c.created_at)}</td>
        <td class="ot-act"><button type="button" class="btn ghost sm">Otvoriť ${navIcon('arrow')}</button></td></tr>`;
    }).join('');
    const from = count ? offset + 1 : 0, to = Math.min(offset + customers.length, count);
    body.innerHTML = `${selected.size ? `<div class="ot-bulk"><span class="muted">Označení zákazníci: ${selected.size}</span><div style="display:flex;gap:8px;flex-wrap:wrap">
        ${isOwner() ? `<select class="rc-select" id="cu-assign" aria-label="Priradiť úroveň"><option value="">Priradiť úroveň…</option><option value="automatic">Automaticky podľa útraty</option>${tierOptions.map((t) => `<option value="${esc(t.code)}">${esc(tierLabel(t))}</option>`).join('')}</select>
        <button type="button" class="btn ghost sm" id="cu-assign-go">Priradiť</button>` : ''}
        <button type="button" class="btn ghost sm" id="cu-pick-clear">Zrušiť označenie</button></div></div>` : ''}
      <div class="ot-wrap"><table class="ot lv agenda-grid customer-grid"><thead><tr><th class="ot-check"><span class="sr-only">Označiť</span></th><th class="ot-img"><span class="sr-only">Zákazník</span></th><th>Meno</th><th>E-mail</th><th>Úroveň</th><th>ID</th><th>Od</th><th class="ot-act"><span class="sr-only">Akcia</span></th></tr></thead><tbody>${rows || '<tr><td colspan="8" class="empty">Zatiaľ žiadni zákazníci.</td></tr>'}</tbody></table></div>
      <div class="ot-foot"><span class="muted">${count ? `${from}–${to} z ${count}` : 'Zatiaľ žiadni zákazníci'}</span>
      <div style="display:flex;gap:8px"><button class="btn ghost" data-pg="prev" ${offset <= 0 ? 'disabled' : ''}>← Predchádzajúce</button><button class="btn ghost" data-pg="next" ${offset + PAGE >= count ? 'disabled' : ''}>Ďalšie →</button></div></div>`;
    body.querySelectorAll('tr[data-id]').forEach((tr) => {
      const open = () => vCustomerDetail(view, tr.dataset.id);
      tr.onclick = open;
      tr.onkeydown = (e) => { if (e.target !== tr) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
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
  let groups = []; try { groups = ((await api('/admin/customer-groups?limit=50&fields=id,name,metadata')).customer_groups || [])
    // Úrovňové skupiny (Bronze–VIP) a zámok úrovne spravuje výber vernostnej úrovne, v zozname skupín by boli dvakrát.
    .filter((g) => !g.metadata?.nexus_tier && !g.metadata?.loyalty_lock); } catch {}
  // Prístup sa prideľuje len k digitálnym produktom a službám (profil „digital“); fyzický tovar do zoznamu nepatrí.
  let allProducts = [], products = [];
  try { allProducts = ((await api('/admin/products?limit=200&fields=id,title,*shipping_profile')).products || []).map((p) => ({ id: p.id, title: p.title || '', digital: p.shipping_profile?.type === 'digital' })); } catch {}
  products = allProducts.filter((p) => p.digital).sort((x, y) => x.title.localeCompare(y.title, 'sk'));
  const productTitle = (pid) => allProducts.find((p) => p.id === pid)?.title || pid || '';
  let entitlements = [], orders = [], erasures = [];
  try { entitlements = (await api(`/admin/entitlements?customer_id=${encodeURIComponent(id)}&limit=50`)).entitlements || []; } catch {}
  try { orders = (await api(`/admin/orders?customer_id=${encodeURIComponent(id)}&limit=50&fields=id,display_id,created_at,total,payment_status,fulfillment_status`)).orders || []; } catch {}
  try { erasures = ((await api('/admin/customer-erasures?limit=100')).requests || []).filter((r) => r.customer_id === id); } catch {}
  const inG = new Set((c.groups || []).map((g) => g.id));
  const zakladne = `<div class="row"><div><label>E-mail</label><div>${esc(c.email)}</div></div><div><label>Účet</label><div>${c.has_account ? 'áno' : 'hosť'}</div></div></div>
    <div class="row"><div><label>Meno</label><input id="cu-first" value="${esc(c.first_name || '')}"></div><div><label>Priezvisko</label><input id="cu-last" value="${esc(c.last_name || '')}"></div></div>
    <div class="row"><div><label>ID zákazníka</label><div><code class="rc-code">${esc(custCode(c.id))}</code></div></div><div><label>Registrácia</label><div>${fmtDate(c.created_at)}</div></div></div>`;
  const skupiny = groups.length ? `<div style="margin-top:18px"><label>Ďalšie skupiny</label><div>${groups.map((g) => `<label style="display:inline-flex;gap:6px;margin:4px 12px 4px 0;align-items:center"><input type="checkbox" data-g="${esc(g.id)}" ${inG.has(g.id) ? 'checked' : ''} style="width:auto"> ${esc(g.name)}</label>`).join('') || ''}</div></div>` : '';
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
        ${tierChoices.map((t) => `<option value="${esc(t.code)}"${tier?.tier_code === t.code ? ' selected' : ''}>${esc(tierLabel(t))}</option>`).join('')}
      </select></div>
      <div><label>Stav</label><div>${tier?.tier_name ? `<b>${esc(tier.tier_name)}</b> ${tier.locked ? '<span class="pill">ručné</span>' : '<span class="muted">automaticky</span>'}` : '<span class="muted">bez úrovne</span>'}</div></div></div>
      ${tier?.locked ? '<p class="muted" style="font-size:12px;margin-top:6px">Nastavené ručne – automatické priradenie podľa útraty to nepremení.</p>' : '<p class="muted" style="font-size:12px;margin-top:6px">Úroveň sa priradí automaticky podľa celkovej útraty zákazníka. Ručne nastavenú úroveň už automatika nepremení.</p>'}
`
    : '<p class="muted">Vernostné úrovne ešte nie sú v jadre zapnuté.</p>';
  const objednavky = orders.length ? `<div class="rc-grid">${orders.map((o) => `<div class="rc"><div class="rc-body"><div class="rc-title">#${esc(o.display_id ?? '')}</div>
      <div class="rc-fields"><span class="rc-f"><em>Dátum</em>${fmtDate(o.created_at)}</span><span class="rc-f"><em>Suma</em>${fmtEur(o.total)}</span>
      <span class="rc-f"><em>Platba</em>${esc(PAY_LABEL[o.payment_status] || o.payment_status || '—')}</span>
      <span class="rc-f"><em>Vybavenie</em>${esc(FUL_LABEL[o.fulfillment_status] || o.fulfillment_status || '—')}</span></div></div></div>`).join('')}</div>`
    : '<div class="empty">Zákazník nemá žiadne objednávky.</div>';
  const pristupy = `${entitlements.length ? `<div class="rc-grid">${entitlements.map((e) => `<div class="rc"><div class="rc-body"><div class="rc-title">${esc(productTitle(e.product_id))}</div>
      <div class="rc-fields"><span class="rc-f"><em>Stav</em>${e.status === 'active' ? '<span class="pill ok">aktívny</span>' : `<span class="pill off">${esc(e.status || '—')}</span>`}</span>
      ${e.expires_at ? `<span class="rc-f"><em>Platí do</em>${fmtDate(e.expires_at)}</span>` : ''}
      <span class="rc-f"><em>Pridelené</em>${fmtDate(e.granted_at)}</span></div></div></div>`).join('')}</div>` : '<div class="empty">Zákazník nemá prístup k žiadnemu digitálnemu obsahu.</div>'}
    <div style="margin-top:16px;border-top:1px solid var(--line);padding-top:14px">
      <b>Prideliť prístup ručne</b>
      ${isOwner() ? `<p class="muted" style="font-size:12px">Prístup udelíte konkrétnemu zákazníkovi ku konkrétnemu produktu (napr. po telefonáte alebo darčeku).</p>
      <div class="row"><div><label for="ent-product">Produkt</label><select id="ent-product">${products.map((p) => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('') || '<option value="">— žiadny digitálny produkt —</option>'}</select></div>
      <div><label for="ent-expires">Platí do (voliteľné)</label><input id="ent-expires" type="date"></div></div>
      <div class="row" style="margin-top:10px"><div><label for="ent-reason">Dôvod</label><input id="ent-reason" maxlength="200" placeholder="napr. darček od rodiny"></div><div><button type="button" class="btn gold" id="ent-grant">Prideliť prístup</button></div></div>`
        : '<p class="muted" style="font-size:12px">Pridanie prístupu ručne spravuje vlastník administrácie.</p>'}
    </div>`;
  const ochrana = `<p class="muted" style="margin-top:0">Žiadosť o výmaz osobných údajov (GDPR) musí pred vymazaním potvrdiť správca. Po potvrdení sa údaje zákazníka v jadre odstránia.</p>
    ${erasures.length ? `<div class="rc-grid">${erasures.map((r) => `<div class="rc"><div class="rc-body"><div class="rc-title">Žiadosť ${esc(r.id)}</div>
      <div class="rc-fields"><span class="rc-f"><em>Stav</em>${r.status === 'completed' ? '<span class="pill ok">vykonaná</span>' : '<span class="pill warn">čaká</span>'}</span>
      <span class="rc-f"><em>Požiadala</em>${fmtDate(r.created_at)}</span></div>
      ${r.status !== 'completed' ? `<div style="margin-top:10px"><button type="button" class="btn ghost sm danger" data-erasure="${esc(r.id)}">Vymazať osobné údaje</button></div>` : ''}</div></div>`).join('')}</div>` : '<div class="empty">Zákazník nepožiadala o výmaz osobných údajov.</div>'}`;
  view.innerHTML = `<div class="card"><div class="card-h">Zákazník<div class="card-h-act"><button type="button" class="btn gold" id="cu-msg">Napísať správu</button><button class="btn ghost" id="cu-back">Späť</button></div></div><div class="card-b">
    <div id="custmsg"></div>
    ${tabsHtml([{ id: 'z', label: 'Základné', html: zakladne }, { id: 'v', label: 'Vernosť a skupiny', html: vernost + skupiny }, { id: 'o', label: 'Objednávky', html: objednavky }, { id: 'p', label: 'Prístupy', html: pristupy }, { id: 'g', label: 'Ochrana údajov', html: ochrana }])}
    <div style="margin-top:16px"><button class="btn gold" id="cu-save">Uložiť</button></div>
  </div></div>`;
  wireTabs(view);
  const tierStart = view.querySelector('#tier-code')?.value;
  view.querySelector('#cu-back').onclick = () => vCustomers(view);
  view.querySelector('#cu-msg').onclick = () => vNewMessage(view, {
    customer: { id: c.id, first_name: c.first_name, last_name: c.last_name, email: c.email },
    back: () => vCustomerDetail(view, id),
  });
  view.querySelector('#cu-save').onclick = async () => {
    const msg = view.querySelector('#custmsg'); msg.innerHTML = '';
    try {
      await api(`/admin/customers/${id}`, { method: 'POST', body: { first_name: view.querySelector('#cu-first').value, last_name: view.querySelector('#cu-last').value } });
      for (const cb of view.querySelectorAll('[data-g]')) { const gid = cb.dataset.g, was = inG.has(gid);
        if (cb.checked && !was) await api(`/admin/customer-groups/${gid}/customers`, { method: 'POST', body: { add: [id] } });
        if (!cb.checked && was) await api(`/admin/customer-groups/${gid}/customers`, { method: 'POST', body: { remove: [id] } }); }
      const tierSel = view.querySelector('#tier-code');
      if (tierSel && tierSel.value !== tierStart) {
        await api(`/admin/nexus/customers/${encodeURIComponent(id)}/tier`, { method: 'POST', body: { tier_code: tierSel.value || 'automatic' } });
        return vCustomerDetail(view, id);
      }
      msg.innerHTML = '<div class="notice">Uložené.</div>';
    } catch (e) { if (e.message !== '401') msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
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
function subnav(view, items, idx = null) {
  const path = location.hash.replace(/^#\/?/, '').split('/');
  if (idx === null) { const requested = Number(path[1] || 0); idx = Number.isInteger(requested) && requested >= 0 && requested < items.length ? requested : 0; }
  const hash = '#/' + path[0] + (idx ? '/' + idx : '');
  history.replaceState(null, '', hash);
  root.querySelectorAll('.nav-item').forEach(link => { const on = link.getAttribute('href') === hash; link.classList.toggle('active', on); if (on) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  const a = document.querySelector('#actions');
  if (a) a.innerHTML = `<div class="pills">${items.map((it, i) => `<button class="pill ${i === idx ? 'on' : ''}" data-i="${i}">${esc(it.label)}</button>`).join('')}</div>`;
  if (a) a.querySelectorAll('.pill').forEach(b => b.onclick = () => { if (+b.dataset.i !== idx) subnav(view, items, +b.dataset.i); });
  window.scrollTo({ top: 0, behavior: 'instant' });
  Promise.resolve(items[idx].run(liveView(view))).catch(e => { if (e.message !== '401') liveView(view).innerHTML = `<div class="err">${esc(e.message)}</div>`; });
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
// mená zákazníkov a produktov pre karty (natívne Admin API, len na čítanie)
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
  view.innerHTML = pagedHtml({ tabs: V_TABS, active: status, items, count: d.count || 0, offset, empty: 'Zatiaľ neboli vydané žiadne darčekové poukazy. Po kúpe poukazu sa tu objaví.',
    card: v => `<div class="rc-body"><div class="rc-title">${esc(v.code)}</div><div class="rc-fields">
      <span class="rc-f"><em>Zostatok</em>${fmtEur(v.balance)} z ${fmtEur(v.initial_amount)}</span>
      <span class="rc-f"><em>Stav</em>${statusPill(V_STATUS, v.status)}</span>
      <span class="rc-f"><em>Platí do</em>${v.expires_at ? fmtDate(v.expires_at) : '—'}</span></div></div>` })
    + `<div class="card" style="margin-top:20px"><div class="card-h">Vrátiť peniaze na poukaz</div><div class="card-b">
      <p class="muted">Ak zákazník zaplatil objednávku darčekovým poukazom, môžete sumu vrátiť späť na jeho poukaz. Systém nepustí vrátiť viac, než bolo poukazom zaplatené.</p>
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
  view.innerHTML = `<div class="vs-layout"><div class="card"><div class="card-h">Nastavenie darčekových poukazov</div><div class="card-b">
    <p class="muted">Zmena platí pre nové poukazy. Už vydané poukazy si držia hodnotu, platnosť a pravidlá z dňa nákupu.</p>
    <div id="vsmsg">${notice || ''}</div>
    ${chk('vs-on', s.enabled, 'Poukazy sú v predaji na webe')}
    <div class="row" style="margin-top:12px"><div><label>Hodnoty v € (oddeľte medzerou, najviac 10)</label><input id="vs-values" value="${esc(s.values.map(x => String(x).replace('.', ',')).join(' '))}" placeholder="50 100 200"></div>
    <div><label>Platnosť (mesiace, 1–60)</label><input id="vs-months" type="number" min="1" max="60" step="1" value="${s.validity_months}"></div></div>
    <div class="row"><div><label>Doručenie</label><select id="vs-delivery">${Object.entries(VS_DELIVERY).map(([k, l]) => `<option value="${k}" ${s.delivery_method === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div><label>Kde sa dá poukaz použiť</label><select id="vs-scope"><option value="all" ${s.scope_type === 'all' ? 'selected' : ''}>na celý e-shop</option><option value="categories" ${s.scope_type === 'categories' ? 'selected' : ''}>len vo vybraných kategóriách</option></select></div></div>
    <div id="vs-cats" ${s.scope_type === 'categories' ? '' : 'hidden'}><label>Kategórie</label><div style="display:flex;flex-wrap:wrap;gap:4px 18px">${(cats || []).map(c => `<label style="display:flex;gap:6px;align-items:center;font-weight:400"><input type="checkbox" data-cat="${esc(c.id)}" style="width:auto" ${s.category_ids.includes(c.id) ? 'checked' : ''}> ${esc(c.name)}</label>`).join('') || '<span class="muted">Žiadne kategórie.</span>'}</div></div>
    ${chk('vs-partial', s.partial_redemption, 'Poukaz sa dá čerpať postupne (zostatok ostáva na ďalší nákup)')}
    <div style="margin-top:18px"><button class="btn gold" id="vs-save">Uložiť nastavenie</button></div>
  </div></div>
  <div class="card vs-preview"><div class="card-h">Takto vyzerá poukaz</div><div class="card-b"><style>${VOUCHER_CSS.replace(/(^|\n)\s*(\*|body)\{[^}]*\}/g, '').replace(/@media print\{.*\}\}/, '')}</style><div id="vs-card"></div>
    <p class="muted" style="margin-top:12px">Rovnaký dizajn dostane obdarovaný e-mailom a dá sa vytlačiť. Kód je tu len ukážka.</p></div></div></div>`;
  const $ = (q) => view.querySelector(q), msg = $('#vsmsg');
  const drawCard = () => {
    const first = Number(String($('#vs-values').value.split(/[;\s]+/).filter(Boolean)[0] || '').replace(',', '.')) || s.values[0] || 0;
    const m = Number($('#vs-months').value) || s.validity_months || 12, d = new Date(); d.setMonth(d.getMonth() + m);
    $('#vs-card').innerHTML = voucherHtml({ value: first, currency: 'eur', code: 'XXXX-XXXX', expires_at: d.toISOString() });
  };
  $('#vs-values').oninput = drawCard; $('#vs-months').oninput = drawCard; drawCard();
  $('#vs-scope').onchange = () => { $('#vs-cats').hidden = $('#vs-scope').value !== 'categories'; };
  $('#vs-save').onclick = async () => {
    const parts = $('#vs-values').value.split(/[;\s]+/).filter(Boolean);
    const values = parts.map(p => p.replace(',', '.'));
    const months = Number($('#vs-months').value), scope_type = $('#vs-scope').value;
    const category_ids = scope_type === 'categories' ? [...view.querySelectorAll('[data-cat]:checked')].map(x => x.dataset.cat) : [];
    const err = !values.length || values.length > 10 || values.some(v => !/^\d+(\.\d{1,2})?$/.test(v) || Number(v) < 1 || Number(v) > 10000) ? 'Hodnoty zadajte ako sumy od 1 do 10 000 € oddelené medzerou, najviac 10.'
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
// --- Zabezpečenie administrácie: 2FA a role vlastník/asistent ---
const vZabezpecenie = securityView({ api, esc, openPrintHtml, qrOtpSvg, freshView, isOwner });
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
  document.querySelectorAll('#actions .own-actions .pill').forEach(b => b.onclick = () => go({ status: b.dataset.st, offset: 0 }));
  view.innerHTML = pagedHtml({ tabs: null, active: status, items, count: d.count || 0, offset, empty: 'Zatiaľ tu nie sú žiadne konzultácie. Ako pridáte typy konzultácií a voľné termíny, rezervácie sa zobrazia tu.',
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
    ${inOrder && b.status === 'confirmed' ? `<p class="muted">Termín je zaplatený v objednávke. Zrušíte ho zrušením objednávky${b.order_id ? ` (<a href="#/objednavky" data-ord="${esc(b.order_id)}">otvoriť objednávku</a>)` : ''}; zákazníkovi odíde e-mail o zrušení a zaplatená suma sa mu automaticky vráti.</p>` : ''}
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
  const rangeHtml = (di, r, ri) => `<div class="availability-range av-range" data-r="${di}:${ri}"><input type="time" step="900" value="${esc(r.start_time)}" data-f="start_time" aria-label="Od"><span aria-hidden="true">–</span><input type="time" step="900" value="${esc(r.end_time)}" data-f="end_time" aria-label="Do"><button type="button" class="av-x" data-del="${di}:${ri}" aria-label="Odstrániť úsek" title="Odstrániť úsek">×</button></div>`;
  const mins = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  const openMin = days.reduce((a, x) => a + x.ranges.reduce((b, r) => b + Math.max(0, mins(r.end_time) - mins(r.start_time)), 0), 0);
  const openDays = days.filter(x => x.ranges.length).length;
  const hours = (m) => `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
  view.innerHTML = `${st.notice ? `<div class="notice">${esc(st.notice)}</div>` : ''}<div id="avmsg"></div>
    <div class="av-grid">
      <section class="av-card">
        <div class="av-card-head"><h3>Týždeň</h3><div class="av-nav"><button class="av-arrow" id="av-prev" aria-label="Predchádzajúci týždeň" title="Predchádzajúci týždeň">‹</button><strong>${esc(avDay(days[0]?.date || week, { day: 'numeric', month: 'numeric' }))} – ${esc(avDay(days.at(-1)?.date || avAdd(week, 6), { day: 'numeric', month: 'numeric', year: 'numeric' }))}</strong><button class="av-arrow" id="av-next" aria-label="Nasledujúci týždeň" title="Nasledujúci týždeň">›</button></div></div>
        <div class="availability-week av-list">${days.map((x, di) => `<div class="av-row${x.ranges.length ? '' : ' is-closed'}"><div class="av-day"><b>${esc(avDay(x.date, { weekday: 'short' }))}</b><span>${esc(avDay(x.date, { day: 'numeric', month: 'numeric' }))}</span></div>
          <div class="availability-slots av-slots">${x.ranges.map((r, ri) => rangeHtml(di, r, ri)).join('') || '<span class="av-closed">Zatvorené</span>'}<button type="button" class="av-add" data-add="${di}" aria-label="Pridať úsek" title="Pridať úsek">+</button></div></div>`).join('')}</div>
      </section>
      <section class="av-card">
        <div class="av-card-head"><h3>Rezervácie v týždni</h3><span class="av-count">${bookings.length}</span></div>
        ${bookings.length ? `<div class="av-bookings">${bookings.slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map(b => `<div class="av-booking"><div class="av-when"><b>${esc(avDay(avYmd(new Date(b.starts_at)), { weekday: 'short', day: 'numeric', month: 'numeric' }))}</b><span>${esc(avTime(b.starts_at))}–${esc(avTime(b.ends_at))}</span></div><div class="av-who"><div>${esc(b.customer?.name || '—')}</div><span>${esc(b.product?.title || '')}</span></div>${statusPill(B_STATUS, b.status)}</div>`).join('')}</div>` : '<p class="av-empty">Na tento týždeň zatiaľ nie je žiadna rezervácia.</p>'}
      </section>
      <section class="av-card">
        <div class="av-card-head"><h3>Súhrn</h3></div>
        <div class="av-stats"><div><b>${openDays}</b><span>${openDays === 1 ? 'otvorený deň' : openDays >= 2 && openDays <= 4 ? 'otvorené dni' : 'otvorených dní'}</span></div><div><b>${esc(hours(openMin))}</b><span>času na konzultácie</span></div></div>
        <p class="av-hint">Zadajte, kedy máte čas (čas Bratislava). Web z toho ponúkne termíny podľa dĺžky a pauzy každého typu. Deň bez úseku = zatvorené.${past ? ' Minulý týždeň sa už nemení.' : ''}</p>
        <div class="av-actions"><button class="btn gold av-save" id="av-save" ${past ? 'disabled' : ''}>Uložiť týždeň</button><button class="av-link" id="av-copy">Prevziať z predchádzajúceho týždňa</button></div>
      </section>
    </div>`;
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
  setActions('<button type="button" class="btn gold" id="sp-new">+ Nová správa</button>');
  const nb = document.querySelector('#sp-new'); if (nb) nb.onclick = () => vNewMessage(view);
  let d;
  try { d = await api(`/admin/chat/conversations?status=${status}&limit=${PAGE_LIMIT}&offset=${offset}`); }
  catch (e) { return loadError(view, e, () => go({})); }
  const items = d.conversations || [];
  view.innerHTML = (d.unread ? `<div class="notice">Neprečítané konverzácie: ${d.unread}</div>` : '') + pagedHtml({ tabs: C_TABS, active: status, items, count: d.count || 0, offset, empty: 'Zatiaľ tu nie sú žiadne konverzácie. Keď zákazník napíše z účtu na webe, správa sa zobrazí tu.',
    card: c => `<div class="rc-body"><div class="rc-title">${c.unread ? '● ' : ''}${esc(c.customer?.name || c.customer?.email || 'Zákazník')}</div><div class="rc-fields">
      <span class="rc-f"><em>Téma</em>${esc(c.subject || '—')}</span><span class="rc-f"><em>Posledná správa</em>${fmtDate(c.last_message_at)}</span>
      <span class="rc-f">${c.unread ? '<span class="pill warn">neprečítaná</span>' : ''}${c.status === 'closed' ? '<span class="pill off">uzavretá</span>' : ''}${c.muted ? ' <span class="pill off">stlmená</span>' : ''}${c.customer?.chat_blocked ? ' <span class="pill off">chat zablokovaný</span>' : ''}</span></div></div>` });
  wirePaged(view, { items, offset, go, open: c => vConversation(view, c.id, () => go({})) });
}
// --- Správy → Šablóny odpovedí: opakovane používané texty ---
// --- Správy → Nová správa: napísať zákazníkovi, ktorý ešte neodpovedal ---
async function vNewMessage(view, opts = {}) {
  view = freshView(view);
  const back = opts.back || (() => vSpravy(view));
  let customer = opts.customer || null;
  let timer = null;
  const say = (html) => { const box = view.querySelector('#nm-msg'); if (box) box.innerHTML = html; };
  const custName = (c) => [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.email || c.id;
  const renderChosen = () => {
    const box = view.querySelector('#nm-chosen');
    if (!box) return;
    box.innerHTML = customer
      ? `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><div class="rc" style="flex:1"><div class="rc-body"><div class="rc-title">${esc(custName(customer))}</div>
          <div class="rc-fields"><span class="rc-f"><em>E-mail</em>${esc(customer.email || '—')}</span></div></div></div>
        <button type="button" class="btn ghost sm" id="nm-clear">Zmeniť zákazníka</button></div>`
      : '<p class="muted">Zvoľte zákazníka vyhľadávaním podľa mena alebo e-mailu.</p>';
    const clear = box.querySelector('#nm-clear');
    if (clear) clear.onclick = () => { customer = null; renderChosen(); view.querySelector('#nm-search').focus(); };
  };
  view.innerHTML = `<div class="card"><div class="card-h">Nová správa<div class="card-h-act"><button type="button" class="btn ghost" id="nm-back">Späť</button></div></div><div class="card-b">
    <div id="nm-msg"></div>
    <div><label for="nm-search">Zákazník</label><input id="nm-search" type="search" placeholder="Hľadať podľa mena alebo e-mailu" autocomplete="off">
      <div id="nm-results" hidden style="margin-top:8px"></div></div>
    <div id="nm-chosen" style="margin-top:12px"></div>
    <div style="margin-top:14px"><label for="nm-subject">Téma správy (voliteľné)</label><input id="nm-subject" maxlength="120" placeholder="napr. Objednávka #12 – doprava"></div>
    <div style="margin-top:14px"><label>Text správy <button type="button" class="subtle-link" id="nm-tpl">vložiť šablónu</button></label><textarea id="nm-body" rows="6" maxlength="5000" required></textarea></div>
    <div id="nm-tpl-list" hidden style="margin-top:10px;border:1px solid var(--line);border-radius:10px;padding:10px;background:#fafbf7"></div>
    <div style="margin-top:12px"><button type="button" class="btn gold" id="nm-send">Odoslať správu</button> <span class="muted" style="font-size:12px">Zákazníkovi príde aj e-mail.</span></div>
  </div></div>`;
  renderChosen();
  view.querySelector('#nm-back').onclick = () => back();
  // Hľadanie zákazníka podľa mena alebo e-mailu
  const results = view.querySelector('#nm-results');
  const search = view.querySelector('#nm-search');
  search.oninput = () => {
    clearTimeout(timer);
    const q = search.value.trim();
    if (q.length < 2) { results.hidden = true; results.innerHTML = ''; return; }
    timer = setTimeout(async () => {
      let list = [];
      try { list = (await api(`/admin/customers?q=${encodeURIComponent(q)}&limit=8&fields=id,email,first_name,last_name`)).customers || []; }
      catch (e) {
        if (e.message === '401') throw e;
        results.hidden = false; results.innerHTML = `<div class="err">${esc(e.message)}</div>`; return;
      }
      results.hidden = false;
      results.innerHTML = list.length
        ? `<div style="display:flex;flex-direction:column;gap:6px">${list.map(c => `<button type="button" class="btn ghost sm" data-c="${esc(c.id)}" style="justify-content:flex-start;text-align:left">${esc(custName(c))} <span class="muted">${esc(c.email || '')}</span></button>`).join('')}</div>`
        : '<div class="muted">Nenašli sme žiadneho zákazníka.</div>';
      results.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
        const c = list.find(x => x.id === b.dataset.c);
        if (!c) return;
        customer = c; results.hidden = true; search.value = ''; renderChosen();
      });
    }, 300);
  };
  // Šablóny odpovedí (rovnaké ako pri odpovedi v konverzácii)
  const tplBox = view.querySelector('#nm-tpl-list');
  view.querySelector('#nm-tpl').onclick = async () => {
    if (!tplBox.hidden) { tplBox.hidden = true; return; }
    tplBox.hidden = false; tplBox.innerHTML = '<div class="muted">Načítavam šablóny…</div>';
    let templates = [];
    try { templates = (await api('/admin/chat/templates')).templates || []; }
    catch (e) { tplBox.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
    tplBox.innerHTML = templates.length
      ? `<div style="display:flex;flex-direction:column;gap:6px">${templates.map(t => `<button type="button" class="btn ghost sm" data-tpl="${esc(t.id)}" style="justify-content:flex-start;text-align:left">${esc(t.title)}</button>`).join('')}</div>`
      : '<div class="muted">Zatiaľ nemáte uložené žiadne šablóny. Vytvoríte ich v časti Správy → Šablóny odpovedí.</div>';
    tplBox.querySelectorAll('[data-tpl]').forEach(b => b.onclick = () => {
      const t = templates.find(x => x.id === b.dataset.tpl);
      if (!t) return;
      const area = view.querySelector('#nm-body');
      area.value = area.value ? `${area.value}\n${t.text}` : t.text;
      area.focus(); tplBox.hidden = true;
    });
  };
  // Odoslanie správy
  view.querySelector('#nm-send').onclick = async () => {
    const btn = view.querySelector('#nm-send');
    const body = view.querySelector('#nm-body').value.trim();
    say('');
    if (!customer) { say('<div class="err">Najprv vyberte zákazníka.</div>'); return; }
    if (!body) { say('<div class="err">Napíšte text správy.</div>'); return; }
    btn.disabled = true;
    try {
      const subject = view.querySelector('#nm-subject').value.trim();
      const res = await api('/admin/chat/conversations', { method: 'POST', body: { customer_id: customer.id, body, ...(subject ? { subject } : {}) } });
      await vConversation(view, res.conversation_id, back, 'Správa je odoslaná.');
    } catch (e) {
      if (e.message === '401') return;
      say(`<div class="err">${esc(e.message)}</div>`);
      btn.disabled = false;
    }
  };
}

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
// Newsletter: kampane, test a rozosielanie. Obrazovka je v samostatnom module.
let newsletterScreen;
function vNewsletter(view) {
  newsletterScreen ||= newsletterView({ api, esc, fmtDate, freshView });
  return newsletterScreen(view);
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
    <p class="muted" style="margin-top:0">${esc(page.description || '')} Píšte tak, ako by ste chceli, aby si text čítal zákazník – bez značiek a kódu.</p>
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
      await api('/admin/pages', { method: 'POST', body: { slug, html: cleanRichText(editor.innerHTML), revision: page.revision || '' } });
      msg.innerHTML = '<div class="ok">Znenie je uložené. Na webe sa zobrazí podľa adresy stránky.</div>';
      await vPageTextEdit(view, slug);
    } catch (e) {
      if (e.message === '401') throw e;
      // Obsah medzitým zmenil niekto iný – povieme to a ponúkneme obnovenie stránky.
      if (/zmenil niekto iný/i.test(e.message || '')) {
        msg.innerHTML = `<div class="notice">${esc(e.message)} <button type="button" class="btn ghost sm" id="pt-reload">Obnoviť stránku</button></div>`;
        msg.querySelector('#pt-reload').onclick = () => vPageTextEdit(view, slug);
      } else {
        msg.innerHTML = `<div class="err">${esc(e.message)}</div>`;
      }
      btn.disabled = false;
    }
  };
  view.querySelector('#pt-reset').onclick = async () => {
    if (!confirm('Obnoviť pôvodné znenie tejto stránky? Zmena, ktorú ste uložili, sa zahodí.')) return;
    const btn = view.querySelector('#pt-reset');
    msg.innerHTML = ''; btn.disabled = true;
    try {
      await api(`/admin/pages/${encodeURIComponent(slug)}`, { method: 'DELETE', body: { revision: page.revision || '' } });
      msg.innerHTML = '<div class="ok">Pôvodné znenie je obnovené.</div>';
      await vPageTextEdit(view, slug);
    } catch (e) {
      if (e.message === '401') throw e;
      if (/zmenil niekto iný/i.test(e.message || '')) {
        msg.innerHTML = `<div class="notice">${esc(e.message)} <button type="button" class="btn ghost sm" id="pt-reload">Obnoviť stránku</button></div>`;
        msg.querySelector('#pt-reload').onclick = () => vPageTextEdit(view, slug);
      } else {
        msg.innerHTML = `<div class="err">${esc(e.message)}</div>`;
      }
      btn.disabled = false;
    }
  };
}
// --- Obsah → Médiá: knihovna verejných obrázkov ---
// Výber z mediálnej banky: mriežka náhľadov, hľadanie podľa názvu, výber viacerých fotiek. Vracia zoznam URL (prázdny pri zrušení).
function pickMedia(assigned = []) {
  return new Promise(resolve => {
    const dlg = document.createElement('dialog'); dlg.className = 'mp';
    const chosen = new Set(); let files = [];
    dlg.innerHTML = `<form method="dialog" class="mp-box"><header class="mp-head"><h2>Mediálna banka</h2><button type="submit" value="" class="btn ghost sm" aria-label="Zavrieť">✕</button></header>
      <div class="mp-tools"><input type="search" class="mp-search" placeholder="Hľadať podľa názvu súboru…" autocomplete="off"><select class="mp-filter"><option value="">Všetky</option><option value="free">Nepriradené k produktu</option><option value="new">Nahraté za 30 dní</option></select></div>
      <div class="mp-grid"><div class="muted">Načítavam mediálnu banku…</div></div>
      <footer class="mp-foot"><span class="muted mp-count"></span><div><button type="submit" value="" class="btn ghost">Zrušiť</button> <button type="button" class="btn gold mp-ok" disabled>Priradiť vybrané fotografie (0)</button></div></footer></form>`;
    document.body.appendChild(dlg);
    const grid = dlg.querySelector('.mp-grid'), ok = dlg.querySelector('.mp-ok'), q = dlg.querySelector('.mp-search'), filter = dlg.querySelector('.mp-filter');
    const sync = () => { ok.disabled = !chosen.size; ok.textContent = `Priradiť vybrané fotografie (${chosen.size})`; };
    const draw = () => {
      const term = q.value.trim().toLowerCase(), since = Date.now() - 30 * 864e5;
      const list = files.filter(f => (!term || String(f.name || '').toLowerCase().includes(term)) && (filter.value !== 'free' || !assigned.includes(f.url)) && (filter.value !== 'new' || new Date(f.uploaded_at).getTime() >= since));
      dlg.querySelector('.mp-count').textContent = `${list.length} z ${files.length} súborov`;
      grid.innerHTML = list.map(f => `<button type="button" class="mp-item" data-url="${esc(f.url)}" aria-pressed="${chosen.has(f.url)}" title="${esc(f.name)}"><img src="${esc(f.url)}" alt="" loading="lazy"><span class="mp-check" aria-hidden="true">✓</span>${assigned.includes(f.url) ? '<span class="mp-tag">už v produkte</span>' : ''}<small>${esc(f.name)}</small></button>`).join('') || '<div class="empty">Nič sa nenašlo. Obrázky nahráte v sekcii Médiá.</div>';
    };
    grid.onclick = e => { const b = e.target.closest('.mp-item'); if (!b) return; const u = b.dataset.url; chosen.has(u) ? chosen.delete(u) : chosen.add(u); b.setAttribute('aria-pressed', String(chosen.has(u))); sync(); };
    q.oninput = draw; filter.onchange = draw;
    ok.onclick = () => dlg.close('ok');
    dlg.addEventListener('close', () => { const out = dlg.returnValue === 'ok' ? [...chosen] : []; dlg.remove(); resolve(out); });
    dlg.showModal();
    api('/admin/media').then(d => { files = (d.files || []).filter(f => /^image\//.test(f.content_type || 'image/') && f.url).sort((a, b) => String(b.uploaded_at).localeCompare(String(a.uploaded_at))); draw(); })
      .catch(e => { grid.innerHTML = `<div class="err">${esc(e.message === '401' ? 'Prihlásenie vypršalo. Obnovte stránku.' : e.message)}</div>`; });
  });
}

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
    <label class="md-drop" id="md-drop">
      <input type="file" id="md-file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple class="sr-only">
      <b>Pretiahnite obrázky sem</b><span>alebo <u>vyberte z počítača</u> · JPG, PNG, WebP</span>
    </label>
    <button type="button" class="btn gold" id="md-upload" hidden>Nahrať obrázky</button>
    <style>.md-drop{display:flex;flex-direction:column;align-items:center;gap:4px;padding:26px 16px;margin-bottom:16px;border:1.5px dashed #c9bfe0;border-radius:12px;background:rgba(255,255,255,.6);cursor:pointer;text-align:center}.md-drop b{font-weight:500}.md-drop span{color:var(--muted);font-size:13px}.md-drop.over,.md-drop:hover{border-color:#73729c;background:#f4f2fa}</style>
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
  // Výber alebo pretiahnutie súborov hneď spustí nahrávanie.
  const drop = view.querySelector('#md-drop'), fileInput = view.querySelector('#md-file');
  fileInput.onchange = () => { if (fileInput.files.length) upload.click(); };
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer?.files?.length) { fileInput.files = e.dataTransfer.files; upload.click(); } };
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
// --- Ambasádori: program odporúčania zákazníkov za províziu ---
const AMBASSADOR_STATUS = { active: ['aktívny', 'ok'], paused: ['pozastavený', 'off'], draft: ['rozpracovaný', 'off'] };
async function vAmbasadori(view) {
  view = freshView(view);
  view.innerHTML = '<div class="card"><div class="card-b"><p class="muted">Načítavam zoznam ambasádorov…</p></div></div>';
  let data = { ambassadors: [], count: 0, totals: {} };
  let settings = { enabled: true, default_percent: 10, cookie_days: 30 };
  try {
    const [resAmb, resSet] = await Promise.all([
      api('/admin/ambassadors'),
      api('/admin/ambassadors/settings').catch(() => ({ settings: { enabled: true, default_percent: 10, cookie_days: 30 } })),
    ]);
    data = resAmb;
    settings = resSet.settings || settings;
  } catch (err) {
    view.innerHTML = `<div class="card" style="max-width:1120px;margin:0 auto"><div class="card-h">Ambasádori</div><div class="card-b"><div class="notice"><b>Ambasadorský program</b> je v aplikácii pripravený. Backend jadro na adrese <code>${esc(API)}</code> momentálne čaká na nasadenie ambasadorského modulu.</div><p class="muted">Po nasadení backendu sa tu automaticky zobrazí kompletná správa partnerov, provízie a partnerské odkazy.</p><button class="btn ghost" id="am-retry">Skontrolovať spojenie znova</button></div></div>`;
    view.querySelector('#am-retry').onclick = () => vAmbasadori(view);
    return;
  }

  const { ambassadors = [], totals = {} } = data;

  const kpis = `
    <div class="grid-4" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:16px;margin-bottom:16px">
      <div class="card card-kpi"><div class="card-b"><div class="kpi-num">${totals.total_ambassadors ?? 0}</div><div class="kpi-label">Ambasádori celkom</div><small class="muted">${totals.active_ambassadors ?? 0} aktívnych</small></div></div>
      <div class="card card-kpi"><div class="card-b"><div class="kpi-num">${fmtEur(totals.total_revenue ?? 0)}</div><div class="kpi-label">Obrat z odporúčaní</div><small class="muted">${totals.total_orders ?? 0} objednávok</small></div></div>
      <div class="card card-kpi"><div class="card-b"><div class="kpi-num" style="color:var(--c-primary, #7E63A8)">${fmtEur(totals.total_commission ?? 0)}</div><div class="kpi-label">Celková provízia</div><small class="muted">za celú dobu</small></div></div>
      <div class="card card-kpi"><div class="card-b"><div class="kpi-num" style="color:${(totals.total_pending ?? 0) > 0 ? 'var(--c-danger, #B42318)' : 'inherit'}">${fmtEur(totals.total_pending ?? 0)}</div><div class="kpi-label">Na vyplatenie</div><small class="muted">zatiaľ nevyplatené</small></div></div>
    </div>
  `;

  view.innerHTML = `
    ${kpis}
    <div class="card" style="margin-bottom:16px">
      <div class="card-h">
        Ambasádori
        <div class="card-h-act">
          <button class="btn primary" id="am-btn-new">+ Nový ambasádor</button>
        </div>
      </div>
      <div class="card-b">
        <p class="muted" style="margin-top:0">Ambasadorský program umožňuje partnerom a spokojným zákazníkom odporúčať produkty ANASTASIA cez osobný odkaz a získavať províziu z privedených nákupov.</p>
        
        <div id="am-new-box" class="side-card" style="display:none;margin-bottom:16px;background:var(--bg-subtle, #FAF7F2);border:1px solid var(--b-subtle, #E4DDD3);border-radius:12px;padding:16px">
          <h3 style="margin-top:0">Nový ambasádor</h3>
          <div class="row">
            <div><label>Meno a priezvisko</label><input type="text" id="am-new-name" placeholder="napr. Mária Kováčová" maxlength="100"></div>
            <div><label>E-mail *</label><input type="email" id="am-new-email" placeholder="maria@priklad.sk" required maxlength="120"></div>
          </div>
          <div class="row" style="margin-top:12px">
            <div><label>Kód odporúčania *</label><input type="text" id="am-new-code" placeholder="napr. MARIA10" maxlength="24" style="text-transform:uppercase" required><small class="muted">Tento kód bude v odkaze ?ref=KÓD</small></div>
            <div><label>Výška provízie (%)</label><input type="number" id="am-new-commission" min="0" max="100" step="1" value="${settings.default_percent}"></div>
          </div>
          <div class="row" style="margin-top:12px">
            <div><label>Interná poznámka</label><input type="text" id="am-new-note" placeholder="napr. Inštruktorka jogy, kontakt z Instagramu" maxlength="250"></div>
            <div><label>Stav</label><select id="am-new-status"><option value="active">Aktívny</option><option value="paused">Pozastavený</option></select></div>
          </div>
          <div id="am-new-msg" style="margin-top:10px"></div>
          <div style="margin-top:14px;display:flex;gap:8px">
            <button class="btn primary" id="am-new-submit">Uložiť ambasádora</button>
            <button class="btn ghost" id="am-new-cancel">Zrušiť</button>
          </div>
        </div>

        ${ambassadors.length ? `
          <div class="ot-wrap">
            <table class="ot lv">
              <thead>
                <tr>
                  <th>Meno a kontakt</th>
                  <th>Kód odporúčania</th>
                  <th>Provízia (%)</th>
                  <th>Objednávky</th>
                  <th>Obrat</th>
                  <th>Provízia spolu</th>
                  <th>K výplate</th>
                  <th>Stav</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${ambassadors.map(a => `
                  <tr data-id="${esc(a.id)}" tabindex="0" role="link">
                    <td><b>${esc(a.name)}</b><br><small class="muted">${esc(a.email)}</small></td>
                    <td><code>${esc(a.code)}</code></td>
                    <td>${esc(String(a.commission_percent))}&nbsp;%</td>
                    <td>${a.orders_count}</td>
                    <td>${fmtEur(a.revenue)}</td>
                    <td>${fmtEur(a.commission_total)}</td>
                    <td style="font-weight:600;color:${a.commission_pending > 0 ? 'var(--c-danger, #B42318)' : 'inherit'}">${fmtEur(a.commission_pending)}</td>
                    <td>${statusPill(AMBASSADOR_STATUS, a.status || 'draft')}</td>
                    <td style="text-align:right"><button class="btn ghost" style="padding:4px 8px;font-size:12px" data-open="${esc(a.id)}">Detail →</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : '<div class="empty">Zatiaľ nemáte žiadnych ambasádorov. Kliknite na <b>+ Nový ambasádor</b> a pridajte prvého.</div>'}
      </div>
    </div>

    <div class="card">
      <div class="card-h">Nastavenie ambasadorského programu</div>
      <div class="card-b">
        <p class="muted" style="margin-top:0">Tieto pravidlá platia pre všetkých novovzniknutých ambasádorov a pre výpočet platnosti kliknutia na partnerský odkaz.</p>
        <div class="row">
          <div>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" id="am-set-enabled" ${settings.enabled ? 'checked' : ''}>
              <span>Zapnúť ambasadorský program (priraďovanie odporúčaní)</span>
            </label>
          </div>
          <div></div>
        </div>
        <div class="row" style="margin-top:12px">
          <div>
            <label>Predvolená provízia (%)</label>
            <input type="number" id="am-set-percent" min="0" max="100" step="1" value="${settings.default_percent}">
            <small class="muted">Nastaví sa automaticky novým ambasádorom (dá sa upraviť individuálne).</small>
          </div>
          <div>
            <label>Platnosť odporúčania (dni)</label>
            <input type="number" id="am-set-days" min="1" max="365" step="1" value="${settings.cookie_days}">
            <small class="muted">Koľko dní od kliknutia na odkaz sa nákup pripočíta ambasádorovi.</small>
          </div>
        </div>
        <div id="am-set-msg" style="margin-top:10px"></div>
        <div style="margin-top:14px">
          <button class="btn primary" id="am-set-save">Uložiť nastavenia</button>
        </div>
      </div>
    </div>
  `;

  // Bind new ambassador toggle and save
  const newBox = view.querySelector('#am-new-box');
  const btnNew = view.querySelector('#am-btn-new');
  btnNew.onclick = () => {
    newBox.style.display = newBox.style.display === 'none' ? 'block' : 'none';
    if (newBox.style.display === 'block') view.querySelector('#am-new-name').focus();
  };
  view.querySelector('#am-new-cancel').onclick = () => { newBox.style.display = 'none'; };

  const codeInput = view.querySelector('#am-new-code');
  codeInput.oninput = () => { codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''); };

  view.querySelector('#am-new-submit').onclick = async () => {
    const name = view.querySelector('#am-new-name').value.trim();
    const email = view.querySelector('#am-new-email').value.trim();
    const code = codeInput.value.trim().toUpperCase();
    const comm = Number(view.querySelector('#am-new-commission').value);
    const note = view.querySelector('#am-new-note').value.trim();
    const status = view.querySelector('#am-new-status').value;
    const msg = view.querySelector('#am-new-msg');

    if (!email) { msg.innerHTML = '<div class="err">Zadajte e-mail ambasádora.</div>'; return; }
    if (!code || code.length < 3) { msg.innerHTML = '<div class="err">Zadajte kód (aspoň 3 znaky).</div>'; return; }

    msg.innerHTML = '<div class="muted">Ukladám…</div>';
    try {
      await api('/admin/ambassadors', {
        method: 'POST',
        body: { name, email, code, commission_percent: comm, note, status },
      });
      vAmbasadori(view);
    } catch (err) {
      msg.innerHTML = `<div class="err">${esc(err.message)}</div>`;
    }
  };

  // Bind settings save
  view.querySelector('#am-set-save').onclick = async () => {
    const enabled = view.querySelector('#am-set-enabled').checked;
    const default_percent = Number(view.querySelector('#am-set-percent').value);
    const cookie_days = Number(view.querySelector('#am-set-days').value);
    const msg = view.querySelector('#am-set-msg');

    msg.innerHTML = '<div class="muted">Ukladám nastavenia…</div>';
    try {
      await api('/admin/ambassadors/settings', {
        method: 'POST',
        body: { enabled, default_percent, cookie_days },
      });
      msg.innerHTML = '<div class="ok">Nastavenia ambasadorského programu boli úspešne uložené.</div>';
      setTimeout(() => { if (msg.innerHTML.includes('úspešne')) msg.innerHTML = ''; }, 3500);
    } catch (err) {
      msg.innerHTML = `<div class="err">${esc(err.message)}</div>`;
    }
  };

  // Click on row to open detail
  view.querySelectorAll('[data-id]').forEach(row => {
    row.onclick = (e) => {
      if (e.target.closest('button')) return;
      vAmbasadorDetail(view, row.dataset.id);
    };
  });
  view.querySelectorAll('[data-open]').forEach(btn => {
    btn.onclick = () => vAmbasadorDetail(view, btn.dataset.open);
  });
}

async function vAmbasadorDetail(view, id) {
  view = freshView(view);
  view.innerHTML = '<div class="card"><div class="card-b"><p class="muted">Načítavam detail ambasádora…</p></div></div>';
  let data;
  try {
    data = await api(`/admin/ambassadors/${id}`);
  } catch (err) {
    view.innerHTML = `<div class="card"><div class="card-h">Ambasádor</div><div class="card-b"><div class="err">${esc(err.message)}</div><button class="btn" id="am-back">Späť na zoznam</button></div></div>`;
    view.querySelector('#am-back').onclick = () => vAmbasadori(view);
    return;
  }

  const { ambassador: a, orders = [] } = data;
  const storefrontOrigin = (typeof window !== 'undefined' && window.location.hostname.includes('test'))
    ? 'https://anastasia-test.l-code-dynamics.com'
    : 'https://anastasiaoz.eu';
  const referralLink = `${storefrontOrigin}/?ref=${encodeURIComponent(a.code)}`;

  view.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="card-h">
        ${esc(a.name)}
        <div class="card-h-act">
          ${statusPill(AMBASSADOR_STATUS, a.status || 'draft')}
          <button class="btn ghost" id="am-back">← Späť na zoznam</button>
        </div>
      </div>
      <div class="card-b">
        <div class="row">
          <div><label>E-mail</label><div>${esc(a.email || '—')}</div></div>
          <div><label>Dátum registrácie</label><div>${fmtDate(a.joined_at)}</div></div>
        </div>
        
        <div style="margin-top:16px;background:var(--bg-subtle, #FAF7F2);border:1px solid var(--b-subtle, #E4DDD3);border-radius:12px;padding:16px">
          <label style="font-weight:600">Odkaz na odporúčanie pre tohto ambasádora</label>
          <div style="display:flex;gap:8px;margin-top:6px;align-items:center">
            <input type="text" id="am-link-input" value="${esc(referralLink)}" readonly style="flex:1;background:#fff;cursor:text">
            <button class="btn primary" id="am-copy-btn">Kopírovať odkaz</button>
          </div>
          <div id="am-copy-msg" style="margin-top:4px;font-size:12px"></div>
        </div>

        <div class="grid-4" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:16px;margin-top:16px">
          <div class="card card-kpi" style="border:1px solid var(--b-subtle, #E4DDD3)"><div class="card-b"><div class="kpi-num">${fmtEur(a.revenue)}</div><div class="kpi-label">Celkový obrat</div><small class="muted">${a.orders_count} objednávok</small></div></div>
          <div class="card card-kpi" style="border:1px solid var(--b-subtle, #E4DDD3)"><div class="card-b"><div class="kpi-num" style="color:var(--c-primary, #7E63A8)">${fmtEur(a.commission_total)}</div><div class="kpi-label">Provízia celkom</div><small class="muted">${a.commission_percent}&nbsp;% z nákupu</small></div></div>
          <div class="card card-kpi" style="border:1px solid var(--b-subtle, #E4DDD3)"><div class="card-b"><div class="kpi-num" style="color:var(--c-success, #2D6A4F)">${fmtEur(a.commission_paid)}</div><div class="kpi-label">Vyplatené</div><small class="muted">${(a.payouts || []).length} výplat</small></div></div>
          <div class="card card-kpi" style="border:1px solid var(--b-subtle, #E4DDD3)"><div class="card-b"><div class="kpi-num" style="color:${a.commission_pending > 0 ? 'var(--c-danger, #B42318)' : 'inherit'}">${fmtEur(a.commission_pending)}</div><div class="kpi-label">Zostáva k výplate</div><small class="muted">nevyrovnaný zostatok</small></div></div>
        </div>
      </div>
    </div>

    <div class="grid-2" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:16px;margin-bottom:16px">
      <div class="card">
        <div class="card-h">Úprava ambasádora</div>
        <div class="card-b">
          <div><label>Kód odporúčania</label><input type="text" id="am-edit-code" value="${esc(a.code)}" style="text-transform:uppercase" maxlength="24"></div>
          <div style="margin-top:12px"><label>Provízia (%)</label><input type="number" id="am-edit-comm" min="0" max="100" step="1" value="${a.commission_percent}"></div>
          <div style="margin-top:12px"><label>Stav</label><select id="am-edit-status"><option value="active" ${a.status === 'active' ? 'selected' : ''}>Aktívny</option><option value="paused" ${a.status === 'paused' ? 'selected' : ''}>Pozastavený</option></select></div>
          <div style="margin-top:12px"><label>Interná poznámka</label><input type="text" id="am-edit-note" value="${esc(a.note || '')}" maxlength="250"></div>
          <div id="am-edit-msg" style="margin-top:10px"></div>
          <div style="margin-top:14px"><button class="btn primary" id="am-edit-submit">Uložiť zmeny</button></div>
        </div>
      </div>

      <div class="card">
        <div class="card-h">Zaznamenať výplatu provízie</div>
        <div class="card-b">
          <p class="muted" style="margin-top:0">Po odoslaní peňazí na účet ambasádora zaznamenajte výplatu, aby sa znížila suma k výplate.</p>
          <div><label>Suma výplaty (€)</label><input type="number" id="am-pay-amount" min="0.01" step="0.01" value="${a.commission_pending > 0 ? a.commission_pending : ''}" placeholder="0,00"></div>
          <div style="margin-top:12px"><label>Obdobie / Variabilný symbol / Poznámka</label><input type="text" id="am-pay-period" placeholder="napr. Provízia 10/2026, prevod VÚB" maxlength="150"></div>
          <div id="am-pay-msg" style="margin-top:10px"></div>
          <div style="margin-top:14px"><button class="btn success" id="am-pay-submit">Zaznamenať vyplatenie</button></div>
          
          ${(a.payouts && a.payouts.length) ? `
            <div style="margin-top:16px;border-top:1px solid var(--b-subtle, #E4DDD3);padding-top:12px">
              <label style="font-weight:600">História výplat</label>
              <ul style="margin:8px 0 0;padding-left:18px;font-size:13px">
                ${a.payouts.map(p => `
                  <li style="margin-bottom:6px">
                    <b>${fmtEur(p.amount)}</b> · ${fmtDate(p.created_at)}
                    ${p.period ? `<br><small class="muted">${esc(p.period)}</small>` : ''}
                  </li>
                `).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-h">Privedené objednávky (${orders.length})</div>
      <div class="card-b">
        ${orders.length ? `
          <div class="ot-wrap">
            <table class="ot lv">
              <thead>
                <tr>
                  <th>Objednávka</th>
                  <th>Dátum</th>
                  <th>Zákazník</th>
                  <th>Suma</th>
                  <th>Provízia</th>
                  <th>Stav objednávky</th>
                  <th>Stav platby</th>
                </tr>
              </thead>
              <tbody>
                ${orders.map(o => `
                  <tr>
                    <td><b>#${esc(String(o.display_id || o.id))}</b></td>
                    <td>${fmtDate(o.created_at)}</td>
                    <td>${esc(o.customer_name)}</td>
                    <td>${fmtEur(o.total)}</td>
                    <td style="font-weight:600;color:var(--c-primary, #7E63A8)">${fmtEur(o.commission_amount)}</td>
                    <td><span class="pill ${o.order_status === 'canceled' ? 'err' : 'ok'}">${esc(o.order_status)}</span></td>
                    <td><span class="pill ${o.payment_status === 'captured' ? 'ok' : 'warn'}">${esc(o.payment_status)}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : '<div class="empty">Zatiaľ cez tohto ambasádora neprebehla žiadna objednávka. Akonáhle niekto nakúpi cez jeho odkaz, objednávka sa zobrazí tu.</div>'}
      </div>
    </div>
  `;

  view.querySelector('#am-back').onclick = () => vAmbasadori(view);

  // Copy referral link
  view.querySelector('#am-copy-btn').onclick = async () => {
    const input = view.querySelector('#am-link-input');
    const msg = view.querySelector('#am-copy-msg');
    try {
      await navigator.clipboard.writeText(input.value);
      msg.innerHTML = '<span class="ok">Odkaz bol skopírovaný do schránky!</span>';
    } catch {
      input.select();
      document.execCommand('copy');
      msg.innerHTML = '<span class="ok">Odkaz skopírovaný!</span>';
    }
    setTimeout(() => { msg.innerHTML = ''; }, 3000);
  };

  // Edit ambassador
  const editCode = view.querySelector('#am-edit-code');
  editCode.oninput = () => { editCode.value = editCode.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''); };
  view.querySelector('#am-edit-submit').onclick = async () => {
    const code = editCode.value.trim().toUpperCase();
    const comm = Number(view.querySelector('#am-edit-comm').value);
    const status = view.querySelector('#am-edit-status').value;
    const note = view.querySelector('#am-edit-note').value.trim();
    const msg = view.querySelector('#am-edit-msg');

    msg.innerHTML = '<div class="muted">Ukladám…</div>';
    try {
      await api(`/admin/ambassadors/${id}`, {
        method: 'POST',
        body: { code, commission_percent: comm, status, note },
      });
      vAmbasadorDetail(view, id);
    } catch (err) {
      msg.innerHTML = `<div class="err">${esc(err.message)}</div>`;
    }
  };

  // Record payout
  view.querySelector('#am-pay-submit').onclick = async () => {
    const amount = Number(view.querySelector('#am-pay-amount').value);
    const period = view.querySelector('#am-pay-period').value.trim();
    const msg = view.querySelector('#am-pay-msg');

    if (!amount || amount <= 0) {
      msg.innerHTML = '<div class="err">Zadajte platnú sumu výplaty.</div>';
      return;
    }

    msg.innerHTML = '<div class="muted">Ukladám výplatu…</div>';
    try {
      await api(`/admin/ambassadors/${id}`, {
        method: 'POST',
        body: { action: 'payout', amount, period },
      });
      vAmbasadorDetail(view, id);
    } catch (err) {
      msg.innerHTML = `<div class="err">${esc(err.message)}</div>`;
    }
  };
}

// --- Obsah → Preklady: Správca jazykových mutácií (SK / EN / RU) ---
async function vTranslationsManager(view) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam preklady produktov a webu…</div>';
  let products = [];
  try {
    const res = await api('/admin/products?limit=100&fields=id,title,status,thumbnail,metadata');
    products = res.products || [];
  } catch (e) {
    if (e.message === '401') throw e;
    view.innerHTML = `<div class="err">Nepodarilo sa načítať produkty: ${esc(e.message)}</div>`;
    return;
  }

  let filter = 'all'; // all, missing_en, missing_ru

  const render = () => {
    const filtered = products.filter(p => {
      const tr = p.metadata?.translations || {};
      const hasEn = !!(tr.en?.title || tr.en?.subtitle);
      const hasRu = !!(tr.ru?.title || tr.ru?.subtitle);
      if (filter === 'missing_en') return !hasEn;
      if (filter === 'missing_ru') return !hasRu;
      return true;
    });

    const total = products.length;
    const withEn = products.filter(p => !!(p.metadata?.translations?.en?.title)).length;
    const withRu = products.filter(p => !!(p.metadata?.translations?.ru?.title)).length;

    view.innerHTML = `
      <div class="card" style="margin-bottom:20px">
        <div class="card-h">
          <div>
            <h2 style="margin:0;font-size:18px">Jazykové mutácie e-shopu a katalógu</h2>
            <p class="muted" style="margin:4px 0 0;font-size:13px">Správa anglických a ruských názvov, podtitulov a popisov produktov.</p>
          </div>
          <div class="card-h-act">
            <span class="pill ok">SK 100%</span>
            <span class="pill ${withEn === total ? 'ok' : 'warn'}">EN ${withEn}/${total}</span>
            <span class="pill ${withRu === total ? 'ok' : 'warn'}">RU ${withRu}/${total}</span>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
          <button type="button" class="btn ${filter === 'all' ? 'gold' : 'ghost'} sm" data-f="all">Všetky produkty (${total})</button>
          <button type="button" class="btn ${filter === 'missing_en' ? 'gold' : 'ghost'} sm" data-f="missing_en">Chýba EN (${total - withEn})</button>
          <button type="button" class="btn ${filter === 'missing_ru' ? 'gold' : 'ghost'} sm" data-f="missing_ru">Chýba RU (${total - withRu})</button>
        </div>
      </div>

      <div class="tbl-wrap">
        <table class="tbl">
          <thead>
            <tr>
              <th style="width:48px"></th>
              <th>Produkt (SK)</th>
              <th>Anglický názov (EN)</th>
              <th>Ruský názov (RU)</th>
              <th style="text-align:right">Akcia</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(p => {
              const tr = p.metadata?.translations || {};
              const enTitle = tr.en?.title || '';
              const ruTitle = tr.ru?.title || '';
              return `
                <tr>
                  <td>${p.thumbnail ? `<img src="${esc(p.thumbnail)}" alt="" style="width:36px;height:36px;border-radius:6px;object-fit:cover">` : '<div style="width:36px;height:36px;background:var(--border);border-radius:6px"></div>'}</td>
                  <td><b>${esc(p.title)}</b></td>
                  <td>${enTitle ? `<span style="color:var(--text)">${esc(enTitle)}</span>` : '<span class="pill off">chýba</span>'}</td>
                  <td>${ruTitle ? `<span style="color:var(--text)">${esc(ruTitle)}</span>` : '<span class="pill off">chýba</span>'}</td>
                  <td style="text-align:right">
                    <button type="button" class="btn ghost sm" data-edit-trans="${esc(p.id)}">Upraviť preklad</button>
                  </td>
                </tr>
              `;
            }).join('') || '<tr><td colspan="5" class="empty">Žiadne produkty nezodpovedajú filtru.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    view.querySelectorAll('[data-f]').forEach(b => {
      b.onclick = () => { filter = b.dataset.f; render(); };
    });

    view.querySelectorAll('[data-edit-trans]').forEach(b => {
      b.onclick = () => vProductDetail(view, b.dataset.editTrans, { tab: 'jazyky' });
    });
  };

  render();
}

const vObsah = (view) => subnav(view, [
  { label: 'E-maily', run: vEmaily },
  { label: 'Newsletter', run: vNewsletter },
  { label: 'Stránky a texty', run: vPageTexts },
  { label: 'Médiá', run: vMediaLibrary },
  { label: 'Preklady', run: vTranslationsManager },
]);
// --- Doprava a platby: prehľad z jadra len na čítanie (žiadne kľúče, žiadne tajomstvá) ---
const PROVIDER_LABEL = { pp_system_default: 'Manuálna platba (bez brány)', pp_cod_cod: 'Na dobierku (poplatok je v cene dopravy „Kuriér – dobierka“)', pp_bank_transfer_bank_transfer: 'Prevodom na účet', pp_stripe_stripe: 'Platobná karta', pp_membership_stripe_membership: 'Platobná karta – predplatné Klubu', manual_manual: 'Vlastná doprava' };
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
  // Cena pri hodnote tovaru (pravidlo item_total, napr. doprava zdarma od 60 €) – zobrazuje sa, čo drží jadro, nič sa tu nepočíta.
  const tierOf = (o) => (o.prices || []).filter(x => x.currency_code === 'eur')
    .map(x => ({ amount: Number(x.amount), rule: (x.price_rules || []).find(r => r.attribute === 'item_total' && ['gte', 'gt'].includes(r.operator)) }))
    .filter(x => x.rule && Number.isFinite(x.amount) && Number(x.rule.value) > 0)
    .sort((a, b) => Number(a.rule.value) - Number(b.rule.value))[0] || null;
  const optionsHtml = !so ? unread : `<div class="rc-grid">${options.map(o => { const pr = eurPrice(o), ret = (o.rules || []).some(x => x.attribute === 'is_return' && String(x.value) === 'true');
    const tier = tierOf(o);
    return `<div class="rc"><div class="rc-body"><div class="rc-title">${esc(o.name)}</div><div class="rc-fields">
      <span class="rc-f"><em>Cena</em>${o.price_type === 'calculated' ? 'počíta dopravca' : pr ? (Number(pr.amount) === 0 ? 'zadarmo' : fmtEur(pr.amount)) : '<span class="pill warn">bez ceny v EUR</span>'}</span>
      ${tier && pr && Number(pr.amount) !== tier.amount ? `<span class="rc-f"><em>Od ${esc(fmtEur(tier.rule.value))} tovaru</em>${tier.amount === 0 ? 'zadarmo' : esc(fmtEur(tier.amount))}</span>` : ''}
      <span class="rc-f"><em>Dopravca</em>${esc(provLabel(o.provider_id))}</span>
      <span class="rc-f"><em>Oblasť</em>${esc(o.service_zone?.name || '—')}</span>
      ${ret ? '<span class="pill off">len pre vrátenie</span>' : ''}</div></div></div>`; }).join('') || '<div class="empty">Žiadny spôsob dopravy. Fyzický tovar sa nedá odoslať.</div>'}</div>`;
  const locsHtml = !sl ? unread : `<div class="rc-grid">${locs.map(l => `<div class="rc"><div class="rc-body"><div class="rc-title">${esc(l.name)}</div><div class="rc-fields">
      <span class="rc-f"><em>Adresa</em>${esc([l.address?.address_1, [l.address?.postal_code, l.address?.city].filter(Boolean).join(' '), (l.address?.country_code || '').toUpperCase()].filter(Boolean).join(', ') || '—')}</span></div></div></div>`).join('') || '<div class="empty">Žiadny sklad.</div>'}</div>`;
  view.innerHTML = blk('Predajné regióny a platby', regionsHtml) + blk('Spôsoby dopravy', optionsHtml) + blk('Sklady', locsHtml);
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
// E-mail z pozvánky (JWT payload) na predvyplnenie, overuje ho až server.
function inviteEmail(token) {
  try { const p = String(token || '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); const d = JSON.parse(decodeURIComponent(escape(atob(p)))); return typeof d.email === 'string' ? d.email : ''; }
  catch { return ''; }
}
// Prijatie pozvánky (bez prihlásenia): registrácia identity → prijatie pozvánky → prihlásenie.
function renderInviteAccept(invToken, msg) {
  root.innerHTML = authShell(`<form class="box" id="ia">
    <p class="eyebrow">Pozvánka do administrácie</p><h1>Vytvorte si účet</h1><p class="intro">Po vytvorení účtu vás rovno prihlásime.</p>
    ${msg ? `<div class="err">${esc(msg)}</div>` : ''}
    <label for="ia-email">E-mail (ten, na ktorý prišla pozvánka)</label><input id="ia-email" type="email" required autocomplete="username" value="${esc(inviteEmail(invToken))}">
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
// --- Obnova hesla správcu: jadro pošle e-mail s jednorazovým odkazom #/obnova-hesla/<token> (platí 15 minút). ---
function renderForgotPassword(msg, sent) {
  root.innerHTML = authShell(`<form class="box" id="fp">
    <p class="eyebrow">Administrácia</p><h1>Obnova hesla</h1>
    <p class="intro">${sent ? 'Ak k tomuto e-mailu existuje účet správcu, poslali sme naň odkaz na nastavenie nového hesla. Odkaz platí 15 minút.' : 'Zadajte e-mail, ktorým sa prihlasujete. Pošleme vám odkaz na nastavenie nového hesla.'}</p>
    ${msg ? `<div class="err">${esc(msg)}</div>` : ''}
    ${sent ? '' : `<label for="fp-email">E-mail</label><input id="fp-email" type="email" required autocomplete="username" placeholder="vas@email.sk">
    <button class="btn primary" type="submit">Poslať odkaz</button>`}
    <p style="margin:14px 0 0;text-align:center"><a href="#/">Späť na prihlásenie</a></p>
  </form>`);
  const form = root.querySelector('#fp');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const identifier = root.querySelector('#fp-email')?.value.trim();
    if (!identifier) return;
    form.querySelector('button[type=submit]').disabled = true;
    try {
      const res = await fetch(API + '/auth/user/emailpass/reset-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier }) });
      if (res.status === 429) throw new Error('Príliš veľa pokusov. Skúste to o pár minút.');
      if (!res.ok && res.status >= 500) throw new Error('Odkaz sa nepodarilo odoslať. Skúste to znova.');
      // Odpoveď je zámerne rovnaká pre existujúci aj neexistujúci účet.
      renderForgotPassword('', true);
    } catch (err) { renderForgotPassword(err.message === 'Failed to fetch' ? 'Jadro je nedostupné. Skúste to znova.' : err.message); }
  };
}
function renderResetPassword(resetToken, msg) {
  root.innerHTML = authShell(`<form class="box" id="rp">
    <p class="eyebrow">Administrácia</p><h1>Nové heslo</h1><p class="intro">Zvoľte si nové heslo. Po uložení sa ním hneď prihlásite.</p>
    ${msg ? `<div class="err">${esc(msg)}</div>` : ''}
    <label for="rp-email">E-mail</label><input id="rp-email" type="email" required autocomplete="username" placeholder="vas@email.sk">
    <label for="rp-pass">Nové heslo (aspoň 12 znakov)</label><input id="rp-pass" type="password" minlength="12" required autocomplete="new-password">
    <label for="rp-pass2">Nové heslo znova</label><input id="rp-pass2" type="password" minlength="12" required autocomplete="new-password">
    <button class="btn primary" type="submit">Uložiť heslo</button>
    <p style="margin:14px 0 0;text-align:center"><a href="#/zabudnute-heslo">Poslať nový odkaz</a></p>
  </form>`);
  root.querySelector('#rp').onsubmit = async (e) => {
    e.preventDefault();
    const email = root.querySelector('#rp-email').value.trim();
    const password = root.querySelector('#rp-pass').value, again = root.querySelector('#rp-pass2').value;
    if (password.length < 12) return renderResetPassword(resetToken, 'Heslo musí mať aspoň 12 znakov.');
    if (password !== again) return renderResetPassword(resetToken, 'Heslá sa nezhodujú.');
    e.target.querySelector('button[type=submit]').disabled = true;
    try {
      const res = await fetch(API + '/auth/user/emailpass/update', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + resetToken }, body: JSON.stringify({ password }) });
      if (res.status === 401) throw new Error('Odkaz je neplatný, už bol použitý alebo vypršal. Pošlite si nový.');
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.success === false) throw new Error(d?.message || 'Heslo sa nepodarilo uložiť.');
      try {
        const result = await login(email, password);
        if (result.challenge) { history.replaceState(null, '', '#/'); renderLogin('', result.challenge); return; }
        location.hash = '#/';
      } catch { location.hash = '#/'; renderLogin('Heslo je zmenené. Prihláste sa ním.'); }
    } catch (err) { renderResetPassword(resetToken, err.message === 'Failed to fetch' ? 'Jadro je nedostupné. Skúste to znova.' : err.message); }
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
const AUDIT_ENTITY = { store: 'nastavenia obchodu', user: 'účet správcu', customer: 'zákazník', order: 'objednávka', product: 'produkt', promotion: 'kupón', media: 'obrázok', page: 'text stránky', content: 'obsah webu', carrier: 'dopravca', entitlement: 'prístup k obsahu' };
const AUDIT_LABEL = {
  'admin.theme.update': 'Zmena farieb administrácie',
  'admin.carrier.update': 'Zmena dopravcu',
  'admin.content.update': 'Zmena obsahu webu',
  'admin.content.reset': 'Obnovenie pôvodného obsahu webu',
  'admin.page.update': 'Zmena textu stránky',
  'admin.page.reset': 'Obnovenie pôvodného textu stránky',
  'admin.media.add': 'Pridanie obrázka do knihovny',
  'admin.media.delete': 'Zmažanie obrázka z knihovny',
  'order.cancel': 'Zrušenie objednávky',
  'order.refund': 'Vrátenie peňazí z objednávky',
  'order.note_created': 'Poznámka k objednávke',
  'chat.conversation.start': 'Nová správa zákazníkovi',
  'chat_customer.block': 'Zablokovanie chatu zákazníka',
  'chat_customer.unblock': 'Odblokovanie chatu zákazníka',
  'entitlement.grant': 'Sprístupnenie obsahu zákazníkovi',
  'entitlement.revoke': 'Odobratie prístupu k obsahu',
  'admin.loyalty.customer.tier.update': 'Zmena vernostnej úrovne zákazníka',
  'admin.loyalty.tier.update': 'Úprava vernostných úrovní',
  'qr.created': 'Vytvorenie QR kódu ku kupónu',
};
// Neznáma akcia sa nikdy neukáže ako technický kód.
const auditTitle = (en) => AUDIT_LABEL[en.action] || (AUDIT_ENTITY[en.entity_type] ? `Zmena: ${AUDIT_ENTITY[en.entity_type]}` : 'Zmena v administrácii');
const HEX_RE = /^#[0-9a-f]{3,8}$/i;
const swatch = (c) => (HEX_RE.test(c || '') ? `<span class="au-sw" style="background:${c}"></span>` : '');
// Detail pre človeka: pri farbách vzorky, inak nič technické.
function auditDetail(en) {
  const t = en.changes?.theme;
  if (!t || typeof t !== 'object') return '';
  const to = t.to || {}, from = t.from || {}, bits = [];
  if (to.navigation && to.navigation !== from.navigation) bits.push(`Bočný panel ${swatch(from.navigation)} → ${swatch(to.navigation)}`);
  if (to.accent && to.accent !== from.accent) bits.push(`Akcent ${swatch(from.accent)} → ${swatch(to.accent)}`);
  if (to.scheme && to.scheme !== from.scheme) bits.push(to.scheme === 'custom' ? 'Vlastné farby' : 'Návrat k motívu ANASTASIA')
  return bits.join('<span class="au-dot">·</span>');
}
let auditOffset = 0;
async function vAuditLog(view) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam históriu…</div>';
  const offset = auditOffset;
  let entries = [], count = 0;
  try {
    const data = await api(`/admin/ops/audit?limit=50&offset=${offset}`);
    entries = data.entries || []; count = Number(data.count) || 0;
  } catch (e) {
    if (e.message === '401') throw e;
    view.innerHTML = `<div class="err">${esc(e.message)}</div>`; return;
  }
  const actorName = (en) => (en.actor_type === 'system' ? 'Automaticky' : 'Správca');
  const day = (d) => { try { return new Date(d).toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return ''; } };
  const time = (d) => { try { return new Date(d).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
  let lastDay = '';
  const rows = entries.map((en) => {
    const d = day(en.created_at), head = d !== lastDay ? `<li class="au-day">${esc(d)}</li>` : '';
    lastDay = d;
    const det = auditDetail(en);
    return `${head}<li class="au-row"><span class="au-time">${esc(time(en.created_at))}</span><span class="au-main"><b>${esc(auditTitle(en))}</b>${det ? `<span class="au-det">${det}</span>` : ''}</span><span class="au-who">${esc(actorName(en))}</span></li>`;
  }).join('');
  view.innerHTML = `<style>.au-list{list-style:none;margin:0;padding:0}.au-day{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);padding:18px 0 6px;border-bottom:1px solid var(--line)}.au-day:first-child{padding-top:4px}.au-row{display:grid;grid-template-columns:56px 1fr auto;gap:14px;align-items:baseline;padding:11px 0;border-bottom:1px solid var(--line)}.au-time{color:var(--muted);font-variant-numeric:tabular-nums;font-size:13px}.au-main b{font-weight:500}.au-det{display:flex;align-items:center;gap:6px;flex-wrap:wrap;color:var(--muted);font-size:12.5px;margin-top:4px}.au-sw{display:inline-block;width:14px;height:14px;border-radius:50%;border:1px solid rgba(0,0,0,.12);vertical-align:-2px}.au-dot{margin:0 4px}.au-who{color:var(--muted);font-size:12.5px}@media(max-width:600px){.au-row{grid-template-columns:44px 1fr}.au-who{grid-column:2}}</style>
  <div class="card"><div class="card-h">História zmien<span class="muted">(${count})</span></div><div class="card-b">
    ${entries.length ? `<ul class="au-list">${rows}</ul>` : '<div class="empty">Zatiaľ nie je zaznamenaná žiadna zmena.</div>'}
    ${count > 50 ? `<div style="display:flex;gap:8px;align-items:center;justify-content:space-between;margin-top:14px;flex-wrap:wrap">
      <span class="muted">${offset + 1}–${offset + entries.length} z ${count}</span>
      <div style="display:flex;gap:8px"><button class="btn ghost" id="au-prev" ${offset <= 0 ? 'disabled' : ''}>← Novšie</button><button class="btn ghost" id="au-next" ${offset + entries.length >= count ? 'disabled' : ''}>Staršie →</button></div>
    </div>` : ''}
  </div></div>`;
  const prev = view.querySelector('#au-prev'), next = view.querySelector('#au-next');
  if (prev) prev.onclick = () => { if (auditOffset > 0) { auditOffset = Math.max(0, auditOffset - 50); vAuditLog(view); } };
  if (next) next.onclick = () => { if (auditOffset + entries.length < count) { auditOffset += 50; vAuditLog(view); } };
}
// --- Vernostné úrovne (loyalty): UI nad hotovým backendom ---
// Percentá a prahy posiela server; klient nič nedopočítava.
const LOYALTY_TIER_LABEL = { ZR1: 'Bronze', ZR2: 'Silver', ZR3: 'Gold', ZR4: 'VIP' };
// Interný kód úrovne sa v admine nezobrazuje, len jej názov.
function tierLabel(t) { return t?.name || LOYALTY_TIER_LABEL[t?.code] || 'Úroveň'; }
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
    </div>`;
  view.innerHTML = `<div class="card"><div class="card-h">Vernostné úrovne</div><div class="card-b">
    <div id="lp-msg"></div>
    ${tiers.length ? `<div class="loyalty-head"><span>Názov</span><span>Zľava</span><span>Prah útraty (€)</span><span>Zapnuté</span></div>
      <div id="lp-rows">${tiers.map(row).join('')}</div>`
      : '<div class="notice">Vernostné úrovne ešte nie sú nastavené. Nastavte zľavu a prah, aby zákazníci dostávali zľavu.</div>'}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
      <button type="button" class="btn ghost" id="lp-add">+ Pridať úroveň</button>
      <button type="button" class="btn gold" id="lp-save">Uložiť zmeny</button>
    </div>
    <p class="muted" style="font-size:12px;margin-top:12px">Zľava sa počíta na serveri pri nákupe. Úroveň sa priradí automaticky podľa celkovej útraty zákazníka. Ak mu úroveň nastavíte ručne, automatické priradenie ju už nepremení.</p>
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
      <label style="display:flex;gap:6px;align-items:center;justify-content:center"><input type="checkbox" data-f="enabled" checked style="width:auto"> zapnuté</label>`;
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
async function vUklidTestDat(view) {
  view.innerHTML = `<div class="card" style="max-width:880px">
    <div class="card-h"><h2>Úklid testovacích dát pred ostrým spustením (schválil Lucky)</h2></div>
    <div class="card-b">
      <p>Tento nástroj bezpečne stornuje testovacie objednávky (#50–#70) vytvorené počas testovania e-shopu a anonymizuje testovacie účty. Skutočné migrované objednávky (#40–#49) a zákaznícke účty zostanú zachované.</p>
      <div id="uklid-status" style="margin:16px 0;padding:12px;background:var(--paper-2);border-radius:8px;font-family:monospace;font-size:12px;max-height:240px;overflow-y:auto;white-space:pre-wrap">Pripravené na spustenie. Kliknite na tlačidlo nižšie.</div>
      <button type="button" class="btn danger" id="btn-run-uklid">Spustiť zrušenie testovacích objednávok (#50–#70)</button>
    </div>
  </div>`;
  const btn = view.querySelector('#btn-run-uklid');
  const out = view.querySelector('#uklid-status');
  btn.onclick = async () => {
    if (!confirm('Naozaj chcete zrušiť testovacie objednávky #50 až #70?')) return;
    btn.disabled = true;
    out.textContent = 'Načítavam zoznam objednávok...\n';
    try {
      const res = await api('/admin/orders?limit=100&fields=id,display_id,status');
      const orders = res.orders || [];
      const testIds = [50, 51, 52, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70];
      let canceled = 0;
      for (const o of orders) {
        if (testIds.includes(o.display_id)) {
          if (o.status === 'canceled') {
            out.textContent += `Objednávka #${o.display_id} už bola zrušená.\n`;
            continue;
          }
          out.textContent += `Ruším objednávku #${o.display_id}...\n`;
          try {
            await api(`/admin/nexus/orders/${o.id}/cancel`, { method: 'POST', body: { reason: 'Testovacie dáta pred ostrým spustením (schválil Lucky)' } });
            out.textContent += `Objednávka #${o.display_id} ÚSPEŠNE ZRUŠENÁ.\n`;
            canceled++;
          } catch (err) {
            out.textContent += `CHYBA u #${o.display_id}: ${err.message}\n`;
          }
        }
      }
      out.textContent += `\nHotovo. Úspešne zrušených ${canceled} testovacích objednávok.\n`;
    } catch (err) {
      out.textContent += `Chyba pripojenia: ${err.message}\n`;
    } finally {
      btn.disabled = false;
    }
  };
}
const vNastavenia = (view) => subnav(view, [
  { label: 'Vzhľad', run: vAppearance },
  { label: 'Pripojenia', run: vPripojenia },
  { label: 'Doprava a platby', run: vDopravaPlatby },
  { label: 'Vernostné úrovne', run: vLoyaltyPolicy, ownerOnly: true },
  { label: 'Používatelia', run: (v) => vPouzivatelia(v) },
  { label: 'Zabezpečenie', run: (v) => vZabezpecenie(v), ownerOnly: true },
  { label: 'História zmien', run: vAuditLog },
  { label: 'Účtovníctvo', run: (v) => stub(v, 'Účtovníctvo', `Prepojenie s účtovníctvom (POHODA alebo Money S3) pripravujeme. Dovtedy si objednávky môžete pozrieť v časti Objednávky. Otázky posielajte na ${SUPPORT_EMAIL}.`) },
  { label: 'Údržba testovacích dát', run: vUklidTestDat, ownerOnly: true },
].filter(it => isOwner() || !it.ownerOnly));
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
    <button type="button" class="btn ghost" id="ctx-tour">${navIcon('arrow')}Spustiť sprievodcu tejto časti</button>
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
  const t = panel.querySelector('#ctx-tour'); if (t) t.onclick = () => { set(false); startTourForCurrentSection(); };
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

// Úvodná prehliadka. Stav dokončenia sa číta a zapisuje cez serverový endpoint.
let TOUR_PENDING = false, TOUR_OPEN = null;
let TOUR_SERVER_SEEN = null, TOUR_STATE_LOADING = null;
async function loadTourState() {
  if (TOUR_SERVER_SEEN !== null) return TOUR_SERVER_SEEN;
  if (!TOUR_STATE_LOADING) TOUR_STATE_LOADING = api('/admin/nexus/tour-state').then(x => {
    TOUR_SERVER_SEEN = x.completed === true; return TOUR_SERVER_SEEN;
  }).catch(() => false).finally(() => { TOUR_STATE_LOADING = null; });
  return TOUR_STATE_LOADING;
}
function tourSeen() { return TOUR_SERVER_SEEN === true; }
function markTourSeen() {
  TOUR_SERVER_SEEN = true;
  api('/admin/nexus/tour-state', { method: 'POST', body: { completed: true } }).catch(() => { TOUR_SERVER_SEEN = null; });
}
function restartTour() {
  TOUR_PENDING = true;
  TOUR_SERVER_SEEN = false;
  api('/admin/nexus/tour-state', { method: 'POST', body: { completed: false } }).catch(() => {});
  const key = location.hash.replace(/^#\/?/, '').split('/')[0];
  if (key === '' || !(key in ROUTES)) route(); else location.hash = '#/';
}
async function maybeStartTour() {
  if (TOUR_OPEN) return;
  if (!TOUR_PENDING) await loadTourState();
  if (!TOUR_PENDING && tourSeen()) return;
  TOUR_PENDING = false;
  startTour();
}
let TOUR_NAVIGATING = false;
function startTourForCurrentSection() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const routeKey = parts[0] || '';
  const section = TOUR.find(x => x.route === routeKey && (x.subtab == null || Number(parts[1] || 0) === x.subtab));
  if (!section) return startTour(TOUR);
  const productTab = root.querySelector('.pe-tabs [aria-selected="true"]')?.dataset.tab;
  const orderTab = root.querySelector('.tabs .tab.active')?.dataset.tab;
  const tabGuide = routeKey === 'produkty' && productTab ? PRODUCT_TAB_GUIDES[productTab]
    : routeKey === 'objednavky' && orderTab ? ORDER_TAB_GUIDES[orderTab] : null;
  startTour([tabGuide ? { ...section, title: tabGuide.title, steps: tabGuide.steps, skipIntro: true } : section]);
}
function startTour(sections = TOUR) {
  if (TOUR_OPEN || !sections.length) return;
  const mq = window.matchMedia('(max-width: 800px)');
  const prevFocus = document.activeElement;
  const block = $('<div class="tour-block" aria-hidden="true"></div>');
  const spot = $('<div class="tour-spot" aria-hidden="true" hidden></div>');
  const card = $(`<div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-t" aria-describedby="tour-d">
    <div class="tour-top"><span class="tour-count" id="tour-c"></span><button type="button" class="tour-skip" data-a="skip">Preskočiť sekciu</button><button type="button" class="tour-end" data-a="end">Ukončiť</button></div>
    <div class="tour-bar" aria-hidden="true"><span></span></div>
    <h2 id="tour-t" tabindex="-1"></h2>
    <div class="tour-body" id="tour-d"></div>
    <div class="tour-nav"><button type="button" class="btn ghost" data-a="prev">Späť</button><button type="button" class="btn primary" data-a="next">Ďalej</button></div>
  </div>`);
  document.body.append(block, spot, card);
  const prevBtn = card.querySelector('[data-a="prev"]'), nextBtn = card.querySelector('[data-a="next"]'), titleEl = card.querySelector('#tour-t');
  let seq = [], i = 0, target = null, step = null, showSeq = 0, raf = 0, closed = false;
  const rebuild = () => {
    seq = [];
    for (const section of sections) {
      if (!section.skipIntro) seq.push({ ...section, kind: 'intro', target: section.nav, what: section.what, sidebar: section.route !== '' });
      for (const item of section.steps) seq.push({ ...item, kind: 'step', route: section.route, subtab: section.subtab, sectionId: section.id, sectionTitle: section.title });
    }
  };
  rebuild();
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
  const close = (complete = true) => {
    if (!card.isConnected || closed) return;
    closed = true; showSeq++; cancelAnimationFrame(raf);
    if (complete) markTourSeen();
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onMove); window.removeEventListener('scroll', onMove, true);
    block.remove(); spot.remove(); card.remove();
    if (mq.matches) sidebar(false);
    TOUR_OPEN = null;
    if (prevFocus && prevFocus.isConnected && typeof prevFocus.focus === 'function') prevFocus.focus({ preventScroll: true });
  };
  const navigate = async (routeKey, subtab) => {
    if (routeKey == null) return;
    const hash = `#/${routeKey}${subtab == null ? '' : `/${subtab}`}`;
    if (location.hash === hash) {
      if (subtab != null) document.querySelectorAll('#actions .pills button')[subtab]?.click();
      return;
    }
    TOUR_NAVIGATING = true;
    try {
      history.pushState(null, '', hash);
      await route();
      if (subtab != null) document.querySelectorAll('#actions .pills button')[subtab]?.click();
    }
    finally { TOUR_NAVIGATING = false; }
  };
  const waitForPage = async (my) => {
    const started = Date.now();
    while (Date.now() - started < 8000 && [...document.querySelectorAll('#view .muted, #view .empty')].some(el => /^Načítavam/i.test(el.textContent.trim()))) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (my !== showSeq || !card.isConnected) return false;
    }
    return my === showSeq && card.isConnected;
  };
  const show = async (n) => {
    const my = ++showSeq;
    card.querySelectorAll('[data-a]').forEach(button => { button.disabled = true; });
    i = Math.max(0, Math.min(seq.length - 1, n)); step = seq[i];
    if (step.kind === 'step') {
      await navigate(step.route, step.subtab);
      if (my !== showSeq || !card.isConnected || !await waitForPage(my)) return;
      if (step.tab != null) {
        if (typeof step.tab === 'string') document.querySelector(step.tab)?.click();
        else {
          const tabs = document.querySelectorAll('.pe-nav [data-jump], #view .tabs .tab, #actions .pills button');
          tabs[step.tab]?.click();
        }
      }
      if (step.activate) {
        document.querySelector(step.activate)?.click();
        const expected = step.route === 'produkty' ? '.pe-nav' : step.route === 'objednavky' ? '#view .tabs' : null;
        if (expected) await new Promise(resolve => {
          const started = Date.now();
          const poll = () => document.querySelector(expected) || Date.now() - started > 3000 ? resolve() : setTimeout(poll, 80);
          poll();
        });
        if (!await waitForPage(my)) return;
      }
    }
    if (step.kind === 'intro') {
      await navigate(step.route, step.subtab);
      if (my !== showSeq || !card.isConnected || !await waitForPage(my)) return;
    }
    if (mq.matches && sidebar(!!step.sidebar)) await new Promise(r => setTimeout(r, 240));
    if (my !== showSeq || !card.isConnected) return;
    const el = step.target ? document.querySelector(step.target) : null;
    target = el && el.getClientRects().length ? el : null;
    card.querySelector('#tour-c').textContent = `${step.sectionTitle ? `${step.sectionTitle} · ` : ''}Krok ${i + 1} z ${seq.length}`;
    card.querySelector('.tour-bar span').style.width = `${Math.round((i + 1) / seq.length * 100)}%`;
    titleEl.textContent = step.kind === 'intro' ? step.title : step.title;
    const body = card.querySelector('#tour-d');
    const description = document.createElement('p');
    description.textContent = step.what + (!target ? ' Tento prvok tu teraz nie je zobrazený, preto pokračujte podľa vysvetlenia.' : '');
    body.replaceChildren(description);
    prevBtn.disabled = i === 0;
    nextBtn.textContent = i === seq.length - 1 ? 'Dokončiť' : 'Ďalej';
    card.scrollTop = 0;
    if (target) target.scrollIntoView({ block: step.sidebar ? 'nearest' : (target.offsetHeight > window.innerHeight * 0.55 ? 'start' : 'center') });
    place();
    card.querySelectorAll('[data-a]').forEach(button => { button.disabled = false; });
    prevBtn.disabled = i === 0;
    titleEl.focus({ preventScroll: true });
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(false); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); if (nextBtn.disabled) return; if (i < seq.length - 1) show(i + 1); else close(true); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); if (prevBtn.disabled) return; if (i > 0) show(i - 1); return; }
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
    if (a === 'skip') {
      const current = seq[i]?.sectionId || seq[i]?.id;
      while (i < seq.length - 1 && (seq[i + 1]?.sectionId || seq[i + 1]?.id) === current) i++;
      if (i < seq.length - 1) show(i + 1); else close(true);
    }
    else if (a === 'end') close(false);
    else if (a === 'prev' && i > 0) show(i - 1);
    else if (a === 'next') { if (i < seq.length - 1) show(i + 1); else close(true); }
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
    title: 'Prístupy a knižnica', rows, compact: true, onRow: e => vEntitlementDetail(view, e),
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
    ${e.status === 'active' && isOwner() ? '<div style="margin-top:16px"><button class="btn ghost" id="e-revoke">Odobrať prístup</button></div>' : ''}
    ${e.status === 'active' && !isOwner() ? '<p class="muted" style="margin-top:16px">Pridanie a odobratie prístupu spravuje vlastník administrácie.</p>' : ''}
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
  'ambasadori': ['Ambasádori', 'Odporúčanie zákazníkov za províziu, sledovanie privedených objednávok a výplaty', vAmbasadori],
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
  // Vlastný motív mení bočný panel a dekoratívny akcent; pevné farby obsahu (tmavá zelená, zlatá) zostávajú
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
    <p class="muted">Východzí je motív ANASTASIA v teplých farbách so zlatým akcentom a tmavou zelenou. Vlastné farby sa uložia k vášmu účtu, takže ich uvidíte na každom zariadení.</p>
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
  // Červená bodka na zvonečku: je tu niečo, čo treba riešiť (objednávky na vybavenie alebo neprečítané správy).
  const dot = document.querySelector('#bell-dot');
  if (dot) dot.hidden = !(BADGES.orders > 0 || BADGES.messages > 0);
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
  if (TOUR_OPEN && !TOUR_NAVIGATING) TOUR_OPEN.close(false);
  const parts = (location.hash.replace(/^#\/?/, '') || '').split('/');
  if (parts[0] === 'pozvanka' && parts[1]) return renderInviteAccept(decodeURIComponent(parts[1]));
  if (parts[0] === 'zabudnute-heslo') return renderForgotPassword();
  if (parts[0] === 'obnova-hesla' && parts[1]) return renderResetPassword(decodeURIComponent(parts[1]));
  if (!token) return renderLogin();
  const key = parts[0];
  const r = ROUTES[key] || ROUTES[''];
  await loadAdminRole();
  root.innerHTML = shell(key in ROUTES ? key : '', r[0], r[1]);
  window.scrollTo({ top: 0, behavior: 'instant' });
  loadTheme().then(applyTheme);
  root.querySelector('#logout').onclick = () => {
    // Server token zneplatní (inak by platil až do expirácie); výpadok siete odhlásenie v prehliadači nezastaví.
    if (token) fetch(API + '/admin/nexus-auth/logout', { method: 'POST', headers: { authorization: 'Bearer ' + token } }).catch(() => {});
    token = ''; localStorage.removeItem('ana_token'); ADMIN_ROLE_LOADED = false; ADMIN_ROLE = 'owner'; renderLogin(); };
  root.querySelector('#logout-all').onclick = async () => {
    const button = root.querySelector('#logout-all'); button.disabled = true;
    try {
      const response = await fetch(API + '/admin/nexus-auth/logout-all', { method: 'POST', headers: { authorization: 'Bearer ' + token } });
      if (!response.ok) { button.disabled = false; return alert('Odhlásenie sa nepodarilo. Skúste to znova.'); }
      token = ''; localStorage.removeItem('ana_token'); ADMIN_ROLE_LOADED = false; ADMIN_ROLE = 'owner'; renderLogin();
    } catch { button.disabled = false; alert('Odhlásenie sa nepodarilo. Skontrolujte pripojenie a skúste to znova.'); }
  };
  wireMobileNav();
  wireTopbar();
  loadMe().then(setUserChip);
  refreshBadges();
  wireCtxHelp();
  const view = root.querySelector('#view');
  const blocked = !isOwner() && OWNER_ONLY_SECTIONS[key];
  if (blocked) {
    view.innerHTML = `<section class="card"><div class="card-b">
      <h2 style="margin-top:0">${esc(OWNER_ONLY_SECTIONS[key])}</h2>
      <p>Na túto časť nemáte prístup. Ceny, zľavy, vernostné úrovne a pridávanie prístupov spravuje vlastník administrácie.</p>
      <p class="muted">Ak potrebujete niečo zmeniť, obráťte sa na vlastníka administrácie.</p></div></section>`;
  } else {
    try { await r[2](view); } catch (e) { console.error('[admin] chyba pohľadu:', e && e.stack || e); if (e.message !== '401') view.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  }
  applyPendingSearch(view);
  wireNotifyCard(view);
  wireShortcuts();
  // Úvodná prehliadka: pri prvom prihlásení (pre daný účet) alebo na vyžiadanie, až keď je Prehľad vykreslený.
  if (seq === ROUTE_SEQ && !(key in ROUTES && key !== '') && token) maybeStartTour();
}
// Prihlásenie a pozvánka: zelený panel so značkou (ako bočný panel adminu) + formulár na krémovom pozadí.
function authShell(form) {
  return `<div class="login">
    <aside class="login-side">${brandHtml()}<div><h2>Priestor pre vašu prácu.</h2><p>Objednávky, produkty, konzultácie aj správy od zákazníkov na jednom mieste.</p></div></aside>
    <main class="login-main">${form}</main>
  </div>`;
}
function renderLogin(msg, challenge) {
  root.innerHTML = authShell(`<form class="box" id="lf">
    <p class="eyebrow">Administrácia</p><h1>${challenge ? 'Overenie kódom' : 'Prihlásenie'}</h1><p class="intro">${challenge ? 'Vložte šesťmiestny kód z aplikácie, v ktorej máte zapnuté dvojfaktorové overenie.' : 'Prihláste sa do svojho pracovného priestoru.'}</p>
    ${msg ? `<div class="err">${esc(msg)}</div>` : ''}
    ${challenge ? `<label for="l-code">Kód z aplikácie</label><input id="l-code" inputmode="numeric" autocomplete="one-time-code" maxlength="20" placeholder="napr. 123456" autofocus>
      <p class="muted" style="font-size:12px">Ak nemáte telefón s aplikáciou, vložte jeden zo záložných kódov, ktoré ste si uložili.</p>
      <button class="btn primary" type="submit">Overiť a prihlásiť sa</button>`
    : `<label for="l-email">E-mail</label><input id="l-email" type="email" placeholder="vas@email.sk" autocomplete="username" required>
      <label for="l-pass">Heslo</label><input id="l-pass" type="password" autocomplete="current-password">
      <button class="btn primary" type="submit">Prihlásiť sa</button>
      <p style="margin:14px 0 0;text-align:center"><a href="#/zabudnute-heslo">Zabudli ste heslo?</a></p>`}
    <p class="api-note">Jadro: ${esc(API)}</p>
  </form>`);
  root.querySelector('#lf').onsubmit = async (e) => {
    e.preventDefault();
    const button = e.currentTarget.querySelector('button[type=submit]');
    button.disabled = true;
    try {
      if (challenge) {
        const code = root.querySelector('#l-code').value.trim();
        const method = challenge.methods?.includes('recovery_code') && code.length > 6 ? 'recovery_code' : 'totp';
        await verifyMfa(challenge.id, code, method);
        location.hash = '#/'; route();
      } else {
        const result = await login(root.querySelector('#l-email').value, root.querySelector('#l-pass').value);
        if (result.challenge) { renderLogin('', result.challenge); return; }
        location.hash = '#/'; route();
      }
    } catch (err) {
      renderLogin(err.message, challenge);
    }
  };
}
// Formuláre: dvojica popis + pole ide do rovnakých stĺpcov (3 vedľa seba), nie riadky cez celú šírku obrazovky.
const FORM_FIELDS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);
function gridForms(root) {
  root.querySelectorAll('label').forEach(l => {
    if (l.closest('.fld') || l.querySelector('input,select,textarea')) return;
    const f = l.nextElementSibling, parent = l.parentElement;
    if (!f || !parent || !FORM_FIELDS.has(f.tagName) || ['checkbox', 'radio', 'hidden', 'file', 'color', 'range'].includes(f.type)) return;
    if (!parent.classList.contains('fgrid')) {
      const d = getComputedStyle(parent).display;
      if (d.includes('flex') || d.includes('grid') || parent.closest('.login,.av-card,.topbar,.ot-wrap,table')) return;
    }
    const box = document.createElement('div');
    box.className = f.tagName === 'TEXTAREA' || f.classList.contains('wide') ? 'fld fld-wide' : 'fld';
    l.before(box); box.append(l, f);
    const help = box.nextElementSibling;
    if (help && help.tagName === 'P' && help.classList.contains('muted')) box.append(help);
    parent.classList.add('fgrid');
  });
}
let gridFormsQueued = false;
new MutationObserver(() => {
  if (gridFormsQueued) return;
  gridFormsQueued = true;
  requestAnimationFrame(() => { gridFormsQueued = false; try { gridForms(document.body); } catch { /* rozloženie je len kozmetika */ } });
}).observe(document.body, { childList: true, subtree: true });
// Dlaždica RESET 40+ na prehľade otvorí rovno Zakúpený obsah programu.
document.addEventListener('click', async (e) => {
  const link = e.target.closest('[data-open-reset]');
  if (!link) return;
  e.preventDefault();
  try {
    const d = await api('/admin/products?handle=reset-40-plus&fields=id');
    const id = d?.products?.[0]?.id;
    history.pushState(null, '', '#/produkty');
    // Celý shell sekcie Produkty, inak ostane rozloženie prehľadu s pevnou výškou a obsah sa nedá posúvať.
    await route();
    if (id) vProductDetail(root.querySelector('#view'), id, { tab: 'obsah' });
  } catch { location.hash = '#/produkty'; }
});
window.addEventListener('hashchange', route);
route();
