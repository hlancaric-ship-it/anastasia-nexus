// ANASTASIA admin — vlastní SPA proti Medusa Admin API (NE Medusa /app).
// Vzhled dle backend/docs/wp/admin-design-preview.html. Slovensky. Theming tokeny v styles.css.
// Produkčný build (build.mjs) zapíše adresu jadra do <meta name="ana-api">; lokálne platí localStorage 'ana_api' alebo :9100.
const API = (document.querySelector('meta[name="ana-api"]')?.content || localStorage.getItem('ana_api') || 'http://localhost:9100').replace(/\/+$/, '');
const root = document.getElementById('root');
const $ = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };
const fmtEur = (a) => (a == null ? '—' : new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'eur' }).format(Number(a)));
const fmtDate = (d) => d ? new Date(d).toLocaleString('sk-SK', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

import { TOUR, GUIDES, GUIDE_GROUPS, PAGE_HELP, SUPPORT_EMAIL } from './guide.mjs';
import { mountLibraryEditor } from './library-editor.mjs';

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
  { k: 'zakaznicky', label: 'Zákazníčky', icon: 'users', ready: true },
  { k: 'konzultacie', label: 'Konzultácie', icon: 'cal', ready: true },
  { k: 'spravy', label: 'Správy', icon: 'chat', ready: true, badge: 'messages' },
  { k: 'klub', label: 'Klub', icon: 'star', ready: true },
  { k: 'poukazy', label: 'Poukazy a zľavy', icon: 'gift', ready: true },
  { k: 'obsah', label: 'Obsah a e-maily', icon: 'doc', ready: true },
];
let BADGES = {};

function shell(active, title, sub) {
  const cur = (k) => active === k ? ' active" aria-current="page' : '';
  const item = (n) => `<a class="nav-item${cur(n.k)}" href="#/${n.k}">${navIcon(n.icon)}<span>${esc(n.label)}</span>${n.badge ? `<span class="counter" data-badge="${n.badge}" ${BADGES[n.badge] ? '' : 'hidden'}>${BADGES[n.badge] || ''}</span>` : ''}</a>`;
  const nav = NAV.filter(n => n.ready).map(item).join('');
  const crumb = active === '' ? 'Prehľad' : (title || '');
  // Prehľad: dátum + pozdrav (meno dopĺňa setUserChip z /admin/users/me); ostatné agendy: názov a popis z ROUTES.
  const d = new Date(), today = `${d.toLocaleDateString('sk-SK', { weekday: 'long' })}, ${d.toLocaleDateString('sk-SK', { day: 'numeric', month: 'long' })}`;
  // Pomoc na stránke: tlačidlo „Ako to funguje“ pri nadpise + skrytý panel s vysvetlením (obsah z guide.mjs).
  const helpBtn = PAGE_HELP[active] ? `<button type="button" class="help-toggle" id="ctx-help-btn" aria-expanded="false" aria-controls="ctx-help">${navIcon('help')}<span>Ako to funguje</span></button>` : '';
  const head = active === ''
    ? `<p class="eyebrow">${esc(today)}</p><div class="heading"><div><h1 id="greet">Dobrý deň.</h1><p class="intro">Tu nájdete všetko, čo dnes potrebuje vašu pozornosť.</p>${helpBtn}</div><div id="actions"></div></div>`
    : `<p class="eyebrow">Váš obchod</p><div class="heading"><div><h1>${esc(title)}</h1>${sub ? `<p class="intro">${esc(sub)}</p>` : ''}${helpBtn}</div><div id="actions"></div></div>`;
  return `<div class="app">
    <aside class="sidebar" id="sidebar" aria-label="Hlavná navigácia">
      ${brandHtml('a')}
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
  const hm = (d) => new Date(d).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
  const now = Date.now(), next = todayB ? todayB.find(b => new Date(b.starts_at).getTime() >= now) : null;
  const plural = (n, one, few, many) => n === 1 ? one : n >= 2 && n <= 4 ? few : many;

  const stats = [];
  if (toFulfill != null) stats.push(['Na vybavenie', 'bag', toFulfill, toFulfill === 0 ? 'nič nečaká na vybavenie' : plural(toFulfill, 'objednávka čaká na vás', 'objednávky čakajú na vás', 'objednávok čaká na vás'), '#/objednavky']);
  if (unread != null) stats.push(['Nové správy', 'chat', unread, unread === 0 ? 'všetky správy sú prečítané' : plural(unread, 'zákazníčka čaká na odpoveď', 'zákazníčky čakajú na odpoveď', 'zákazníčok čaká na odpoveď'), '#/spravy']);
  if (todayB) stats.push(['Dnešné konzultácie', 'cal', todayB.length, todayB.length === 0 ? 'na dnes nič naplánované' : next ? `najbližšia o ${hm(next.starts_at)}` : 'dnešné termíny už prebehli', '#/konzultacie']);

  const tasks = [];
  if (toFulfill > 0) tasks.push(['wine', 'bag', 'Pripravte objednávky na odoslanie', `${toFulfill} ${plural(toFulfill, 'objednávka čaká', 'objednávky čakajú', 'objednávok čaká')} na vybavenie.`, 'Pozrieť objednávky', '#/objednavky']);
  if (unread > 0) tasks.push(['green', 'chat', 'Odpovedzte zákazníčkam', `${plural(unread, 'Máte jednu novú správu.', `Máte ${unread} nové správy.`, `Máte ${unread} nových správ.`)} Celú komunikáciu nájdete na jednom mieste.`, 'Prečítať správy', '#/spravy']);
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
      ${readinessCard(readiness)}
    </div>
    <div>
      ${schedule}
      <aside class="help-card">${navIcon('help')}<h3>Všetko si nastavíte tu.</h3><p>Ceny, voľné termíny, poukazy aj texty e-mailov. Pri každom nastavení vysvetlíme, čo zmena ovplyvní.</p><a class="subtle-link" href="#/nastavenia">Otvoriť nastavenia →</a></aside>
      <div class="quick"><a class="btn" href="#/poukazy">${navIcon('gift')}Nastaviť poukazy</a><a class="btn" href="#/poukazy">${navIcon('plus')}Vytvoriť kupón</a></div>
    </div>
  </div>`;
}

