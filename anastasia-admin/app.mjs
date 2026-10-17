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

// --- ikony menu (tenké line SVG, štýl predlohy) ---
const ICONS = {
  home: '<path d="M3 11.5 12 4l9 7.5M5 10v10h5v-6h4v6h5V10"/>',
  bag: '<path d="M6 7h12l1 13H5L6 7Z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/>',
  box: '<path d="M12 3 3 7.5V16l9 4.5 9-4.5V7.5L12 3Z"/><path d="M3 7.5 12 12l9-4.5M12 12v8.5"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.2a3 3 0 0 1 0 5.6M20.5 20a5.5 5.5 0 0 0-4-5.3"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 3v4M16 3v4"/>',
  chat: '<path d="M4 5h16v11H9l-5 4V5Z"/>',
  gift: '<rect x="3" y="8.5" width="18" height="11.5" rx="1"/><path d="M3 13h18M12 8.5V20M12 8.5S10.5 4 8 4.8 9 8.5 12 8.5Zm0 0s1.5-4.5 4-3.7S15 8.5 12 8.5Z"/>',
  doc: '<path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v4h4M9 13h6M9 17h5"/>',
  cog: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8L12 3.5Z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.4 2.4 0 0 1 4 1.7c0 1.5-2 1.8-2 3.3"/><circle cx="11.6" cy="17" r=".6"/>',
};
const navIcon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

// --- navigácia (štruktúra podľa schváleného návrhu admin-design-overview) ---
// ready:false = agenda je v admine, ale čaká na jadro → skrytá, kým sa nenapojí.
const NAV = [
  { k: '', label: 'Prehľad', icon: 'home', ready: true },
  { k: 'objednavky', label: 'Objednávky', icon: 'bag', ready: true, badge: 'orders' },
  { k: 'produkty', label: 'Produkty', icon: 'box', ready: true },
  { k: 'zakaznicky', label: 'Zákazníčky', icon: 'users', ready: true },
  { k: 'konzultacie', label: 'Konzultácie', icon: 'cal', ready: true },
  { k: 'spravy', label: 'Správy', icon: 'chat', ready: true },
  { k: 'klub', label: 'Klub', icon: 'star', ready: true },
  { k: 'poukazy', label: 'Poukazy a zľavy', icon: 'gift', ready: true },
  { k: 'obsah', label: 'Obsah a e-maily', icon: 'doc', ready: true },
];
let BADGES = {};

function shell(active, title, sub) {
  const item = (n) => `<a class="nav-item ${active === n.k ? 'active' : ''}" href="#/${n.k}">${navIcon(n.icon)}<span>${esc(n.label)}</span>${n.badge ? `<b class="badge" data-badge="${n.badge}" ${BADGES[n.badge] ? '' : 'hidden'}>${BADGES[n.badge] || ''}</b>` : ''}</a>`;
  const nav = NAV.filter(n => n.ready).map(item).join('');
  return `<div class="app">
    <aside class="sidebar">
      <div class="brand"><div class="logo">A</div><div><b>ANASTASIA</b><small>PRIESTOR PRE VAŠU PRÁCU</small></div></div>
      <div class="nav-title">Váš obchod</div>
      <nav class="nav">${nav}</nav>
      <div class="sidebar-bottom">
        <a class="nav-item ${active === 'nastavenia' ? 'active' : ''}" href="#/nastavenia">${navIcon('cog')}<span>Nastavenia</span></a>
        <a class="nav-item" href="#/pomoc">${navIcon('help')}<span>Potrebujete poradiť?</span></a>
        <div class="user"><div class="ava" id="uava">LR</div><div><b id="uname">Váš účet</b><small>Váš pracovný priestor</small></div><button id="logout" title="Odhlásiť sa">×</button></div>
      </div>
    </aside>
    <main class="main"><div class="wrap">
      ${title ? `<div class="topbar"><div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div><div id="actions"></div></div>` : '<div class="topbar bare"><div></div><div id="actions"></div></div>'}
      <div id="view"></div>
    </div></main>
  </div>`;
}

