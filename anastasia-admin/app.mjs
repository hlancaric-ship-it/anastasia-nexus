// ANASTASIA admin — vlastní SPA proti Medusa Admin API (NE Medusa /app).
// Vzhled dle backend/docs/wp/admin-design-preview.html. Slovensky. Theming tokeny v styles.css.
const API = (localStorage.getItem('ana_api') || 'http://localhost:9100').replace(/\/+$/, '');
const root = document.getElementById('root');
const $ = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };
const fmtEur = (a) => (a == null ? '—' : new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'eur' }).format(Number(a)));
const fmtDate = (d) => d ? new Date(d).toLocaleString('sk-SK', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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

// --- navigácia (všetky agendy z ADMIN-FUNKCE-A-POKRYTI) ---
const NAV = [
  { group: 'Prehľad', items: [['', 'Prehľad', '']] },
  { group: 'Obchod', items: [['produkty', 'Produkty', ''], ['kategorie', 'Kategórie', ''], ['objednavky', 'Objednávky', ''], ['zakaznicky', 'Zákazníčky', '']] },
  { group: 'Marketing', items: [['kupony', 'Kupóny & QR', ''], ['vouchery', 'Vouchery', ''], ['klub', 'Klub / Členstvo', 'čaká']] },
  { group: 'Služby', items: [['booking', 'Rezervácie', ''], ['chat', 'Chat', '']] },
  { group: 'Obsah', items: [['media', 'Médiá', 'čaká'], ['cms', 'CMS / Stránky', 'čaká'], ['preklady', 'Preklady', 'čaká']] },
  { group: 'Prevádzka', items: [['feed', 'Feed / Nákupčí', 'čaká'], ['uctovnictvo', 'Účtovníctvo / Faktúry', 'čaká'], ['pripojenia', 'Nastavenia / Pripojenia', 'čaká'], ['vzhlad', 'Vzhľad administrácie', '']] },
];

function shell(active, title, sub) {
  const nav = NAV.map(g => `<div class="nav-title">${g.group}</div>` + g.items.map(([k, label, soon]) =>
    `<a class="nav-item ${active === k ? 'active' : ''}" href="#/${k}">${esc(label)}${soon ? `<span class="soon">${soon}</span>` : ''}</a>`).join('')).join('');
  return `<div class="app">
    <aside class="sidebar">
      <div class="brand"><div class="logo">A</div><div><b>ANASTASIA</b><small>LIGHT FOR THE FUTURE</small></div></div>
      ${nav}
      <div class="sidebar-bottom">Prihlásená obsluha<button id="logout">Odhlásiť sa</button></div>
    </aside>
    <main class="main">
      <div class="topbar"><div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div><div id="actions"></div></div>
      <div id="view"></div>
    </main>
  </div>`;
}

// --- views ---
async function vDashboard(view) {
  view.innerHTML = '<div class="muted">Načítavam…</div>';
  const safe = async (p) => { try { return (await api(p + '?limit=1')).count ?? 0; } catch { return '—'; } };
  const [prod, ord, cust, cat, promo] = await Promise.all(['/admin/products', '/admin/orders', '/admin/customers', '/admin/product-categories', '/admin/promotions'].map(safe));
  view.innerHTML = `<div class="kpis">
    ${[['Produkty', prod], ['Objednávky', ord], ['Zákazníčky', cust], ['Kategórie', cat]].map(([l, n]) => `<div class="kpi"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('')}
  </div>
  <div class="card"><div class="card-h">Vitajte v administrácii ANASTASIA</div><div class="card-b">
    <p class="muted">Vlastná administrácia napojená na jedno jadro (Medusa Admin API na <b>${esc(API)}</b>). Vľavo sú všetky agendy; označené „čaká" sa dopĺňajú na strane backendu.</p>
    <p class="muted">Kupóny (promo): ${promo}. Platby a prístupy členstva riadi jadro, nie táto obrazovka.</p>
  </div></div>`;
}

function listView(view, { endpoint, cols, rows, title, onRow, empty }) {
  view.innerHTML = `<div class="card"><div class="card-h">${esc(title)}<span class="muted" style="font-weight:400">${rows.length} záznamov</span></div>
    <table><thead><tr>${cols.map(c => `<th>${esc(c.h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.map((r, i) => `<tr data-i="${i}">${cols.map(c => `<td>${c.v(r)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length}" class="muted">${esc(empty || 'Žiadne záznamy.')}</td></tr>`}</tbody></table></div>`;
  if (onRow) view.querySelectorAll('tbody tr[data-i]').forEach(tr => tr.onclick = () => onRow(rows[+tr.dataset.i]));
}

async function vProducts(view) {
  view.innerHTML = '<div class="muted">Načítavam produkty…</div>';
  const { products } = await api('/admin/products?limit=100&fields=id,title,status,handle,*variants.prices');
  listView(view, {
    title: 'Produkty', rows: products,
    cols: [
      { h: 'Názov', v: p => esc(p.title) },
      { h: 'Stav', v: p => `<span class="pill ${p.status === 'published' ? 'ok' : 'warn'}">${esc(p.status)}</span>` },
      { h: 'Cena', v: p => { const pr = p.variants?.[0]?.prices?.find(x => x.currency_code === 'eur'); return fmtEur(pr?.amount); } },
      { h: 'Varianty', v: p => (p.variants?.length || 0) },
    ],
    onRow: p => vProductDetail(view, p.id),
  });
}
async function vProductDetail(view, id) {
  view.innerHTML = '<div class="muted">Načítavam…</div>';
  const { product: p } = await api(`/admin/products/${id}?fields=id,title,status,description,*variants.prices`);
  const variant = p.variants?.[0]; const price = variant?.prices?.find(x => x.currency_code === 'eur');
  view.innerHTML = `<div class="card"><div class="card-h">Úprava produktu<a class="btn ghost" href="#/produkty">Späť</a></div><div class="card-b">
    <div id="pmsg"></div>
    <label>Názov</label><input id="p-title" value="${esc(p.title)}">
    <div class="row"><div><label>Stav</label><select id="p-status"><option value="published"${p.status === 'published' ? ' selected' : ''}>published</option><option value="draft"${p.status === 'draft' ? ' selected' : ''}>draft</option></select></div>
    <div><label>Cena (EUR)${variant ? '' : ' — produkt nemá variant'}</label><input id="p-price" type="number" step="0.01" value="${price?.amount ?? ''}" ${variant ? '' : 'disabled'}></div></div>
    <label>Popis</label><textarea id="p-desc" rows="4">${esc(p.description || '')}</textarea>
    <div style="margin-top:16px;display:flex;gap:10px"><button class="btn gold" id="p-save">Uložiť</button></div>
  </div></div>`;
  view.querySelector('#p-save').onclick = async () => {
    const msg = view.querySelector('#pmsg'); msg.innerHTML = '';
    try {
      await api(`/admin/products/${id}`, { method: 'POST', body: { title: view.querySelector('#p-title').value, status: view.querySelector('#p-status').value, description: view.querySelector('#p-desc').value } });
      const np = view.querySelector('#p-price').value;
      if (variant && np !== '' && Number(np) !== price?.amount) {
        await api(`/admin/products/${id}/variants/${variant.id}`, { method: 'POST', body: { prices: [{ amount: Number(np), currency_code: 'eur' }] } });
      }
      msg.innerHTML = '<div class="notice">Uložené. <a href="#/produkty">Späť na zoznam</a></div>';
    } catch (e) { msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
}
async function vCategories(view) {
  const { product_categories } = await api('/admin/product-categories?limit=100&fields=id,name,handle,is_active');
  listView(view, { title: 'Kategórie', rows: product_categories, cols: [
    { h: 'Názov', v: c => esc(c.name) }, { h: 'Handle', v: c => `<span class="muted">${esc(c.handle)}</span>` },
    { h: 'Aktívna', v: c => c.is_active ? '<span class="pill ok">áno</span>' : '<span class="pill off">nie</span>' }] });
}
async function vOrders(view) {
  const { orders } = await api('/admin/orders?limit=50&fields=id,display_id,email,status,total,currency_code,created_at');
  listView(view, { title: 'Objednávky', rows: orders, cols: [
    { h: 'Č.', v: o => '#' + (o.display_id ?? '') }, { h: 'E-mail', v: o => esc(o.email) },
    { h: 'Stav', v: o => `<span class="pill">${esc(o.status)}</span>` }, { h: 'Suma', v: o => fmtEur(o.total) },
    { h: 'Dátum', v: o => fmtDate(o.created_at) }] });
}
async function vCustomers(view) {
  const { customers } = await api('/admin/customers?limit=100&fields=id,email,first_name,last_name,has_account,created_at');
  listView(view, { title: 'Zákazníčky', rows: customers, cols: [
    { h: 'E-mail', v: c => esc(c.email) }, { h: 'Meno', v: c => esc([c.first_name, c.last_name].filter(Boolean).join(' ')) },
    { h: 'Účet', v: c => c.has_account ? '<span class="pill ok">áno</span>' : '<span class="pill warn">hosť</span>' },
    { h: 'Registrácia', v: c => fmtDate(c.created_at) }] });
}
async function vCoupons(view) {
  const { promotions } = await api('/admin/promotions?limit=100&fields=id,code,status,*application_method');
  listView(view, { title: 'Kupóny & QR', rows: promotions, empty: 'Zatiaľ žiadne kupóny. QR generátor pridáva kupóny cez jadro.', cols: [
    { h: 'Kód', v: p => `<b>${esc(p.code)}</b>` }, { h: 'Stav', v: p => `<span class="pill ${p.status === 'active' ? 'ok' : 'warn'}">${esc(p.status)}</span>` },
    { h: 'Zľava', v: p => { const m = p.application_method; return m ? (m.type === 'percentage' ? m.value + ' %' : fmtEur(m.value)) : '—'; } }] });
}
// agendy skúšajúce endpoint, inak „čaká na backend"
async function tryList(view, { title, endpoint, key, cols, note }) {
  view.innerHTML = '<div class="muted">Načítavam…</div>';
  try {
    const d = await api(endpoint);
    const rows = d[key] || d.items || [];
    listView(view, { title, rows, cols });
  } catch (e) {
    view.innerHTML = `<div class="notice"><b>Čaká na backend.</b> ${esc(note)}<br><span class="muted">Endpoint ${esc(endpoint)} zatiaľ nie je dostupný (${esc(e.message)}). UI je pripravené, napojí sa po dodaní API.</span></div>`;
  }
}
function stub(view, title, note) {
  view.innerHTML = `<div class="notice"><b>Čaká na backend.</b> ${esc(note)}<br><span class="muted">Obrazovka „${esc(title)}" je v návrhu ANASTASIA vzhľadu; napojí sa, keď bude hotový príslušný backend/endpoint.</span></div>`;
}

const ROUTES = {
  '': ['Prehľad', 'Jedno jadro, jedna administrácia', vDashboard],
  'produkty': ['Produkty', 'Katalóg, ceny, stav', vProducts],
  'kategorie': ['Kategórie', 'Stromy a zaradenie', vCategories],
  'objednavky': ['Objednávky', 'Prehľad objednávok', vOrders],
  'zakaznicky': ['Zákazníčky', 'Účty a história', vCustomers],
  'kupony': ['Kupóny & QR', 'Zľavové kódy a QR kampane', vCoupons],
  'vouchery': ['Vouchery', 'Darčekové poukazy', (v) => tryList(v, { title: 'Vouchery', endpoint: '/admin/vouchers', key: 'vouchers', cols: [{ h: 'Kód', v: x => esc(x.code || x.id) }, { h: 'Zostatok', v: x => fmtEur((x.current_balance_minor ?? 0) / 100) }, { h: 'Stav', v: x => esc(x.status || '') }], note: 'Poukazy beží v NEXUS jadre (D1).' })],
  'klub': ['Klub / Členstvo', 'Členstvá a prístupy', (v) => tryList(v, { title: 'Klub / Členstvo', endpoint: '/admin/memberships', key: 'memberships', cols: [{ h: 'Zákazníčka', v: x => esc(x.customer_id || '') }, { h: 'Stav', v: x => esc(x.status || '') }, { h: 'Platí do', v: x => fmtDate(x.current_period_end) }], note: 'Členstvo/predplatné sa dokončuje v jadre (Codex).' })],
  'booking': ['Rezervácie', 'Konzultácie a termíny', (v) => tryList(v, { title: 'Rezervácie', endpoint: '/admin/bookings', key: 'bookings', cols: [{ h: 'Zákazníčka', v: x => esc(x.customer_id || '') }, { h: 'Od', v: x => fmtDate(x.starts_at) }, { h: 'Stav', v: x => esc(x.status || '') }], note: 'Rezervačné jadro existuje; admin napojenie dolaďujeme.' })],
  'chat': ['Chat', 'Konverzácie so zákazníčkami', (v) => tryList(v, { title: 'Chat', endpoint: '/admin/chat/conversations', key: 'conversations', cols: [{ h: 'ID', v: x => esc(x.id) }, { h: 'Stav', v: x => esc(x.status || '') }], note: 'Chat modul je v jadre; admin výpis napojíme.' })],
  'media': ['Médiá', 'Chránené videá a audio', (v) => stub(v, 'Médiá', 'Správa chránených médií (R2) — Fáza 2.')],
  'cms': ['CMS / Stránky', 'Obsahové stránky webov', (v) => stub(v, 'CMS / Stránky', 'Samoobslužná správa stránok všetkých webov.')],
  'preklady': ['Preklady', 'SK / EN / RU', (v) => stub(v, 'Preklady', 'Správa prekladov (SK zdroj, EN/RU) z jedného admina.')],
  'feed': ['Feed / Nákupčí', 'Napojenie dodávateľského feedu', (v) => stub(v, 'Feed / Nákupčí', 'Import feedu a nákupčí.')],
  'uctovnictvo': ['Účtovníctvo / Faktúry', 'POHODA / Money S3', (v) => stub(v, 'Účtovníctvo / Faktúry', 'Napojenie účtovníctva a fakturácie.')],
  'pripojenia': ['Nastavenia / Pripojenia', 'API služby (Stripe, ComGate, dopravcovia…)', (v) => stub(v, 'Nastavenia / Pripojenia', 'Samoobslužné vloženie/overenie/aktivácia API kľúčov služieb bez programátora.')],
  'vzhlad': ['Vzhľad administrácie', 'Osobný motív obsluhy', vAppearance],
};

function vAppearance(view) {
  const saved = JSON.parse(localStorage.getItem('ana_admin_theme') || '{}');
  view.innerHTML = `<div class="card"><div class="card-h">Vzhľad administrácie</div><div class="card-b">
    <p class="muted">Výchozí je zelený motív ANASTASIA. Tu si obsluha môže zvoliť vlastné farby (uloží sa len jej, v tomto prehliadači).</p>
    <div class="row">
      <div><label>Hlavná (sidebar)</label><input type="color" id="t-forest" value="${saved.forest || '#203b32'}"></div>
      <div><label>Akcent (zlatá)</label><input type="color" id="t-gold" value="${saved.gold || '#d5ba81'}"></div>
    </div>
    <div style="margin-top:16px;display:flex;gap:10px"><button class="btn gold" id="t-save">Uložiť motív</button><button class="btn ghost" id="t-reset">Obnoviť ANASTASIA</button></div>
  </div></div>`;
  const apply = (f, g) => { document.documentElement.style.setProperty('--forest', f); document.documentElement.style.setProperty('--gold', g); };
  view.querySelector('#t-save').onclick = () => { const f = view.querySelector('#t-forest').value, g = view.querySelector('#t-gold').value; localStorage.setItem('ana_admin_theme', JSON.stringify({ forest: f, gold: g })); apply(f, g); };
  view.querySelector('#t-reset').onclick = () => { localStorage.removeItem('ana_admin_theme'); document.documentElement.style.removeProperty('--forest'); document.documentElement.style.removeProperty('--gold'); view.querySelector('#t-forest').value = '#203b32'; view.querySelector('#t-gold').value = '#d5ba81'; };
}
function applySavedTheme() { try { const t = JSON.parse(localStorage.getItem('ana_admin_theme') || '{}'); if (t.forest) document.documentElement.style.setProperty('--forest', t.forest); if (t.gold) document.documentElement.style.setProperty('--gold', t.gold); } catch {} }

// --- router ---
async function route() {
  if (!token) return renderLogin();
  const key = (location.hash.replace(/^#\/?/, '') || '').split('/')[0];
  const r = ROUTES[key] || ROUTES[''];
  root.innerHTML = shell(key in ROUTES ? key : '', r[0], r[1]);
  applySavedTheme();
  root.querySelector('#logout').onclick = () => { token = ''; localStorage.removeItem('ana_token'); renderLogin(); };
  const view = root.querySelector('#view');
  try { await r[2](view); } catch (e) { if (e.message !== '401') view.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}
function renderLogin(msg) {
  root.innerHTML = `<div class="login"><form class="box" id="lf">
    <h1>ANASTASIA</h1><p>Administrácia — prihlásenie</p>
    ${msg ? `<div class="err">${esc(msg)}</div>` : ''}
    <label>E-mail</label><input id="l-email" type="email" value="admin@anastasia.local" autocomplete="username">
    <label>Heslo</label><input id="l-pass" type="password" autocomplete="current-password">
    <button class="btn gold" type="submit">Prihlásiť sa</button>
    <p class="muted" style="margin-top:14px;font-size:11px">Jadro: ${esc(API)}</p>
  </form></div>`;
  root.querySelector('#lf').onsubmit = async (e) => {
    e.preventDefault();
    try { await login(root.querySelector('#l-email').value, root.querySelector('#l-pass').value); location.hash = '#/'; route(); }
    catch (err) { renderLogin(err.message); }
  };
}
window.addEventListener('hashchange', route);
route();