// Pripravenosť obchodu: len z GET /admin/readiness (reálne dáta jadra). Čo sa nedá overiť, nikdy nevydávame za hotové.
function readinessCard(r) {
  if (!r || !Array.isArray(r.checks)) return `<section class="panel" data-tour="readiness"><div class="panel-head"><h2>Pripravenosť obchodu</h2></div><p class="empty-task">Pripravenosť sa teraz nedá overiť. Skúste obnoviť stránku.</p></section>`;
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

// Kartové zobrazenie (žiadne riadkové tabuľky). `card(r)` = voliteľný HTML pre jednu kartu;
// inak sa karta poskladá z `cols` (prvý stĺpec = hlavička, ostatné = polia pod ňou).
function listView(view, { cols, rows, title, onRow, empty, card, search = true }) {
  const genCard = (r) => {
    const cells = cols.map(c => ({ h: c.h, v: c.v(r) }));
    const head = cells.find(c => c.h) || cells[0] || { v: '' };
    const media = cells.find(c => !c.h);
    const rest = cells.filter(c => c !== head && c !== media && c.h);
    return `${media ? `<div class="rc-media">${media.v}</div>` : ''}<div class="rc-body"><div class="rc-title">${head.v}</div>
      <div class="rc-fields">${rest.map(c => `<span class="rc-f"><em>${esc(c.h)}</em>${c.v}</span>`).join('')}</div></div>`;
  };
  const render = (list) => `<div class="rc-grid">${list.length
    ? list.map(r => `<${onRow ? 'button' : 'div'} class="rc" data-id="${esc(r.id ?? '')}">${card ? card(r) : genCard(r)}</${onRow ? 'button' : 'div'}>`).join('')
    : `<div class="empty">${esc(empty || 'Zatiaľ tu nič nie je.')}</div>`}</div>`;
  view.innerHTML = `<div class="rc-head"><h2>${esc(title)}</h2>
    ${search && rows.length > 6 ? '<input class="rc-search" placeholder="Hľadať…">' : `<span class="muted">${rows.length} ${rows.length === 1 ? 'záznam' : 'záznamov'}</span>`}</div>
    <div id="rc-wrap">${render(rows)}</div>`;
  const wire = () => { if (onRow) view.querySelectorAll('.rc[data-id]').forEach(el => el.onclick = () => onRow(rows.find(x => String(x.id) === el.dataset.id) || rows[0])); };
  wire();
  const s = view.querySelector('.rc-search');
  if (s) s.oninput = () => { const q = s.value.toLowerCase().trim(); const f = q ? rows.filter(r => JSON.stringify(r).toLowerCase().includes(q)) : rows; view.querySelector('#rc-wrap').innerHTML = render(f); if (onRow) view.querySelectorAll('.rc[data-id]').forEach(el => el.onclick = () => onRow(rows.find(x => String(x.id) === el.dataset.id))); };
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
// --- jednoduchý WYSIWYG (bez surových HTML tagov) ---
function wysiwygHtml(id, html) {
  return `<div class="wysi-tb"><button type="button" data-cmd="bold"><b>B</b></button><button type="button" data-cmd="italic"><i>I</i></button><button type="button" data-cmd="insertUnorderedList">• zoznam</button><button type="button" data-cmd="insertOrderedList">1. zoznam</button></div>
    <div class="wysi" id="${id}" contenteditable="true">${html || ''}</div>`;
}
function wireWysiwyg(scope) {
  scope.querySelectorAll('.wysi-tb button').forEach(b => b.onmousedown = (e) => { e.preventDefault(); const el = scope.querySelector('.wysi'); if (el) el.focus(); document.execCommand(b.dataset.cmd, false); });
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
async function vProducts(view) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam produkty…</div>';
  setActions('<button class="btn wine" id="p-new">+ Pridať produkt</button>');
  const nb = document.querySelector('#p-new'); if (nb) nb.onclick = () => vProductNew(view);
  const { products } = await api('/admin/products?limit=100&order=-created_at&fields=id,title,status,handle,thumbnail,metadata,*variants.prices');
  listView(view, {
    title: 'Produkty', rows: products,
    cols: [
      { h: '', v: p => p.thumbnail ? `<img class="thumb" src="${esc(p.thumbnail)}" alt="">` : '<span class="thumb ph"></span>' },
      { h: 'Názov', v: p => esc(p.title) },
      { h: 'Stav', v: p => `<span class="pill ${p.status === 'published' ? 'ok' : 'warn'}">${p.status === 'published' ? 'zverejnený' : 'koncept'}</span>` },
      { h: 'Cena', v: p => { const pr = basePrice(p.variants?.[0]); return fmtEur(pr?.amount); } },
      { h: 'Akcia', v: p => { const s = p.metadata?.vyprodej; return (s && s.active && s.akcna_cena != null) ? `<span class="pill warn">${fmtEur(s.akcna_cena)}</span>` : '<span class="muted">—</span>'; } },
    ],
    onRow: p => vProductDetail(view, p.id),
  });
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
      vProductDetail(view, product.id);
    } catch (e) { btn.disabled = false; msg.innerHTML = `<div class="err">Jadro odmietlo: ${esc(e.message)}</div>`; }
  };
}
async function vProductDetail(view, id) {
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
  const predaj = `<label>Kód produktu (SKU)</label>${!variant ? '<p class="muted">Produkt nemá variant.</p>' : variant.sku ? `<input id="p-sku" value="${esc(variant.sku)}" readonly><p class="muted" style="font-size:12px">Kód sa po pridelení nemení – podľa neho obchod produkt nacení.</p>` : '<input id="p-sku" maxlength="64" placeholder="napr. RUZOVY-OLEJ-50ML" autocomplete="off">'}
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
  view.innerHTML = `<div class="card"><div class="card-h">Úprava produktu<button class="btn ghost" id="p-back">Späť</button></div><div class="card-b">
    <div id="pmsg"></div>
    <div id="p-checks" style="margin-bottom:10px"></div>
    <div class="product-editor"><div>
      <section class="editor-section"><h2>Základné údaje</h2>${zakladne}</section>
      <section class="editor-section"><h2>Cena a akcia</h2>${cena}</section>
      <section class="editor-section"><h2>Popis produktu</h2>${popis}</section>
      <section class="editor-section"><h2>Sklad</h2>${sklad}</section>
    </div><div>
      <section class="editor-section"><h2>Fotografie</h2>${obrazky}</section>
      <section class="editor-section"><h2>Zakúpený obsah</h2><div id="p-library"></div></section>
      <section class="editor-section"><h2>Kategórie</h2>${kategorie}</section>
      <section class="editor-section"><h2>Predaj a doručenie</h2>${predaj}</section>
    </div></div>
    <div class="editor-save"><button class="btn gold" id="p-save">Uložiť zmeny</button></div>
  </div></div>`;
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
    if ([...view.querySelectorAll('[data-loc]')].some(i => i.value !== '' && !(Number.isInteger(Number(i.value)) && Number(i.value) >= 0))) { msg.innerHTML = '<div class="err">Počet kusov na sklade musí byť celé číslo 0 alebo viac.</div>'; return; }
    const newSku = variant && !variant.sku ? (view.querySelector('#p-sku')?.value || '').trim().toUpperCase() : '';
    if (newSku && !SKU_RE.test(newSku)) { msg.innerHTML = '<div class="err">Kód produktu (SKU): 2–64 znakov, len písmená A–Z, číslice, bodka, pomlčka alebo podčiarknik.</div>'; return; }
    try { libraryEditor.validate(); } catch (e) { msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
    btn.disabled = true;
    try {
      if (newSku) await api(`/admin/products/${id}/variants/${variant.id}`, { method: 'POST', body: { sku: newSku } });
      const chosen = [...inC].map(id => ({ id }));
      const desc = view.querySelector('#p-desc').innerHTML.trim();
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
  const { product_categories } = await api('/admin/product-categories?limit=200&fields=id,name,handle,is_active,parent_category_id');
  setActions('<button class="btn gold" id="cat-new">+ Nová kategória</button>');
  const nb = document.querySelector('#cat-new'); if (nb) nb.onclick = () => vCategoryDetail(view, null);
  listView(view, { title: 'Kategórie', rows: product_categories, onRow: c => vCategoryDetail(view, c.id), cols: [
    { h: 'Názov', v: c => esc(c.name) }, { h: 'Adresa kategórie', v: c => `<span class="muted">${esc(c.handle)}</span>` },
    { h: 'Nadradená kategória', v: c => esc(product_categories.find(p => p.id === c.parent_category_id)?.name || 'Hlavná kategória') },
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
async function vOrders(view) {
  view = freshView(view);
  const { orders } = await api('/admin/orders?limit=50&fields=id,display_id,email,status,total,currency_code,created_at,payment_status,fulfillment_status,metadata');
  const payPill = (s) => `<span class="pill ${s === 'captured' || s === 'paid' ? 'ok' : s === 'not_paid' || s === 'canceled' ? 'off' : 'warn'}">${esc(s || '—')}</span>`;
  const fulPill = (s) => `<span class="pill ${s === 'fulfilled' || s === 'shipped' || s === 'delivered' ? 'ok' : 'warn'}">${esc(s || 'nevybavená')}</span>`;
  listView(view, { title: 'Objednávky', rows: orders, onRow: o => vOrderDetail(view, o.id), empty: 'Zatiaľ žiadne objednávky.',
    card: o => `<div class="rc-body"><div class="rc-title">#${esc(o.metadata?.legacy_customer_migration?.number || o.display_id || '')} · ${fmtEur(o.total)}</div><div class="rc-fields">
      <span class="rc-f"><em>Zákazníčka</em>${esc(o.email || '—')}</span>
      <span class="rc-f"><em>Platba</em>${o.status === 'archived' ? esc(o.metadata?.legacy_customer_migration?.payment_status || 'Historický záznam') : payPill(o.payment_status)}</span>
      <span class="rc-f"><em>Vybavenie</em>${o.status === 'archived' ? `<span class="pill">${esc(o.metadata?.legacy_customer_migration?.status || 'Archív')}</span>` : fulPill(o.fulfillment_status)}</span>
      <span class="rc-f"><em>Dátum</em>${fmtDate(o.metadata?.legacy_customer_migration?.placed_at || o.created_at)}</span></div></div>` });
}
// Akcie objednávky cez natívne Admin API jadra (spúšťajú existujúce subscribery: e-maily, prístupy, kompenzácie).
// Každá zmena má potvrdenie; sumy a stavy overuje jadro, SPA len ponúka to, čo dáva zmysel.
const ORDER_FIELDS = 'id,metadata,display_id,email,status,total,currency_code,created_at,payment_status,fulfillment_status,*items,*items.detail,*fulfillments,*fulfillments.items,*fulfillments.labels,*payment_collections,*payment_collections.payments,*payment_collections.payments.refunds,*payment_collections.payments.captures,*shipping_address,*shipping_methods';
const PAY_LABEL = { captured: 'zaplatená', authorized: 'autorizovaná (čaká na prijatie)', partially_refunded: 'čiastočne vrátená', refunded: 'vrátená', not_paid: 'nezaplatená', awaiting: 'čaká na platbu', canceled: 'zrušená', partially_captured: 'čiastočne zaplatená', requires_action: 'čaká na overenie' };
const FUL_LABEL = { not_fulfilled: 'nevybavená', fulfilled: 'pripravená na odoslanie', partially_fulfilled: 'čiastočne pripravená', shipped: 'odoslaná', partially_shipped: 'čiastočne odoslaná', delivered: 'doručená', canceled: 'zrušená' };
const sum = (arr, k = 'amount') => (arr || []).reduce((a, x) => a + Number(x?.[k] || 0), 0);
async function vOrderDetail(view, id, notice) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam…</div>';
  const { order: o } = await api(`/admin/orders/${id}?fields=${encodeURIComponent(ORDER_FIELDS)}`);
  const history = o.metadata?.legacy_customer_migration || {};
  const archived = o.status === 'archived';
  const items = o.items || [];
  const toFulfill = (archived ? [] : items).map(it => ({ id: it.id, title: it.title || it.product_title || '', quantity: Number(it.quantity) - Number(it.detail?.fulfilled_quantity || 0) })).filter(x => x.quantity > 0);
  const fulfillments = (o.fulfillments || []).filter(f => !f.canceled_at);
  const payments = (archived ? [] : o.payment_collections || []).flatMap(pc => pc.payments || []).filter(p => !p.canceled_at);
  const canceled = o.status === 'canceled';
  const anyShipped = fulfillments.some(f => f.shipped_at);
  const a = (o.shipping_address || {});
  const addr = [[a.first_name, a.last_name].filter(Boolean).join(' '), a.address_1, a.address_2, [a.postal_code, a.city].filter(Boolean).join(' '), (a.country_code || '').toUpperCase()].filter(Boolean).map(esc).join('<br>');
  const prehlad = `<div class="row"><div><label>E-mail</label><div>${esc(o.email)}</div></div><div><label>Dátum</label><div>${fmtDate(history.placed_at || o.created_at)}</div></div></div>
    <div class="row"><div><label>Platba</label><div><span class="pill">${esc(history.payment_status || PAY_LABEL[o.payment_status] || o.payment_status || '—')}</span></div></div>
    <div><label>Vybavenie</label><div><span class="pill">${esc(history.status || (archived ? 'Archív' : FUL_LABEL[o.fulfillment_status] || o.fulfillment_status) || '—')}</span>${canceled ? ' <span class="pill off">objednávka zrušená</span>' : ''}</div></div></div>
    <div class="row"><div><label>Doručenie</label><div>${addr || '<span class="muted">bez adresy (digitálny obsah)</span>'}</div></div>
    <div><label>Doprava</label><div>${(o.shipping_methods || []).map(m => `${esc(m.name)} · ${fmtEur(m.total ?? m.amount)}`).join('<br>') || '—'}</div></div></div>
    <div style="margin-top:10px;font-weight:600">Celkom: ${fmtEur(o.total)}</div>`;
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
    <p class="muted" style="font-size:12px;margin-top:10px">Po označení odoslania jadro pošle zákazníčke e-mail o odoslaní.</p>`;
  const platby = `${payments.map(p => { const cap = sum(p.captures), ref = sum(p.refunds), left = Math.round((cap - ref) * 100) / 100;
    return `<div class="task"><div><b>${fmtEur(p.amount)}</b> <span class="muted">${esc(p.provider_id || '')}</span>
      <p class="muted">Prijaté ${fmtEur(cap)} · vrátené ${fmtEur(ref)}</p>
      ${left > 0 ? `<div class="row" style="margin-top:6px"><div><label>Suma na vrátenie (EUR)</label><input type="number" step="0.01" min="0.01" max="${left}" data-refamt="${esc(p.id)}" value="${left}"></div><div></div></div>` : ''}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${!p.captured_at && cap === 0 && !canceled ? `<button class="btn gold" data-cap="${esc(p.id)}">Prijať platbu</button>` : ''}${left > 0 ? `<button class="btn ghost" data-ref="${esc(p.id)}" data-max="${left}">Vrátiť peniaze</button>` : ''}</div></div>`; }).join('') || '<p class="muted">K objednávke nie je evidovaná platba.</p>'}
    <p class="muted" style="font-size:12px;margin-top:10px">Vrátenie peňazí prebehne cez platobnú bránu. Jadro potom samo upraví prístupy k digitálnemu obsahu a pošle e-mail.</p>`;
  view.innerHTML = `<div class="detail-layout"><div class="card"><div class="card-h">Objednávka #${esc(history.number || o.display_id || '')}<button class="btn ghost" id="o-back">Späť</button></div><div class="card-b">
    <div id="omsg">${archived ? '<div class="notice">Historická objednávka zo starého obchodu. Slúži ako archív; nevytvára novú platbu ani zásielku.</div>' : ''}${notice ? `<div class="notice">${esc(notice)}</div>` : ''}</div>
    ${tabsHtml([{ id: 'p', label: 'Prehľad', html: prehlad }, { id: 'i', label: 'Položky', html: polozky }, { id: 'o', label: 'Odoslanie', html: odoslanie }, { id: 'pl', label: 'Platby', html: platby }])}
    ${!canceled && !archived && !anyShipped ? '<div style="margin-top:18px;border-top:1px solid var(--line);padding-top:14px"><button class="btn ghost" id="o-cancel">Zrušiť objednávku</button></div>' : ''}
  </div></div><aside class="detail-help panel" aria-label="Nápoveda k objednávke"><div class="panel-head"><h2>Ako postupovať</h2></div><div class="card-b" id="order-help" aria-live="polite"></div></aside></div>`;
  wireTabs(view);
  const orderHelp = {
    p: ['Skontrolujte objednávku', 'Tu vidíte zákazníčku, doručenie a aktuálny stav platby. Položky objednávky nájdete vo vedľajšej záložke.', 'objednavka-vybavit'],
    i: ['Čo zákazníčka objednala', 'Pri každej položke vidíte objednané, pripravené a odoslané množstvo. Na vybavenie pokračujte do Odoslanie.', 'objednavka-vybavit'],
    o: ['Pripravte a odošlite', 'Najprv pripravte položky. Po odovzdaní dopravcovi doplňte číslo zásielky a označte ju ako odoslanú. Zákazníčke odíde e-mail.', 'objednavka-vybavit'],
    pl: ['Platby a vrátenie peňazí', 'Skontrolujte prijatú a už vrátenú sumu. Pred vrátením peňazí overte sumu aj dôvod; ďalší krok si vyžiada potvrdenie.', 'objednavka-platby'],
  };
  const showOrderHelp = tab => { const h = archived ? ['Historická objednávka', 'Toto sú pôvodné údaje zo starého obchodu. Objednávku znova neodosielajte ani neúčtujte. Položky, pôvodnú sumu a stav si môžete prezrieť v záložkách.', 'objednavka-vybavit'] : orderHelp[tab]; view.querySelector('#order-help').innerHTML = `<h3>${esc(h[0])}</h3><p>${esc(h[1])}</p><a class="subtle-link" href="#/pomoc/${h[2]}">Podrobný postup →</a>`; };
  showOrderHelp('p');
  view.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => showOrderHelp(b.dataset.tab)));
  view.querySelector('#o-back').onclick = () => vOrders(view);
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
    run(b, 'Označiť zásielku ako odoslanú? Zákazníčke odíde e-mail.', () => api(`/admin/orders/${id}/fulfillments/${f.id}/shipments`, { method: 'POST', body }), 'Zásielka je označená ako odoslaná.');
  });
  view.querySelectorAll('[data-cap]').forEach(b => b.onclick = () => run(b, 'Prijať (strhnúť) túto platbu?', () => api(`/admin/payments/${b.dataset.cap}/capture`, { method: 'POST', body: {} }), 'Platba je prijatá.'));
  view.querySelectorAll('[data-ref]').forEach(b => b.onclick = () => {
    const amt = Number(view.querySelector(`[data-refamt="${CSS.escape(b.dataset.ref)}"]`)?.value), max = Number(b.dataset.max);
    if (!(amt > 0) || amt > max) { view.querySelector('#omsg').innerHTML = `<div class="err">Zadajte sumu od 0,01 do ${esc(fmtEur(max))}.</div>`; return; }
    run(b, `Naozaj vrátiť ${fmtEur(amt)} zákazníčke? Túto akciu nemožno vrátiť späť.`, () => api(`/admin/payments/${b.dataset.ref}/refund`, { method: 'POST', body: { amount: amt } }), `Vrátenie ${fmtEur(amt)} bolo odoslané.`);
  });
  const cb = view.querySelector('#o-cancel');
  if (cb) cb.onclick = () => run(cb, 'Naozaj zrušiť celú objednávku? Zaplatená suma sa zákazníčke automaticky vráti cez platobnú bránu.', () => api(`/admin/orders/${id}/cancel`, { method: 'POST', body: {} }), 'Objednávka je zrušená.');
}
async function vCustomers(view) {
  view = freshView(view);
  const { customers } = await api('/admin/customers?limit=100&fields=id,email,first_name,last_name,has_account,created_at');
  listView(view, { title: 'Zákazníčky', rows: customers, onRow: c => vCustomerDetail(view, c.id), empty: 'Zatiaľ žiadne zákazníčky.',
    card: c => { const nm = [c.first_name, c.last_name].filter(Boolean).join(' '); const av = (nm || c.email || '?').slice(0, 2).toUpperCase();
      return `<div class="rc-media"><span class="thumb" style="display:grid;place-items:center;font-weight:600;color:var(--forest)">${esc(av)}</span></div>
      <div class="rc-body"><div class="rc-title">${esc(nm || c.email)}</div><div class="rc-fields">
      ${nm ? `<span class="rc-f"><em>E-mail</em>${esc(c.email)}</span>` : ''}
      <span class="rc-f"><em>Účet</em>${c.has_account ? '<span class="pill ok">registrovaná</span>' : '<span class="pill warn">hosť</span>'}</span>
      <span class="rc-f"><em>Od</em>${fmtDate(c.created_at)}</span></div></div>`; } });
}
async function vCustomerDetail(view, id) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam…</div>';
  const { customer: c } = await api(`/admin/customers/${id}?fields=id,email,first_name,last_name,has_account,created_at,*groups`);
  let groups = []; try { groups = (await api('/admin/customer-groups?limit=50&fields=id,name')).customer_groups || []; } catch {}
  const inG = new Set((c.groups || []).map(g => g.id));
  const zakladne = `<div class="row"><div><label>E-mail</label><div>${esc(c.email)}</div></div><div><label>Účet</label><div>${c.has_account ? 'áno' : 'hosť'}</div></div></div>
    <div class="row"><div><label>Meno</label><input id="cu-first" value="${esc(c.first_name || '')}"></div><div><label>Priezvisko</label><input id="cu-last" value="${esc(c.last_name || '')}"></div></div>`;
  const skupiny = `<div>${groups.map(g => `<label style="display:inline-flex;gap:6px;margin:4px 12px 4px 0;align-items:center"><input type="checkbox" data-g="${g.id}" ${inG.has(g.id) ? 'checked' : ''} style="width:auto"> ${esc(g.name)}</label>`).join('') || '<span class="muted">Žiadne skupiny.</span>'}</div>`;
  view.innerHTML = `<div class="card"><div class="card-h">Zákazníčka<button class="btn ghost" id="cu-back">Späť</button></div><div class="card-b">
    <div id="custmsg"></div>
    ${tabsHtml([{ id: 'z', label: 'Základné', html: zakladne }, { id: 's', label: 'Skupiny / tier', html: skupiny }])}
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
}
async function vCoupons(view) {
  view = freshView(view);
  const { promotions } = await api('/admin/promotions?limit=100&fields=id,code,status,*application_method');
  setActions('<button class="btn gold" id="promo-new">+ Nový kupón</button>');
  const nb = document.querySelector('#promo-new'); if (nb) nb.onclick = () => vCouponNew(view);
  listView(view, { title: 'Kupóny & QR', rows: promotions, onRow: p => vCouponDetail(view, p.id), empty: 'Zatiaľ žiadne kupóny. QR generátor pridáva kupóny cez jadro.', cols: [
    { h: 'Kód', v: p => `<b>${esc(p.code)}</b>` }, { h: 'Stav', v: p => `<span class="pill ${p.status === 'active' ? 'ok' : 'warn'}">${esc(p.status)}</span>` },
    { h: 'Zľava', v: p => { const m = p.application_method; return m ? (m.type === 'percentage' ? m.value + ' %' : fmtEur(m.value)) : '—'; } }] });
}
async function vCouponNew(view) {
  view = freshView(view);
  view.innerHTML = `<div class="card"><div class="card-h">Nový kupón<button class="btn ghost" id="pn-back">Späť</button></div><div class="card-b">
    <div id="pnmsg"></div>
    <label>Kód</label><input id="pn-code" placeholder="napr. JAR26">
    <div class="row"><div><label>Typ zľavy</label><select id="pn-type"><option value="percentage">percentá %</option><option value="fixed">pevná suma €</option></select></div>
    <div><label>Hodnota</label><input id="pn-val" type="number" step="0.01" value="10"></div></div>
    <div style="margin-top:16px"><button class="btn gold" id="pn-save">Vytvoriť</button></div>
    <p class="muted" style="margin-top:10px">Kupón vznikne v jadre (promotions). Väzba na QR a limit sa dolaďuje cez jadro.</p>
  </div></div>`;
  view.querySelector('#pn-back').onclick = () => vCoupons(view);
  view.querySelector('#pn-save').onclick = async () => {
    const msg = view.querySelector('#pnmsg'); msg.innerHTML = '';
    const code = view.querySelector('#pn-code').value.trim(), type = view.querySelector('#pn-type').value, val = Number(view.querySelector('#pn-val').value);
    if (!code) { msg.innerHTML = '<div class="err">Zadaj kód.</div>'; return; }
    const am = { type, value: val, target_type: 'order', allocation: 'across' }; if (type === 'fixed') am.currency_code = 'eur';
    try { await api('/admin/promotions', { method: 'POST', body: { code, type: 'standard', status: 'active', application_method: am } }); await vCoupons(view); }
    catch (e) { msg.innerHTML = `<div class="err">Jadro odmietlo: ${esc(e.message)}</div>`; }
  };
}
async function vCouponDetail(view, id) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam…</div>';
  const { promotion: p } = await api(`/admin/promotions/${id}?fields=id,code,status,*application_method`);
  const m = p.application_method;
  view.innerHTML = `<div class="card"><div class="card-h">Kupón ${esc(p.code)}<button class="btn ghost" id="pd-back">Späť</button></div><div class="card-b">
    <div id="pdmsg"></div>
    <label>Stav</label><select id="pd-status"><option value="active"${p.status === 'active' ? ' selected' : ''}>active</option><option value="inactive"${p.status === 'inactive' ? ' selected' : ''}>inactive</option><option value="draft"${p.status === 'draft' ? ' selected' : ''}>draft</option></select>
    <div class="muted" style="margin-top:10px">Zľava: ${m ? (m.type === 'percentage' ? m.value + ' %' : fmtEur(m.value)) : '—'}</div>
    <div style="margin-top:16px"><button class="btn gold" id="pd-save">Uložiť</button></div>
  </div></div>`;
  view.querySelector('#pd-back').onclick = () => vCoupons(view);
  view.querySelector('#pd-save').onclick = async () => {
    const msg = view.querySelector('#pdmsg'); msg.innerHTML = '';
    try { await api(`/admin/promotions/${id}`, { method: 'POST', body: { status: view.querySelector('#pd-status').value } }); await vCoupons(view); }
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
  view.innerHTML = `<div class="empty"><div style="font-size:15px;font-weight:600;color:var(--ink);margin-bottom:6px">${esc(title)} — pripravujeme</div>${esc(note)}</div>`;
}

// sub-prepínač v topbare (pills) — jedna obrazovka, viac pohľadov
function subnav(view, items, idx = 0) {
  const a = document.querySelector('#actions');
  if (a) a.innerHTML = `<div class="pills">${items.map((it, i) => `<button class="pill ${i === idx ? 'on' : ''}" data-i="${i}">${esc(it.label)}</button>`).join('')}</div>`;
  if (a) a.querySelectorAll('.pill').forEach(b => b.onclick = () => { if (+b.dataset.i !== idx) subnav(view, items, +b.dataset.i); });
  items[idx].run(view);
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
      <span class="rc-f"><em>Stav</em>${klubPill(V_STATUS, v.status)}</span>
      <span class="rc-f"><em>Platí do</em>${v.expires_at ? fmtDate(v.expires_at) : '—'}</span></div></div>` })
    + `<div class="card" style="margin-top:20px"><div class="card-h">Vrátiť peniaze na poukaz</div><div class="card-b">
      <p class="muted">Ak zákazníčka zaplatila objednávku poukazom, vrátite sumu späť na jej poukaz. Jadro nepustí viac, než bolo poukazom zaplatené.</p>
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
  let tx = [];
  try { tx = (await api(`/admin/vouchers/${encodeURIComponent(v.id)}/transactions?limit=50`)).transactions || []; }
  catch (e) { if (e.message === '401') return; }
  view.innerHTML = `<div class="card"><div class="card-h">Poukaz ${esc(v.code)}<button class="btn ghost" id="v-back">Späť</button></div><div class="card-b">
    <div id="vmsg"></div>
    <div class="row"><div><label>Zostatok</label><div>${fmtEur(v.balance)} z ${fmtEur(v.initial_amount)}</div></div><div><label>Stav</label><div>${klubPill(V_STATUS, v.status)}</div></div></div>
    <div class="row"><div><label>Vydaný</label><div>${fmtDate(v.issued_at)}</div></div><div><label>Platí do</label><div>${v.expires_at ? fmtDate(v.expires_at) : '—'}</div></div></div>
    <div class="row"><div><label>Objednávka nákupu</label><div>${esc(v.source_order_id || '—')}</div></div><div><label>Doručenie</label><div>${esc(v.delivery_method || '—')} · ${esc(v.delivery_status || '—')}</div></div></div>
    ${v.voided_at ? `<p class="muted">Zneplatnený ${fmtDate(v.voided_at)}: ${esc(v.void_reason || '')}</p>` : ''}
    <label style="margin-top:14px">História</label>
    <div class="rc-grid">${tx.map(t => `<div class="rc"><div class="rc-body"><div class="rc-title">${esc(V_TX[t.type] || t.type)} · ${fmtEur(t.amount)}</div><div class="rc-fields">
      <span class="rc-f"><em>Kedy</em>${fmtDate(t.created_at)}</span><span class="rc-f"><em>Zostatok po</em>${fmtEur(t.balance_after)}</span>
      ${t.order_id ? `<span class="rc-f"><em>Objednávka</em>${esc(t.order_id)}</span>` : ''}${t.reversed_at ? '<span class="pill off">stornované</span>' : ''}</div></div></div>`).join('') || '<div class="empty">Bez záznamov.</div>'}</div>
    ${v.status === 'active' ? `<div style="margin-top:18px;border-top:1px solid var(--line);padding-top:14px"><label>Dôvod zneplatnenia</label><input id="v-reason" maxlength="300" placeholder="napr. podvodná objednávka">
      <div style="margin-top:10px"><button class="btn ghost" id="v-void">Zneplatniť poukaz</button></div></div>` : ''}
  </div></div>`;
  view.querySelector('#v-back').onclick = back;
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
const vPoukazy = (view) => subnav(view, [{ label: 'Kupóny a zľavy', run: vCoupons }, { label: 'Darčekové poukazy', run: vVouchers }, { label: 'Nastavenie poukazov', run: vVoucherSettings }]);
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
  view.innerHTML = pagedHtml({ tabs: B_TABS, active: status, items, count: d.count || 0, offset, empty: 'Žiadne konzultácie.',
    card: b => `<div class="rc-body"><div class="rc-title">${esc(b.customer_label)}</div><div class="rc-fields">
      <span class="rc-f"><em>Termín</em>${fmtDate(b.starts_at)}</span><span class="rc-f"><em>Konzultácia</em>${esc(b.product_label)}</span>
      <span class="rc-f"><em>Stav</em>${klubPill(B_STATUS, b.status)}</span></div></div>` });
  wirePaged(view, { items, offset, go, open: b => vBookingDetail(view, b, () => go({})) });
}
function vBookingDetail(view, b, back) {
  view = freshView(view);
  // Termín naviazaný na košík/objednávku backend samostatne nezruší (BOOKING_CANCEL_ORDER_FIRST): ruší sa zrušením objednávky.
  const inOrder = Boolean(b.metadata?.checkout_cart_id);
  const active = (b.status === 'held' || b.status === 'confirmed') && !inOrder;
  view.innerHTML = `<div class="card"><div class="card-h">Konzultácia · ${esc(b.customer_label)}<button class="btn ghost" id="b-back">Späť</button></div><div class="card-b">
    <div id="bmsg"></div>
    <div class="row"><div><label>Termín</label><div>${fmtDate(b.starts_at)} – ${fmtDate(b.ends_at)}</div></div><div><label>Stav</label><div>${klubPill(B_STATUS, b.status)}</div></div></div>
    <div class="row"><div><label>Konzultácia</label><div>${esc(b.product_label)}</div></div><div><label>Objednávka</label><div>${b.order_id ? `<a href="#/objednavky" data-ord="${esc(b.order_id)}">${esc(b.order_id)}</a>` : '—'}</div></div></div>
    ${b.status === 'held' && b.held_until ? `<p class="muted">Termín je držaný do ${fmtDate(b.held_until)}; potom sa sám uvoľní.</p>` : ''}
    ${inOrder && b.status === 'confirmed' ? `<p class="muted">Termín je zaplatený v objednávke. Zrušíte ho zrušením objednávky${b.order_id ? ` (<a href="#/objednavky" data-ord="${esc(b.order_id)}">otvoriť objednávku</a>)` : ''}; zákazníčke odíde e-mail o zrušení a zaplatená suma sa jej automaticky vráti.</p>` : ''}
    ${inOrder && b.status === 'held' ? '<p class="muted">Zákazníčka má termín v rozpracovanej pokladni. Ak nezaplatí, termín sa sám uvoľní.</p>' : ''}
    ${b.canceled_at ? `<p class="muted">Zrušená ${fmtDate(b.canceled_at)}${b.cancel_reason ? ': ' + esc(b.cancel_reason) : ''}</p>` : ''}
    ${active ? `<div style="margin-top:18px;border-top:1px solid var(--line);padding-top:14px"><label>Dôvod zrušenia (voliteľné)</label><input id="b-reason" maxlength="500">
      <div style="margin-top:10px"><button class="btn ghost" id="b-cancel">Zrušiť termín</button></div>
      <p class="muted" style="font-size:12px;margin-top:8px">${b.status === 'confirmed' ? 'Zákazníčke odíde e-mail o zrušení. Peniaze vrátite v detaile objednávky.' : 'Termín sa uvoľní pre ostatné zákazníčky.'}</p></div>` : ''}
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