// --- aktuálne prihlásená obsluha (pre pozdrav + avatar) ---
let ME = null;
async function loadMe() { if (ME) return ME; try { ME = (await api('/admin/users/me?fields=id,first_name,last_name,email')).user || null; } catch { ME = null; } return ME; }
function meName() { const m = ME || {}; return (m.first_name || (m.email ? m.email.split('@')[0] : '') || '').trim(); }
function setUserChip() {
  const name = meName(); const nm = document.querySelector('#uname'); const av = document.querySelector('#uava');
  if (nm) nm.textContent = name || 'Váš účet';
  if (av) av.textContent = (name ? name.slice(0, 2) : 'A').toUpperCase();
}

// --- views ---
async function vDashboard(view) {
  view.innerHTML = '<div class="muted">Načítavam…</div>';
  setActions('<a class="btn wine" href="#/produkty">+ Pridať produkt</a>');
  const safeCount = async (p) => { try { return (await api(p)).count; } catch { return null; } };
  await loadMe(); setUserChip();
  const today = new Date();
  const [toFulfill, ordTotal, msgs, consults, readiness] = await Promise.all([
    safeCount('/admin/orders?fulfillment_status[]=not_fulfilled&limit=1'),
    safeCount('/admin/orders?limit=1'),
    safeCount('/admin/chat/conversations?status=open&limit=1'),
    safeCount('/admin/bookings?limit=1'),
    api('/admin/readiness').catch(e => { if (e.message === '401') throw e; return null; }),
  ]);
  const naVybavenie = toFulfill != null ? toFulfill : (ordTotal != null ? ordTotal : '—');
  const dnes = today.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' });
  const greet = `Dobrý deň${meName() ? ', ' + esc(meName()) : ''}.`;
  const kpi = (l, n, sub) => `<div class="kpi"><div class="kpi-l">${l}</div><div class="n">${n}</div><div class="kpi-s">${sub}</div></div>`;
  const tasks = [];
  if (typeof naVybavenie === 'number' && naVybavenie > 0) tasks.push(['Pripravte objednávky na odoslanie', `${naVybavenie} ${naVybavenie === 1 ? 'objednávka čaká' : 'objednávky čakajú'} na vybavenie.`, 'Pozrieť objednávky', '#/objednavky']);
  if (typeof msgs === 'number' && msgs > 0) tasks.push(['Odpovedzte zákazníčkam', `${msgs} ${msgs === 1 ? 'nová správa' : 'nové správy'} čaká na odpoveď.`, 'Prečítať správy', '#/spravy']);
  view.innerHTML = `
  <div class="hero"><div><div class="eyebrow">${esc(dnes)}</div><h1 class="hello">${greet}</h1><p class="lead">Tu nájdete všetko, čo dnes potrebuje vašu pozornosť.</p></div></div>
  <div class="kpis3">
    ${kpi('Na vybavenie', naVybavenie, typeof naVybavenie === 'number' ? (naVybavenie === 1 ? 'objednávka čaká na vás' : 'objednávky čakajú na vás') : 'napojené na jadro')}
    ${kpi('Nové správy', msgs != null ? msgs : '—', msgs != null ? 'zákazníčky čakajú na odpoveď' : 'chat sa napája')}
    ${kpi('Dnešné konzultácie', consults != null ? consults : '—', consults != null ? 'rezervácie na dnes' : 'rezervácie sa napájajú')}
  </div>
  ${readinessCard(readiness)}
  <div class="dash-cols">
    <div class="card"><div class="card-h">Čomu sa venovať</div><div class="card-b">
      ${tasks.length ? tasks.map(([t, d, cta, href]) => `<div class="task"><div><b>${t}</b><p class="muted">${esc(d)}</p></div><a href="${href}">${cta} →</a></div>`).join('') : '<p class="muted">Všetko máte vybavené. Nič nečaká na vašu pozornosť. ✓</p>'}
    </div></div>
    <div class="card soft-card"><div class="card-b">
      <p style="font-weight:600;margin:0 0 6px">Všetko si nastavíte tu.</p>
      <p class="muted" style="margin:0 0 12px">Ceny, poukazy aj texty e-mailov. Pri každom nastavení vysvetlíme, čo zmena ovplyvní.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn ghost" href="#/poukazy">Nastaviť poukazy</a><a class="btn ghost" href="#/nastavenia">Otvoriť nastavenia →</a></div>
    </div></div>
  </div>`;
}