// --- Typy konzultácií (/admin/booking/types) — typ = produkt s cenou, ktorý si zákazníčka rezervuje na webe ---
const BT_FORM = { online: 'online', in_person: 'osobne' };
async function vBookingTypes(view, notice) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam typy konzultácií…</div>';
  let d;
  try { d = await api('/admin/booking/types?include_archived=true'); }
  catch (e) { return loadError(view, e, () => vBookingTypes(view)); }
  const types = d.types || [];
  view.innerHTML = `${notice ? `<div class="notice">${esc(notice)}</div>` : ''}
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px"><p class="muted" style="margin:0">Aktívne typy si zákazníčky rezervujú na stránke Konzultácie → Vybrať termín.</p><button class="btn gold" id="bt-new">Nový typ konzultácie</button></div>
    <div class="rc-grid">${types.length ? types.map(t => `<button class="rc" data-id="${esc(t.id)}"><div class="rc-body"><div class="rc-title">${esc(t.title)}</div><div class="rc-fields">
      <span class="rc-f"><em>Cena</em>${fmtEur(t.price_eur)}</span><span class="rc-f"><em>Dĺžka</em>${t.duration_minutes} min${t.buffer_minutes ? ` + ${t.buffer_minutes} min pauza` : ''}</span>
      <span class="rc-f"><em>Forma</em>${esc(BT_FORM[t.form] || t.form)}</span>
      <span class="rc-f"><em>Stav</em>${t.archived ? '<span class="pill off">archivovaný</span>' : t.active ? '<span class="pill ok">v ponuke</span>' : '<span class="pill warn">skrytý</span>'}</span></div></div></button>`).join('') : '<div class="empty">Zatiaľ žiadny typ konzultácie. Vytvorte prvý, aby si zákazníčky mohli rezervovať termín.</div>'}</div>`;
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
        ${bk.length ? `<div class="availability-bookings">${bk.map(b => `<div class="muted" style="font-size:12px">${esc(avTime(b.starts_at))}–${esc(avTime(b.ends_at))} · ${esc(b.customer?.name || '')} · ${esc(b.product?.title || '')} ${klubPill(B_STATUS, b.status)}</div>`).join('')}</div>` : ''}
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

// --- Správy (/admin/chat/*) — odpoveď odíde zákazníčke aj e-mailom ---
const C_TABS = [{ id: 'open', label: 'Otvorené' }, { id: 'closed', label: 'Uzavreté' }, { id: 'all', label: 'Všetky' }];
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
    card: c => `<div class="rc-body"><div class="rc-title">${c.unread ? '● ' : ''}${esc(c.customer?.name || c.customer?.email || 'Zákazníčka')}</div><div class="rc-fields">
      <span class="rc-f"><em>Téma</em>${esc(c.subject || '—')}</span><span class="rc-f"><em>Posledná správa</em>${fmtDate(c.last_message_at)}</span>
      <span class="rc-f">${c.unread ? '<span class="pill warn">neprečítaná</span>' : ''}${c.status === 'closed' ? '<span class="pill off">uzavretá</span>' : ''}${c.muted ? ' <span class="pill off">stlmená</span>' : ''}${c.customer?.chat_blocked ? ' <span class="pill off">chat zablokovaný</span>' : ''}</span></div></div>` });
  wirePaged(view, { items, offset, go, open: c => vConversation(view, c.id, () => go({})) });
}
async function vConversation(view, id, back, notice) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam konverzáciu…</div>';
  let d;
  try { d = await api(`/admin/chat/conversations/${encodeURIComponent(id)}`); }
  catch (e) { return loadError(view, e, () => vConversation(view, id, back)); }
  const c = d.conversation, cu = c.customer || {};
  if (c.unread) api(`/admin/chat/conversations/${encodeURIComponent(id)}/read`, { method: 'POST', body: {} }).catch(() => {});
  view.innerHTML = `<div class="card"><div class="card-h">${esc(cu.name || cu.email || 'Zákazníčka')}${c.subject ? ' · ' + esc(c.subject) : ''}<button class="btn ghost" id="c-back">Späť</button></div><div class="card-b">
    <div id="cmsg">${notice ? `<div class="notice">${esc(notice)}</div>` : ''}</div>
    <p class="muted">${esc(cu.email || '')}${c.order_id ? ' · objednávka ' + esc(c.order_id) : ''}${c.booking_id ? ' · konzultácia ' + esc(c.booking_id) : ''}</p>
    <div style="display:flex;flex-direction:column;gap:10px;max-height:420px;overflow:auto;padding:4px 0" id="c-thread">
      ${(d.messages || []).map(m => `<div style="max-width:80%;align-self:${m.author === 'lucia' ? 'flex-end' : 'flex-start'};background:${m.author === 'lucia' ? 'var(--soft)' : '#fff'};border:1px solid var(--line);border-radius:12px;padding:10px 12px">
        <div style="white-space:pre-wrap">${esc(m.body)}</div><div class="muted" style="font-size:11px;margin-top:4px">${m.author === 'lucia' ? 'Vy' : 'Zákazníčka'} · ${fmtDate(m.created_at)}</div></div>`).join('') || '<div class="empty">Zatiaľ bez správ.</div>'}
    </div>
    ${cu.chat_blocked ? '<p class="muted">Zákazníčka má chat zablokovaný — nemôže písať nové správy.</p>' : ''}
    <form id="c-reply" style="margin-top:12px"><label>Odpoveď</label><textarea id="c-body" rows="4" maxlength="5000" required></textarea>
      <div style="margin-top:8px"><button class="btn gold" type="submit">Odoslať</button> <span class="muted" style="font-size:12px">Zákazníčke príde aj e-mail.</span></div></form>
    <div style="margin-top:18px;border-top:1px solid var(--line);padding-top:14px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn ghost" data-act="${c.status === 'closed' ? 'reopen' : 'close'}">${c.status === 'closed' ? 'Znovu otvoriť' : 'Uzavrieť konverzáciu'}</button>
      <button class="btn ghost" data-act="${c.muted ? 'unmute' : 'mute'}">${c.muted ? 'Zrušiť stlmenie' : 'Stlmiť upozornenia'}</button>
      <button class="btn ghost" id="c-block">${cu.chat_blocked ? 'Odblokovať chat zákazníčky' : 'Zablokovať chat zákazníčky'}</button>
    </div>
  </div></div>`;
  const th = view.querySelector('#c-thread'); th.scrollTop = th.scrollHeight;
  view.querySelector('#c-back').onclick = back;
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
    if (!confirm(blocked ? 'Zablokovať zákazníčke písanie do chatu? Dá sa to kedykoľvek vrátiť.' : 'Odblokovať zákazníčke chat?')) return;
    bb.disabled = true;
    try { await api(`/admin/chat/customers/${encodeURIComponent(cu.id)}/block`, { method: 'POST', body: { blocked } }); await vConversation(view, id, back, blocked ? 'Chat zákazníčky je zablokovaný.' : 'Chat zákazníčky je odblokovaný.'); }
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
      <div class="rc-fields"><span class="rc-f"><em>Komu</em>${esc(t.audience || '—')}</span>
      <span class="rc-f"><em>Stav</em><span class="pill ${t.enabled ? 'ok' : 'off'}">${t.enabled ? 'zapnutá' : 'vypnutá'}</span>${t.customized ? '<span class="pill warn">upravená</span>' : ''}</span></div></div>`,
  });
}
async function vEmailDetail(view, t) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam…</div>';
  let html = '';
  try { const r = await api(`/admin/email-templates/${t.name}/preview`); html = r.html || r.preview || ''; } catch {}
  view.innerHTML = `<div class="card"><div class="card-h">${esc(t.label || t.name)}<button class="btn ghost" id="e-back">Späť</button></div><div class="card-b">
    <p class="muted">${esc(t.description || '')}</p>
    <label>Náhľad e-mailu</label>
    <div style="border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fff">${html ? `<iframe style="width:100%;height:420px;border:0" sandbox></iframe>` : '<div class="empty">Náhľad sa teraz nedá načítať.</div>'}</div>
  </div></div>`;
  view.querySelector('#e-back').onclick = () => vEmaily(view);
  if (html) { const f = view.querySelector('iframe'); f.srcdoc = html; }
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
const vObsah = (view) => subnav(view, [
  { label: 'E-maily', run: vEmaily },
  { label: 'Newsletter', run: vNewsletter },
  { label: 'Stránky a texty', run: (v) => stub(v, 'Stránky a texty', 'Samoobslužná správa obsahových stránok. Pripravuje sa modul CMS.') },
  { label: 'Médiá', run: (v) => stub(v, 'Médiá', 'Chránené videá a audio (R2).') },
  { label: 'Preklady', run: (v) => stub(v, 'Preklady', 'SK zdroj, EN/RU — z jedného admina.') },
]);
// --- Doprava a platby: prehľad z jadra len na čítanie (žiadne kľúče, žiadne tajomstvá) ---
const PROVIDER_LABEL = { pp_system_default: 'Manuálna platba (bez brány)', pp_stripe_stripe: 'Platobná karta (Stripe)', pp_membership_stripe_membership: 'Platobná karta – Klub', manual_manual: 'Vlastná doprava' };
const provLabel = (id) => PROVIDER_LABEL[id] || id || '—';
async function vDopravaPlatby(view) {
  view = freshView(view);
  view.innerHTML = '<div class="muted">Načítavam dopravu a platby…</div>';
  const soft = (e) => { if (e.message === '401') throw e; return null; };
  const [rg, so, sl] = await Promise.all([
    api('/admin/regions?limit=50&fields=id,name,currency_code,automatic_taxes,*countries,*payment_providers').catch(soft),
    api('/admin/shipping-options?limit=100&fields=id,name,price_type,provider_id,*prices,*service_zone,*type,*rules').catch(soft),
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
  const optionsHtml = !so ? unread : `<div class="rc-grid">${options.map(o => { const pr = eurPrice(o), ret = (o.rules || []).some(x => x.attribute === 'is_return' && String(x.value) === 'true');
    return `<div class="rc"><div class="rc-body"><div class="rc-title">${esc(o.name)}</div><div class="rc-fields">
      <span class="rc-f"><em>Cena</em>${o.price_type === 'calculated' ? 'počíta dopravca' : pr ? (Number(pr.amount) === 0 ? 'zadarmo' : fmtEur(pr.amount)) : '<span class="pill warn">bez ceny v EUR</span>'}</span>
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
const vNastavenia = (view) => subnav(view, [
  { label: 'Vzhľad', run: vAppearance },
  { label: 'Doprava a platby', run: vDopravaPlatby },
  { label: 'Používatelia', run: (v) => vPouzivatelia(v) },
  { label: 'Účtovníctvo', run: (v) => stub(v, 'Účtovníctvo', 'Napojenie fakturácie (POHODA / Money S3).') },
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
  btn.onclick = () => { const open = panel.hidden; set(open); if (open) panel.querySelector('h2')?.scrollIntoView({ block: 'nearest' }); };
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
      <p class="eyebrow">${esc(groupLabel(g.group))}</p>
      <h2 id="guide-t">${esc(g.title)}</h2>
      <p class="intro">${esc(g.summary)}</p>
      <section class="guide-sec"><h3>Prečo</h3><p>${esc(g.why)}</p></section>
      <section class="guide-sec"><h3>Ako na to</h3><ol class="guide-steps">${g.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol></section>
      ${g.extra ? `<section class="guide-sec"><h3>${esc(g.extra.title)}</h3>${list(g.extra.items)}</section>` : ''}
      ${g.after && g.after.length ? `<section class="guide-sec"><h3>Čo sa stane potom</h3>${list(g.after)}</section>` : ''}
      ${g.careful && g.careful.length ? `<section class="guide-sec guide-careful"><h3>Na čo si dať pozor</h3>${list(g.careful)}</section>` : ''}
      <div class="guide-actions"><a class="btn primary" href="${esc(g.href)}">${esc(g.hrefLabel)}${navIcon('arrow')}</a><a class="btn ghost" href="#/pomoc">Všetky návody</a></div>
    </div></article>
    ${related.length ? `<section class="help-group"><h2>Súvisiace návody</h2><div class="guide-grid">${related.map(x => `<a class="guide-card" href="#/pomoc/${esc(x.id)}">${navIcon(x.icon || 'doc')}<span><strong>${esc(x.title)}</strong><small>${esc(x.summary)}</small></span></a>`).join('')}</div></section>` : ''}`;
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
  const rows = (entitlements || []).map(e => ({ ...e, product_title: e.product_title || (names.prod(e.product_id) === e.product_id ? 'Produkt sa nepodarilo načítať' : names.prod(e.product_id)), customer_email: e.customer_email || (names.cust(e.customer_id) === e.customer_id ? 'Zákazníčku sa nepodarilo načítať' : names.cust(e.customer_id)) }));
  listView(view, {
    title: 'Prístupy a knižnica', rows, onRow: e => vEntitlementDetail(view, e),
    empty: 'Zatiaľ žiadne priradené prístupy. Pridelia sa automaticky po nákupe (jedna identita – všetky nákupy).',
    card: e => `<div class="rc-body"><div class="rc-title">${esc(e.product_title || e.product_id || 'Prístup')}</div><div class="rc-fields">
      <span class="rc-f"><em>Zákazníčka</em>${esc(e.customer_email || e.customer_id || '—')}</span>
      <span class="rc-f"><em>Stav</em><span class="pill ${e.status === 'active' ? 'ok' : 'off'}">${esc(e.status === 'active' ? 'Aktívny' : e.status === 'revoked' ? 'Odobratý' : 'Neaktívny')}</span></span>
      ${e.expires_at ? `<span class="rc-f"><em>Platí do</em>${fmtDate(e.expires_at)}</span>` : ''}</div></div>`,
  });
}
async function vEntitlementDetail(view, e) {
  view = freshView(view);
  view.innerHTML = `<div class="card"><div class="card-h">Prístup<button class="btn ghost" id="e-back">Späť</button></div><div class="card-b">
    <div id="emsg"></div>
    <div class="row"><div><label>Produkt</label><div>${esc(e.product_title || e.product_id || '—')}</div></div>
    <div><label>Zákazníčka</label><div>${esc(e.customer_email || e.customer_id || '—')}</div></div></div>
    <div class="row"><div><label>Stav</label><div><span class="pill ${e.status === 'active' ? 'ok' : 'off'}">${esc(e.status === 'active' ? 'Aktívny' : e.status === 'revoked' ? 'Odobratý' : 'Neaktívny')}</span></div></div>
    <div><label>Platí do</label><div>${e.expires_at ? fmtDate(e.expires_at) : 'trvalý'}</div></div></div>
    <p class="muted" style="margin-top:12px">${e.source === 'migration' ? 'Prístup prenesený zo starého obchodu.' : e.source === 'admin' ? 'Prístup pridelený v administrácii.' : 'Prístup k zakúpenému produktu.'}</p>
    ${e.status === 'active' ? '<div style="margin-top:16px"><button class="btn ghost" id="e-revoke">Odobrať prístup</button></div>' : ''}
  </div></div>`;
  view.querySelector('#e-back').onclick = () => vEntitlements(view);
  const rb = view.querySelector('#e-revoke');
  if (rb) rb.onclick = async () => { if (!confirm(`Odobrať zákazníčke ${e.customer_email} prístup k produktu ${e.product_title}?`)) return; const msg = view.querySelector('#emsg'); msg.innerHTML = '';
    try { await api(`/admin/entitlements/${e.id}/revoke`, { method: 'POST' }); vEntitlements(view); }
    catch (err) { msg.innerHTML = `<div class="err">${esc(err.message)}</div>`; } };
}
const vZakaznicky = (view) => subnav(view, [{ label: 'Zákazníčky', run: vCustomers }, { label: 'Prístupy a knižnica', run: vEntitlements }]);

// --- Klub ANASTASIA (/admin/memberships*) — platby a stavy rieši výhradne jadro, tu len prehľad a bezpečné akcie ---
const KLUB_TABS = [
  { id: 'memberships', label: 'Členky', q: 'ID zákazníčky (cus_…)' },
  { id: 'checkouts', label: 'Nákupy členstva', q: 'ID zákazníčky (cus_…)' },
  { id: 'products', label: 'Produkty Klubu', q: 'Názov produktu' },
  { id: 'billing', label: 'Obnovy platieb', q: 'ID členstva (mbr_…)' },
];
const KLUB_STATUS = { active: ['aktívne', 'ok'], renewing: ['obnovuje sa', 'warn'], unknown: ['platbu treba overiť', 'warn'], needs_review: ['na kontrolu', 'off'] };
const KLUB_ACCESS = { active: ['prístup aktívny', 'ok'], pending: ['prístup sa pripravuje', 'warn'], expired: ['prístup vypršal', 'off'], revoked: ['prístup odobratý', 'off'], needs_review: ['prístup na kontrolu', 'warn'] };
const KLUB_STAGE = { planned: ['naplánovaná', 'warn'], cart_requested: ['prebieha', 'warn'], cart_ready: ['prebieha', 'warn'], payment_requested: ['prebieha', 'warn'], payment_ready: ['prebieha', 'warn'], completing: ['dokončuje sa', 'warn'], needs_action: ['čaká na overenie kartou', 'warn'], unknown: ['treba overiť', 'off'], review: ['na kontrolu', 'off'], settled: ['zaplatená', 'ok'] };
const klubPill = (map, s) => { const [l, c] = map[s] || [s || '—', 'off']; return `<span class="pill ${c}">${esc(l)}</span>`; };
const KLUB_LIMIT = 12;
async function vKlub(view, state = {}) {
  view = freshView(view);
  const tab = KLUB_TABS.find(t => t.id === state.tab) || KLUB_TABS[0];
  const offset = Math.max(0, state.offset | 0), q = (state.q || '').trim();
  const go = (patch) => vKlub(view, { tab: tab.id, offset, q, ...patch });
  view.innerHTML = '<div class="muted">Načítavam Klub…</div>';
  let data;
  try {
    data = await api(`/admin/memberships?tab=${tab.id}&offset=${offset}&limit=${KLUB_LIMIT}${q ? '&q=' + encodeURIComponent(q) : ''}`);
  } catch (e) {
    if (e.message === '401') throw e;
    view.innerHTML = `<div class="err">${esc(e.message)}</div><div style="margin-top:12px"><button class="btn ghost" id="k-retry">Obnoviť</button></div>`;
    view.querySelector('#k-retry').onclick = () => go({});
    return;
  }
  const items = data.items || [], count = data.count || 0;
  const cards = {
    memberships: m => `<div class="rc-body"><div class="rc-title">${esc(m.customer_label)}</div><div class="rc-fields">
      <span class="rc-f"><em>Členstvo</em>${esc(m.title)}</span>
      <span class="rc-f"><em>Stav</em>${klubPill(KLUB_STATUS, m.status)} ${klubPill(KLUB_ACCESS, m.access_status)}</span>
      <span class="rc-f"><em>Platí do</em>${fmtDate(m.period_end)}${m.period_elapsed ? ' <span class="pill off">obdobie skončilo</span>' : ''}</span>
      <span class="rc-f"><em>Obnova</em>${m.renew ? '<span class="pill ok">automatická</span>' : '<span class="pill off">zastavená</span>'}</span></div></div>`,
    checkouts: c => `<div class="rc-body"><div class="rc-title">${esc(c.customer_label)}</div><div class="rc-fields">
      <span class="rc-f"><em>Stav</em>${c.status === 'settled' ? '<span class="pill ok">dokončený</span>' : '<span class="pill warn">rozpracovaný</span>'}</span>
      <span class="rc-f"><em>Objednávka</em>${c.order_id ? `<a href="#/objednavky" class="muted">${esc(c.order_id)}</a>` : '—'}</span>
      <span class="rc-f"><em>Členstvo</em>${esc(c.membership_id || '—')}</span></div></div>`,
    products: p => `<div class="rc-body"><div class="rc-title">${esc(p.title)}</div><div class="rc-fields">
      <span class="rc-f"><em>Produkt</em><span class="pill ${p.status === 'published' ? 'ok' : 'warn'}">${p.status === 'published' ? 'zverejnený' : 'koncept'}</span></span>
      <span class="rc-f"><em>Klub</em>${p.configuration_invalid ? '<span class="pill off">nastavenie je poškodené</span>' : p.configuration ? `<span class="pill ok">${p.configuration.period_days} dní</span> <span class="muted">podmienky ${esc(p.configuration.version)}</span>` : '<span class="muted">nie je členstvo</span>'}</span></div></div>`,
    billing: b => `<div class="rc-body"><div class="rc-title">${esc(b.title)} · ${fmtDate(b.created_at)}</div><div class="rc-fields">
      <span class="rc-f"><em>Stav</em>${klubPill(KLUB_STAGE, b.status)}</span>
      <span class="rc-f"><em>Členstvo</em>${esc(b.membership_id)}</span>
      <span class="rc-f"><em>Objednávka</em>${esc(b.order_id || '—')}</span>
      <span class="rc-f"><em>Zmena</em>${fmtDate(b.updated_at)}</span></div></div>`,
  };
  const empty = { memberships: 'Zatiaľ žiadne členky v Klube.', checkouts: 'Zatiaľ žiadne nákupy členstva.', products: 'Žiadne produkty.', billing: 'Zatiaľ žiadne obnovy platieb.' };
  const from = count ? offset + 1 : 0, to = Math.min(offset + items.length, count);
  view.innerHTML = `<div class="tabs">${KLUB_TABS.map(t => `<button class="tab ${t.id === tab.id ? 'active' : ''}" data-k="${t.id}">${esc(t.label)}</button>`).join('')}</div>
    <form class="rc-head" id="k-search" style="gap:10px;flex-wrap:wrap"><input class="rc-search" id="k-q" value="${esc(q)}" placeholder="${esc(tab.q)}" style="flex:1;min-width:200px">
      <button class="btn ghost" type="submit">Hľadať</button>${q ? '<button class="btn ghost" type="button" id="k-clear">Zrušiť</button>' : ''}</form>
    <div class="rc-grid">${items.length ? items.map(r => `<button class="rc" data-id="${esc(r.id)}">${cards[tab.id](r)}</button>`).join('') : `<div class="empty">${esc(q ? 'Nič sa nenašlo.' : empty[tab.id])}</div>`}</div>
    <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:14px;flex-wrap:wrap">
      <span class="muted">${count ? `${from}–${to} z ${count}` : ''}</span>
      <div style="display:flex;gap:8px"><button class="btn ghost" id="k-prev" ${offset > 0 ? '' : 'disabled'}>← Predchádzajúce</button><button class="btn ghost" id="k-next" ${offset + KLUB_LIMIT < count ? '' : 'disabled'}>Ďalšie →</button></div>
    </div>`;
  view.querySelectorAll('[data-k]').forEach(b => b.onclick = () => vKlub(view, { tab: b.dataset.k }));
  view.querySelector('#k-search').onsubmit = (e) => { e.preventDefault(); go({ offset: 0, q: view.querySelector('#k-q').value }); };
  const clr = view.querySelector('#k-clear'); if (clr) clr.onclick = () => go({ offset: 0, q: '' });
  view.querySelector('#k-prev').onclick = () => go({ offset: Math.max(0, offset - KLUB_LIMIT) });
  view.querySelector('#k-next').onclick = () => go({ offset: offset + KLUB_LIMIT });
  const back = () => go({});
  const open = { memberships: m => vKlubMember(view, m, back), checkouts: null, products: p => vKlubProduct(view, p, back), billing: b => vKlubBilling(view, b, back) }[tab.id];
  view.querySelectorAll('.rc[data-id]').forEach(el => { if (!open) { el.disabled = true; el.style.cursor = 'default'; return; } el.onclick = () => open(items.find(x => x.id === el.dataset.id)); });
}
function vKlubMember(view, m, back) {
  view = freshView(view);
  view.innerHTML = `<div class="card"><div class="card-h">${esc(m.customer_label)}<button class="btn ghost" id="k-back">Späť</button></div><div class="card-b">
    <div id="kmsg"></div>
    <div class="row"><div><label>Členstvo</label><div>${esc(m.title)}</div></div><div><label>Dĺžka obdobia</label><div>${m.period_days} dní · podmienky ${esc(m.version)}</div></div></div>
    <div class="row"><div><label>Stav</label><div>${klubPill(KLUB_STATUS, m.status)}</div></div><div><label>Prístup k obsahu</label><div>${klubPill(KLUB_ACCESS, m.access_status)}</div></div></div>
    <div class="row"><div><label>Platí do</label><div>${fmtDate(m.period_end)}</div></div><div><label>Automatická obnova</label><div>${m.renew ? 'zapnutá' : 'zastavená'}</div></div></div>
    <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
      ${m.renew ? '<button class="btn ghost" id="k-stop">Zastaviť automatickú obnovu</button>' : ''}
      <button class="btn ghost" id="k-bill">Obnovy platieb</button>
    </div>
    <p class="muted" style="margin-top:10px;font-size:12px">Zastavenie neodoberie už zaplatené obdobie — členka má prístup do konca obdobia, ďalšia platba sa už nespustí. Platbu, ktorá je už rozbehnutá, môže jadro ešte dokončiť.</p>
  </div></div>`;
  view.querySelector('#k-back').onclick = back;
  view.querySelector('#k-bill').onclick = () => vKlub(view, { tab: 'billing', q: m.id });
  const sb = view.querySelector('#k-stop');
  if (sb) sb.onclick = async () => {
    if (!confirm('Naozaj zastaviť automatickú obnovu tohto členstva? Zaplatené obdobie zostáva.')) return;
    const msg = view.querySelector('#kmsg'); msg.innerHTML = ''; sb.disabled = true;
    try { const r = await api(`/admin/memberships/${encodeURIComponent(m.id)}/stop`, { method: 'POST', body: {} }); vKlubMember(view, { ...m, renew: r.membership.renew, status: r.membership.status, period_end: r.membership.period_end }, back); flash('#kmsg', '<div class="notice">Automatická obnova je zastavená.</div>'); }
    catch (e) { sb.disabled = false; msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
}
function vKlubProduct(view, p, back) {
  view = freshView(view);
  const c = p.configuration;
  view.innerHTML = `<div class="card"><div class="card-h">${esc(p.title)}<button class="btn ghost" id="k-back">Späť</button></div><div class="card-b">
    <div id="kmsg"></div>
    ${p.configuration_invalid ? '<div class="err">Nastavenie členstva pri tomto produkte je poškodené. Kontaktujte podporu, nič neprepisujte.</div>' : ''}
    <p class="muted">Produkt sa stane členstvom Klubu: zákazníčka ho kúpi kartou a prístup platí počet dní nižšie. Pri zmene dĺžky zadajte aj novú verziu podmienok — existujúce členky ostávajú na pôvodných podmienkach a pri ďalšej obnove ich jadro pošle na kontrolu.</p>
    <div class="row"><div><label>Dĺžka obdobia (dni)</label><input id="k-days" type="number" min="1" max="3650" step="1" value="${c ? c.period_days : 30}" ${p.configuration_invalid ? 'disabled' : ''}></div>
    <div><label>Verzia podmienok</label><input id="k-ver" value="${esc(c ? c.version : 'v1')}" placeholder="napr. v1, 2026-10" ${p.configuration_invalid ? 'disabled' : ''}></div></div>
    ${p.configuration_invalid ? '' : `<div style="margin-top:16px"><button class="btn gold" id="k-save">${c ? 'Uložiť podmienky' : 'Zaradiť do Klubu'}</button></div>`}
  </div></div>`;
  view.querySelector('#k-back').onclick = back;
  const sv = view.querySelector('#k-save');
  if (sv) sv.onclick = async () => {
    const msg = view.querySelector('#kmsg'); msg.innerHTML = '';
    const days = Number(view.querySelector('#k-days').value), version = view.querySelector('#k-ver').value.trim();
    if (!Number.isInteger(days) || days < 1 || days > 3650) { msg.innerHTML = '<div class="err">Dĺžka obdobia musí byť celé číslo od 1 do 3650 dní.</div>'; return; }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(version)) { msg.innerHTML = '<div class="err">Verzia podmienok smie obsahovať len písmená, čísla, „-“ a „_“.</div>'; return; }
    if (!confirm(c ? 'Uložiť nové podmienky členstva?' : 'Zaradiť produkt do Klubu ako členstvo?')) return;
    sv.disabled = true;
    try {
      const r = await api(`/admin/memberships/products/${encodeURIComponent(p.id)}`, { method: 'POST', body: { expected: c || null, configuration: { version, period_days: days } } });
      vKlubProduct(view, { ...p, configuration: r.product.configuration, configuration_invalid: false }, back);
      flash('#kmsg', '<div class="notice">Uložené.</div>');
    } catch (e) { sv.disabled = false; msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
}
function vKlubBilling(view, b, back) {
  view = freshView(view);
  const canReconcile = !['settled', 'review'].includes(b.status);
  view.innerHTML = `<div class="card"><div class="card-h">${esc(b.title)}<button class="btn ghost" id="k-back">Späť</button></div><div class="card-b">
    <div id="kmsg"></div>
    <div class="row"><div><label>Stav</label><div>${klubPill(KLUB_STAGE, b.status)}</div></div><div><label>Členstvo</label><div>${esc(b.membership_id)}</div></div></div>
    <div class="row"><div><label>Začiatok</label><div>${fmtDate(b.created_at)}</div></div><div><label>Objednávka</label><div>${esc(b.order_id || '—')}</div></div></div>
    ${canReconcile ? `<div style="margin-top:16px"><button class="btn ghost" id="k-rec">Dohľadať platbu</button></div>
    <p class="muted" style="margin-top:10px;font-size:12px">Jadro len overí už existujúcu objednávku a platbu. Nikdy nespustí novú platbu ani nový nákup.</p>` : ''}
    ${b.status === 'needs_action' ? '<p class="muted" style="font-size:12px">Banka žiada overenie kartou. Členka ho dokončí vo svojom účte; nová platba sa nevytvára.</p>' : ''}
    ${b.status === 'review' ? '<p class="muted" style="font-size:12px">Obnova je zastavená na kontrolu (napr. zmenené podmienky alebo neplatná karta). Členka dostane možnosť obnoviť členstvo sama.</p>' : ''}
  </div></div>`;
  view.querySelector('#k-back').onclick = back;
  const rb = view.querySelector('#k-rec');
  if (rb) rb.onclick = async () => {
    if (!confirm('Dohľadať existujúcu platbu tejto obnovy?')) return;
    const msg = view.querySelector('#kmsg'); msg.innerHTML = ''; rb.disabled = true;
    try { const r = await api(`/admin/memberships/billing/${encodeURIComponent(b.id)}/reconcile`, { method: 'POST', body: {} });
      msg.innerHTML = r.status === 'SETTLED' ? '<div class="notice">Platba je overená a členstvo predĺžené.</div>' : '<div class="notice">Objednávka zatiaľ neexistuje alebo sa nedá overiť. Skúste neskôr; nový nákup nespúšťajte.</div>'; }
    catch (e) { msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    finally { rb.disabled = false; }
  };
}

const ROUTES = {
  '': ['', '', vDashboard],
  'objednavky': ['Objednávky', 'Prehľad a vybavenie objednávok', vOrders],
  'produkty': ['Produkty', 'Katalóg, ceny a akcie', vProducts],
  'kategorie': ['Kategórie', 'Stromy a zaradenie', vCategories],
  'zakaznicky': ['Zákazníčky', 'Účty, história a prístupy', vZakaznicky],
  'konzultacie': ['Konzultácie', 'Rezervácie, typy konzultácií a dostupnosť', vKonzultacieMenu],
  'spravy': ['Správy', 'Konverzácie so zákazníčkami', vSpravy],
  'klub': ['Klub ANASTASIA', 'Členky, nákupy členstva, podmienky a obnovy platieb', vKlub],
  'poukazy': ['Poukazy a zľavy', 'Kupóny, QR a darčekové poukazy', vPoukazy],
  'obsah': ['Obsah a e-maily', 'Stránky, texty, médiá a preklady', vObsah],
  'nastavenia': ['Nastavenia', 'Vzhľad, doprava, platby, používatelia a fakturácia', vNastavenia],
  'pomoc': ['Potrebujete poradiť?', 'Návody krok za krokom: prečo daná funkcia existuje, ako ju použiť a čo sa stane potom', vPomoc],
};

// Osobný vzhľad obsluhy na backende (/admin/my-theme): rovnaký na každom zariadení, s revíziou a auditom.
const THEME_DEFAULT = { forest: '#203b32', gold: '#d5ba81' };
let THEME = null;
function applyTheme(t) {
  const st = document.documentElement.style;
  if (t && t.selection && t.selection.scheme === 'custom') { st.setProperty('--forest', t.selection.navigation); st.setProperty('--gold', t.selection.accent); }
  else { st.removeProperty('--forest'); st.removeProperty('--gold'); }
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
    <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap"><button class="btn gold" id="t-save">Uložiť motív</button><button class="btn ghost" id="t-reset">Obnoviť ANASTASIA</button></div>
  </div></div>`;
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