// Pripravenosť obchodu: len z GET /admin/readiness (reálne dáta jadra). Čo sa nedá overiť, nikdy nevydávame za hotové.
function readinessCard(r) {
  if (!r || !Array.isArray(r.checks)) return `<div class="card" style="margin-bottom:18px"><div class="card-h">Pripravenosť obchodu</div><div class="card-b"><p class="muted" style="margin:0">Pripravenosť sa teraz nedá overiť. Skúste obnoviť stránku.</p></div></div>`;
  const open = r.checks.filter(c => c.status !== 'ok').sort((a, b) => (a.status === 'unknown') - (b.status === 'unknown') || (a.severity === 'blocker' ? -1 : 1) - (b.severity === 'blocker' ? -1 : 1));
  const ok = r.checks.length - open.length;
  const pill = (c) => c.status === 'unknown' ? '<span class="pill off">nedá sa overiť</span>' : c.severity === 'blocker' ? '<span class="pill off">bráni predaju</span>' : '<span class="pill warn">odporúčame doplniť</span>';
  const head = r.summary.blockers ? `${r.summary.blockers} ${r.summary.blockers === 1 ? 'vec bráni' : 'veci bránia'} predaju` : open.length ? 'Predaj je možný, niečo ešte odporúčame doplniť' : 'Obchod je pripravený na predaj ✓';
  return `<div class="card" style="margin-bottom:18px"><div class="card-h">Pripravenosť obchodu <span class="muted" style="font-weight:400;font-size:12px">${ok} z ${r.checks.length} v poriadku</span></div><div class="card-b">
    <p style="font-weight:600;margin:0 0 10px">${esc(head)}</p>
    ${open.map(c => `<div class="task"><div><b>${esc(c.title)}</b> ${pill(c)}${c.count > 1 ? ` <span class="muted">(${c.count})</span>` : ''}<p class="muted">${esc(c.hint)}</p></div><a href="${esc(c.href)}">Vyriešiť →</a></div>`).join('')}
  </div></div>`;
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

function setActions(html) { const a = document.querySelector('#actions'); if (a) a.innerHTML = html || ''; }

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
  view.innerHTML = '<div class="muted">Načítavam produkty…</div>';
  setActions('<button class="btn wine" id="p-new">+ Pridať produkt</button>');
  const nb = document.querySelector('#p-new'); if (nb) nb.onclick = () => vProductNew(view);
  const { products } = await api('/admin/products?limit=100&fields=id,title,status,handle,thumbnail,metadata,*variants.prices');
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
async function vProductNew(view) {
  view.innerHTML = `<div class="card"><div class="card-h">Nový produkt<button class="btn ghost" id="pn-back">Späť</button></div><div class="card-b">
    <div id="pnmsg"></div>
    <label>Názov</label><input id="pn-title" placeholder="napr. Konzultačný balík">
    <div class="row"><div><label>Cena (EUR)</label><input id="pn-price" type="number" step="0.01" placeholder="0.00"></div>
    <div><label>Stav</label><select id="pn-status"><option value="draft">Koncept</option><option value="published">Zverejnený</option></select></div></div>
    <div style="margin-top:16px"><button class="btn gold" id="pn-save">Vytvoriť produkt</button></div>
    <p class="muted" style="margin-top:10px;font-size:12px">Produkt vznikne s jedným variantom a cenou v EUR. Ďalšie detaily (popis, kategórie, akcia) doplníte v úprave.</p>
  </div></div>`;
  view.querySelector('#pn-back').onclick = () => vProducts(view);
  view.querySelector('#pn-save').onclick = async () => {
    const msg = view.querySelector('#pnmsg'); msg.innerHTML = '';
    const title = view.querySelector('#pn-title').value.trim();
    const amount = Number(view.querySelector('#pn-price').value);
    const status = view.querySelector('#pn-status').value;
    if (!title) { msg.innerHTML = '<div class="err">Zadajte názov produktu.</div>'; return; }
    const btn = view.querySelector('#pn-save'); btn.disabled = true;
    try {
      const body = { title, status, options: [{ title: 'Variant', values: ['Štandard'] }],
        variants: [{ title: 'Štandard', options: { Variant: 'Štandard' }, prices: amount > 0 ? [{ amount, currency_code: 'eur' }] : [] }] };
      const { product } = await api('/admin/products', { method: 'POST', body });
      vProductDetail(view, product.id);
    } catch (e) { btn.disabled = false; msg.innerHTML = `<div class="err">Jadro odmietlo: ${esc(e.message)}</div>`; }
  };
}
async function vProductDetail(view, id) {
  view.innerHTML = '<div class="muted">Načítavam…</div>';
  const { product: p } = await api(`/admin/products/${id}?fields=id,title,status,description,metadata,*variants.prices,*categories`);
  const variant = p.variants?.[0]; const price = basePrice(variant);
  let cats = []; try { cats = (await api('/admin/product-categories?limit=200&fields=id,name')).product_categories || []; } catch {}
  const inC = new Set((p.categories || []).map(c => c.id));
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
  const kategorie = `<div>${cats.map(c => `<label style="display:inline-flex;gap:6px;margin:4px 12px 4px 0;align-items:center"><input type="checkbox" data-c="${c.id}" ${inC.has(c.id) ? 'checked' : ''} style="width:auto"> ${esc(c.name)}</label>`).join('') || '<span class="muted">Žiadne kategórie.</span>'}</div>`;
  const popis = wysiwygHtml('p-desc', p.description || '');
  view.innerHTML = `<div class="card"><div class="card-h">Úprava produktu<button class="btn ghost" id="p-back">Späť</button></div><div class="card-b">
    <div id="pmsg"></div>
    ${tabsHtml([{ id: 'z', label: 'Základné', html: zakladne }, { id: 'c', label: 'Cena a akcia', html: cena }, { id: 'k', label: 'Kategórie', html: kategorie }, { id: 'd', label: 'Popis', html: popis }])}
    <div style="margin-top:16px;display:flex;gap:10px"><button class="btn gold" id="p-save">Uložiť</button></div>
  </div></div>`;
  wireTabs(view); wireWysiwyg(view);
  view.querySelector('#p-back').onclick = () => vProducts(view);
  const box = view.querySelector('#p-sale-box');
  view.querySelector('#p-sale-on').onchange = (e) => box.classList.toggle('hidden', !e.target.checked);
  view.querySelector('#p-save').onclick = async () => {
    const msg = view.querySelector('#pmsg'); msg.innerHTML = ''; const btn = view.querySelector('#p-save'); btn.disabled = true;
    try {
      const chosen = [...view.querySelectorAll('[data-c]')].filter(cb => cb.checked).map(cb => ({ id: cb.dataset.c }));
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
      await api(`/admin/products/${id}`, { method: 'POST', body: { title: view.querySelector('#p-title').value, status: view.querySelector('#p-status').value, description: desc, categories: chosen, metadata } });
      msg.innerHTML = '<div class="notice">Uložené.</div>';
      setTimeout(() => vProductDetail(view, id), 700);
    } catch (e) { msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    finally { btn.disabled = false; }
  };
}
async function vCategories(view) {
  const { product_categories } = await api('/admin/product-categories?limit=200&fields=id,name,handle,is_active,parent_category_id');
  setActions('<button class="btn gold" id="cat-new">+ Nová kategória</button>');
  const nb = document.querySelector('#cat-new'); if (nb) nb.onclick = () => vCategoryDetail(view, null);
  listView(view, { title: 'Kategórie', rows: product_categories, onRow: c => vCategoryDetail(view, c.id), cols: [
    { h: 'Názov', v: c => esc(c.name) }, { h: 'Handle', v: c => `<span class="muted">${esc(c.handle)}</span>` },
    { h: 'Nadradená', v: c => c.parent_category_id ? '<span class="muted">áno</span>' : '—' },
    { h: 'Aktívna', v: c => c.is_active ? '<span class="pill ok">áno</span>' : '<span class="pill off">nie</span>' }] });
}
async function vCategoryDetail(view, id) {
  view.innerHTML = '<div class="muted">Načítavam…</div>';
  let c = { name: '', handle: '', is_active: true };
  if (id) { const r = await api(`/admin/product-categories/${id}?fields=id,name,handle,is_active`); c = r.product_category; }
  view.innerHTML = `<div class="card"><div class="card-h">${id ? 'Úprava kategórie' : 'Nová kategória'}<button class="btn ghost" id="c-back">Späť</button></div><div class="card-b">
    <div id="cmsg"></div>
    <label>Názov</label><input id="c-name" value="${esc(c.name)}">
    <label>Handle (URL)</label><input id="c-handle" value="${esc(c.handle || '')}" placeholder="napr. bio-kozmetika">
    <label style="display:flex;gap:8px;align-items:center;margin-top:12px"><input type="checkbox" id="c-active" ${c.is_active !== false ? 'checked' : ''} style="width:auto"> Aktívna</label>
    <div style="margin-top:16px"><button class="btn gold" id="c-save">Uložiť</button></div>
  </div></div>`;
  view.querySelector('#c-back').onclick = () => vCategories(view);
  view.querySelector('#c-save').onclick = async () => {
    const msg = view.querySelector('#cmsg'); msg.innerHTML = '';
    const body = { name: view.querySelector('#c-name').value, is_active: view.querySelector('#c-active').checked };
    const h = view.querySelector('#c-handle').value.trim(); if (h) body.handle = h;
    try { await api(id ? `/admin/product-categories/${id}` : '/admin/product-categories', { method: 'POST', body }); await vCategories(view); }
    catch (e) { msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
}
async function vOrders(view) {
  const { orders } = await api('/admin/orders?limit=50&fields=id,display_id,email,status,total,currency_code,created_at,payment_status,fulfillment_status');
  const payPill = (s) => `<span class="pill ${s === 'captured' || s === 'paid' ? 'ok' : s === 'not_paid' || s === 'canceled' ? 'off' : 'warn'}">${esc(s || '—')}</span>`;
  const fulPill = (s) => `<span class="pill ${s === 'fulfilled' || s === 'shipped' || s === 'delivered' ? 'ok' : 'warn'}">${esc(s || 'nevybavená')}</span>`;
  listView(view, { title: 'Objednávky', rows: orders, onRow: o => vOrderDetail(view, o.id), empty: 'Zatiaľ žiadne objednávky.',
    card: o => `<div class="rc-body"><div class="rc-title">#${esc(o.display_id ?? '')} · ${fmtEur(o.total)}</div><div class="rc-fields">
      <span class="rc-f"><em>Zákazníčka</em>${esc(o.email || '—')}</span>
      <span class="rc-f"><em>Platba</em>${payPill(o.payment_status)}</span>
      <span class="rc-f"><em>Vybavenie</em>${fulPill(o.fulfillment_status)}</span>
      <span class="rc-f"><em>Dátum</em>${fmtDate(o.created_at)}</span></div></div>` });
}
// Akcie objednávky cez natívne Admin API jadra (spúšťajú existujúce subscribery: e-maily, prístupy, kompenzácie).
// Každá zmena má potvrdenie; sumy a stavy overuje jadro, SPA len ponúka to, čo dáva zmysel.
const ORDER_FIELDS = 'id,display_id,email,status,total,currency_code,created_at,payment_status,fulfillment_status,*items,*items.detail,*fulfillments,*fulfillments.items,*fulfillments.labels,*payment_collections,*payment_collections.payments,*payment_collections.payments.refunds,*payment_collections.payments.captures,*shipping_address,*shipping_methods';
const PAY_LABEL = { captured: 'zaplatená', authorized: 'autorizovaná (čaká na prijatie)', partially_refunded: 'čiastočne vrátená', refunded: 'vrátená', not_paid: 'nezaplatená', awaiting: 'čaká na platbu', canceled: 'zrušená', partially_captured: 'čiastočne zaplatená', requires_action: 'čaká na overenie' };
const FUL_LABEL = { not_fulfilled: 'nevybavená', fulfilled: 'pripravená na odoslanie', partially_fulfilled: 'čiastočne pripravená', shipped: 'odoslaná', partially_shipped: 'čiastočne odoslaná', delivered: 'doručená', canceled: 'zrušená' };
const sum = (arr, k = 'amount') => (arr || []).reduce((a, x) => a + Number(x?.[k] || 0), 0);
async function vOrderDetail(view, id, notice) {
  view.innerHTML = '<div class="muted">Načítavam…</div>';
  const { order: o } = await api(`/admin/orders/${id}?fields=${encodeURIComponent(ORDER_FIELDS)}`);
  const items = o.items || [];
  const toFulfill = items.map(it => ({ id: it.id, title: it.title || it.product_title || '', quantity: Number(it.quantity) - Number(it.detail?.fulfilled_quantity || 0) })).filter(x => x.quantity > 0);
  const fulfillments = (o.fulfillments || []).filter(f => !f.canceled_at);
  const payments = (o.payment_collections || []).flatMap(pc => pc.payments || []).filter(p => !p.canceled_at);
  const canceled = o.status === 'canceled';
  const anyShipped = fulfillments.some(f => f.shipped_at);
  const a = (o.shipping_address || {});
  const addr = [[a.first_name, a.last_name].filter(Boolean).join(' '), a.address_1, a.address_2, [a.postal_code, a.city].filter(Boolean).join(' '), (a.country_code || '').toUpperCase()].filter(Boolean).map(esc).join('<br>');
  const prehlad = `<div class="row"><div><label>E-mail</label><div>${esc(o.email)}</div></div><div><label>Dátum</label><div>${fmtDate(o.created_at)}</div></div></div>
    <div class="row"><div><label>Platba</label><div><span class="pill">${esc(PAY_LABEL[o.payment_status] || o.payment_status || '—')}</span></div></div>
    <div><label>Vybavenie</label><div><span class="pill">${esc(FUL_LABEL[o.fulfillment_status] || o.fulfillment_status || '—')}</span>${canceled ? ' <span class="pill off">objednávka zrušená</span>' : ''}</div></div></div>
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
  view.innerHTML = `<div class="card"><div class="card-h">Objednávka #${esc(o.display_id ?? '')}<button class="btn ghost" id="o-back">Späť</button></div><div class="card-b">
    <div id="omsg">${notice ? `<div class="notice">${esc(notice)}</div>` : ''}</div>
    ${tabsHtml([{ id: 'p', label: 'Prehľad', html: prehlad }, { id: 'i', label: 'Položky', html: polozky }, { id: 'o', label: 'Odoslanie', html: odoslanie }, { id: 'pl', label: 'Platby', html: platby }])}
    ${!canceled && !anyShipped ? '<div style="margin-top:18px;border-top:1px solid var(--line);padding-top:14px"><button class="btn ghost" id="o-cancel">Zrušiť objednávku</button></div>' : ''}
  </div></div>`;
  wireTabs(view);
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
  if (cb) cb.onclick = () => run(cb, 'Naozaj zrušiť celú objednávku? Zaplatené peniaze vráťte v záložke Platby.', () => api(`/admin/orders/${id}/cancel`, { method: 'POST', body: {} }), 'Objednávka je zrušená.');
}
async function vCustomers(view) {
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
  const { promotions } = await api('/admin/promotions?limit=100&fields=id,code,status,*application_method');
  setActions('<button class="btn gold" id="promo-new">+ Nový kupón</button>');
  const nb = document.querySelector('#promo-new'); if (nb) nb.onclick = () => vCouponNew(view);
  listView(view, { title: 'Kupóny & QR', rows: promotions, onRow: p => vCouponDetail(view, p.id), empty: 'Zatiaľ žiadne kupóny. QR generátor pridáva kupóny cez jadro.', cols: [
    { h: 'Kód', v: p => `<b>${esc(p.code)}</b>` }, { h: 'Stav', v: p => `<span class="pill ${p.status === 'active' ? 'ok' : 'warn'}">${esc(p.status)}</span>` },
    { h: 'Zľava', v: p => { const m = p.application_method; return m ? (m.type === 'percentage' ? m.value + ' %' : fmtEur(m.value)) : '—'; } }] });
}
async function vCouponNew(view) {
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
  setActions(`<div class="pills">${items.map((it, i) => `<button class="pill ${i === idx ? 'on' : ''}" data-i="${i}">${esc(it.label)}</button>`).join('')}</div>`);
  const a = document.querySelector('#actions');
  if (a) a.querySelectorAll('.pill').forEach(b => b.onclick = () => { if (+b.dataset.i !== idx) { items[+b.dataset.i].run(view); } });
  items[idx].run(view);
}
const vVouchers = (v) => tryList(v, { title: 'Darčekové poukazy', endpoint: '/admin/vouchers', key: 'vouchers', cols: [{ h: 'Kód', v: x => esc(x.code || x.id) }, { h: 'Zostatok', v: x => fmtEur((x.current_balance_minor ?? 0) / 100) }, { h: 'Stav', v: x => esc(x.status || '') }], note: 'Darčekové poukazy beria z NEXUS jadra (D1).' });
const vPoukazy = (view) => subnav(view, [{ label: 'Kupóny a zľavy', run: vCoupons }, { label: 'Darčekové poukazy', run: vVouchers }]);
const vKonzultacie = (v) => tryList(v, { title: 'Konzultácie', endpoint: '/admin/bookings', key: 'bookings', cols: [{ h: 'Zákazníčka', v: x => esc(x.customer_id || '') }, { h: 'Od', v: x => fmtDate(x.starts_at) }, { h: 'Stav', v: x => esc(x.status || '') }], note: 'Rezervačné jadro existuje; admin napojenie dolaďujeme.' });
const vSpravy = (v) => tryList(v, { title: 'Správy', endpoint: '/admin/chat/conversations', key: 'conversations', cols: [{ h: 'ID', v: x => esc(x.id) }, { h: 'Stav', v: x => esc(x.status || '') }], note: 'Chat modul je v jadre; admin výpis napojíme.' });
async function vEmaily(view) {
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
const vNastavenia = (view) => subnav(view, [
  { label: 'Vzhľad', run: vAppearance },
  { label: 'Pripojenia', run: (v) => stub(v, 'Pripojenia', 'Vloženie/overenie API kľúčov služieb (Stripe, ComGate, dopravcovia) bez programátora.') },
  { label: 'Účtovníctvo', run: (v) => stub(v, 'Účtovníctvo', 'Napojenie fakturácie (POHODA / Money S3).') },
]);
function vPomoc(view) {
  view.innerHTML = `<div class="card"><div class="card-h">Potrebujete poradiť?</div><div class="card-b">
    <p>Sme tu pre vás. Pri každom nastavení v administrácii nájdete krátke vysvetlenie, čo zmena ovplyvní.</p>
    <p class="muted">Technická podpora: <a href="mailto:podpora@l-code-dynamics.com">podpora@l-code-dynamics.com</a></p>
  </div></div>`;
}

async function vEntitlements(view) {
  view.innerHTML = '<div class="muted">Načítavam…</div>';
  const { entitlements } = await api('/admin/entitlements?limit=200');
  listView(view, {
    title: 'Prístupy a knižnica', rows: (entitlements || []), onRow: e => vEntitlementDetail(view, e),
    empty: 'Zatiaľ žiadne priradené prístupy. Pridelia sa automaticky po nákupe (jedna identita – všetky nákupy).',
    card: e => `<div class="rc-body"><div class="rc-title">${esc(e.product_title || e.product_id || 'Prístup')}</div><div class="rc-fields">
      <span class="rc-f"><em>Zákazníčka</em>${esc(e.customer_email || e.customer_id || '—')}</span>
      <span class="rc-f"><em>Stav</em><span class="pill ${e.status === 'active' ? 'ok' : 'off'}">${esc(e.status || '—')}</span></span>
      ${e.expires_at ? `<span class="rc-f"><em>Platí do</em>${fmtDate(e.expires_at)}</span>` : ''}</div></div>`,
  });
}
async function vEntitlementDetail(view, e) {
  view.innerHTML = `<div class="card"><div class="card-h">Prístup<button class="btn ghost" id="e-back">Späť</button></div><div class="card-b">
    <div id="emsg"></div>
    <div class="row"><div><label>Produkt</label><div>${esc(e.product_title || e.product_id || '—')}</div></div>
    <div><label>Zákazníčka</label><div>${esc(e.customer_email || e.customer_id || '—')}</div></div></div>
    <div class="row"><div><label>Stav</label><div><span class="pill ${e.status === 'active' ? 'ok' : 'off'}">${esc(e.status || '—')}</span></div></div>
    <div><label>Platí do</label><div>${e.expires_at ? fmtDate(e.expires_at) : 'trvalý'}</div></div></div>
    ${e.status === 'active' ? '<div style="margin-top:16px"><button class="btn ghost" id="e-revoke">Odobrať prístup</button></div>' : ''}
  </div></div>`;
  view.querySelector('#e-back').onclick = () => vEntitlements(view);
  const rb = view.querySelector('#e-revoke');
  if (rb) rb.onclick = async () => { const msg = view.querySelector('#emsg'); msg.innerHTML = '';
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
    try { const r = await api(`/admin/memberships/${encodeURIComponent(m.id)}/stop`, { method: 'POST', body: {} }); vKlubMember(view, { ...m, renew: r.membership.renew, status: r.membership.status, period_end: r.membership.period_end }, back); view.querySelector('#kmsg').innerHTML = '<div class="notice">Automatická obnova je zastavená.</div>'; }
    catch (e) { sb.disabled = false; msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
}
function vKlubProduct(view, p, back) {
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
      view.querySelector('#kmsg').innerHTML = '<div class="notice">Uložené.</div>';
    } catch (e) { sv.disabled = false; msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
}
function vKlubBilling(view, b, back) {
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
  'konzultacie': ['Konzultácie', 'Rezervácie a termíny', vKonzultacie],
  'spravy': ['Správy', 'Konverzácie so zákazníčkami', vSpravy],
  'klub': ['Klub ANASTASIA', 'Členky, nákupy členstva, podmienky a obnovy platieb', vKlub],
  'poukazy': ['Poukazy a zľavy', 'Kupóny, QR a darčekové poukazy', vPoukazy],
  'obsah': ['Obsah a e-maily', 'Stránky, texty, médiá a preklady', vObsah],
  'nastavenia': ['Nastavenia', 'Vzhľad, pripojenia a fakturácia', vNastavenia],
  'pomoc': ['Pomoc', 'Podpora a vysvetlenia', vPomoc],
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
  try { const c = (await api('/admin/orders?fulfillment_status[]=not_fulfilled&limit=1')).count; BADGES.orders = c || 0; } catch { return; }
  const el = document.querySelector('[data-badge="orders"]');
  if (el) { if (BADGES.orders > 0) { el.textContent = BADGES.orders; el.hidden = false; } else el.hidden = true; }
}

// --- router ---
async function route() {
  if (!token) return renderLogin();
  const key = (location.hash.replace(/^#\/?/, '') || '').split('/')[0];
  const r = ROUTES[key] || ROUTES[''];
  root.innerHTML = shell(key in ROUTES ? key : '', r[0], r[1]);
  loadTheme().then(applyTheme);
  root.querySelector('#logout').onclick = () => { token = ''; localStorage.removeItem('ana_token'); renderLogin(); };
  loadMe().then(setUserChip);
  refreshBadges();
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
