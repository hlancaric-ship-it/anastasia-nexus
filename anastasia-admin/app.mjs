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
  const [toFulfill, ordTotal, msgs, consults] = await Promise.all([
    safeCount('/admin/orders?fulfillment_status[]=not_fulfilled&limit=1'),
    safeCount('/admin/orders?limit=1'),
    safeCount('/admin/chat/conversations?status=open&limit=1'),
    safeCount('/admin/bookings?limit=1'),
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

function listView(view, { endpoint, cols, rows, title, onRow, empty }) {
  view.innerHTML = `<div class="card"><div class="card-h">${esc(title)}<span class="muted" style="font-weight:400">${rows.length} záznamov</span></div>
    <table><thead><tr>${cols.map(c => `<th>${esc(c.h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.map((r, i) => `<tr data-i="${i}">${cols.map(c => `<td>${c.v(r)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length}" class="muted">${esc(empty || 'Žiadne záznamy.')}</td></tr>`}</tbody></table></div>`;
  if (onRow) view.querySelectorAll('tbody tr[data-i]').forEach(tr => tr.onclick = () => onRow(rows[+tr.dataset.i]));
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
  const { product: p } = await api(`/admin/products/${id}?fields=id,title,status,description,metadata,*variants.prices,*categories`);
  const variant = p.variants?.[0]; const price = variant?.prices?.find(x => x.currency_code === 'eur');
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
      if (variant && np !== '' && Number(np) !== price?.amount) await api(`/admin/products/${id}/variants/${variant.id}`, { method: 'POST', body: { prices: [{ amount: Number(np), currency_code: 'eur' }] } });
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
  listView(view, { title: 'Objednávky', rows: orders, onRow: o => vOrderDetail(view, o.id), cols: [
    { h: 'Č.', v: o => '#' + (o.display_id ?? '') }, { h: 'E-mail', v: o => esc(o.email) },
    { h: 'Stav', v: o => `<span class="pill">${esc(o.status)}</span>` },
    { h: 'Platba', v: o => `<span class="pill">${esc(o.payment_status || '—')}</span>` },
    { h: 'Suma', v: o => fmtEur(o.total) },
    { h: 'Dátum', v: o => fmtDate(o.created_at) }] });
}
async function vOrderDetail(view, id) {
  view.innerHTML = '<div class="muted">Načítavam…</div>';
  const { order: o } = await api(`/admin/orders/${id}?fields=id,display_id,email,status,total,currency_code,created_at,payment_status,fulfillment_status,*items`);
  const prehlad = `<div class="row"><div><label>E-mail</label><div>${esc(o.email)}</div></div><div><label>Dátum</label><div>${fmtDate(o.created_at)}</div></div></div>
    <div class="row"><div><label>Stav</label><div><span class="pill">${esc(o.status)}</span></div></div>
    <div><label>Platba</label><div><span class="pill">${esc(o.payment_status || '—')}</span></div></div></div>
    <div class="row"><div><label>Doručenie</label><div><span class="pill">${esc(o.fulfillment_status || '—')}</span></div></div>
    <div><label>Celkom</label><div style="font-weight:600">${fmtEur(o.total)}</div></div></div>
    <p class="muted" style="margin-top:10px">Fulfillment a refundy prebiehajú cez jadro (bezpečné serverové operácie); tu je bezpečný náhľad.</p>`;
  const polozky = `<table><thead><tr><th>Produkt</th><th>Ks</th><th>Suma</th></tr></thead><tbody>
    ${(o.items || []).map(it => `<tr><td>${esc(it.title || it.product_title || '')}</td><td>${it.quantity}</td><td>${fmtEur(it.total)}</td></tr>`).join('')}
    </tbody></table><div style="margin-top:14px;font-weight:600">Celkom: ${fmtEur(o.total)}</div>`;
  view.innerHTML = `<div class="card"><div class="card-h">Objednávka #${o.display_id ?? ''}<button class="btn ghost" id="o-back">Späť</button></div><div class="card-b">
    ${tabsHtml([{ id: 'p', label: 'Prehľad', html: prehlad }, { id: 'i', label: 'Položky', html: polozky }])}
  </div></div>`;
  wireTabs(view);
  view.querySelector('#o-back').onclick = () => vOrders(view);
}
async function vCustomers(view) {
  const { customers } = await api('/admin/customers?limit=100&fields=id,email,first_name,last_name,has_account,created_at');
  listView(view, { title: 'Zákazníčky', rows: customers, onRow: c => vCustomerDetail(view, c.id), cols: [
    { h: 'E-mail', v: c => esc(c.email) }, { h: 'Meno', v: c => esc([c.first_name, c.last_name].filter(Boolean).join(' ')) },
    { h: 'Účet', v: c => c.has_account ? '<span class="pill ok">áno</span>' : '<span class="pill warn">hosť</span>' },
    { h: 'Registrácia', v: c => fmtDate(c.created_at) }] });
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
    view.innerHTML = `<div class="notice"><b>Čaká na backend.</b> ${esc(note)}<br><span class="muted">Endpoint ${esc(endpoint)} zatiaľ nie je dostupný (${esc(e.message)}). UI je pripravené, napojí sa po dodaní API.</span></div>`;
  }
}
function stub(view, title, note) {
  view.innerHTML = `<div class="notice"><b>Čaká na backend.</b> ${esc(note)}<br><span class="muted">Obrazovka „${esc(title)}" je v návrhu ANASTASIA vzhľadu; napojí sa, keď bude hotový príslušný backend/endpoint.</span></div>`;
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
const vObsah = (view) => subnav(view, [
  { label: 'Stránky a texty', run: (v) => stub(v, 'Stránky a texty', 'Samoobslužná správa stránok a textov všetkých webov.') },
  { label: 'E-maily', run: (v) => stub(v, 'E-maily', 'Šablóny e-mailov (potvrdenia, poukazy) na úpravu bez programátora.') },
  { label: 'Médiá', run: (v) => stub(v, 'Médiá', 'Chránené videá a audio (R2).') },
  { label: 'Preklady', run: (v) => stub(v, 'Preklady', 'SK zdroj, EN/RU — z jedného admina.') },
]);
const vNastavenia = (view) => subnav(view, [
  { label: 'Vzhľad', run: vAppearance },
  { label: 'Pripojenia', run: (v) => stub(v, 'Pripojenia', 'Vloženie/overenie API kľúčov služieb (Stripe, ComGate, dopravcovia) bez programátora.') },
  { label: 'Účtovníctvo', run: (v) => stub(v, 'Účtovníctvo', 'Napojenie fakturácie (POHODA / Money S3).') },
  { label: 'Klub / Členstvo', run: (v) => tryList(v, { title: 'Klub / Členstvo', endpoint: '/admin/memberships', key: 'memberships', cols: [{ h: 'Zákazníčka', v: x => esc(x.customer_id || '') }, { h: 'Stav', v: x => esc(x.status || '') }, { h: 'Platí do', v: x => fmtDate(x.current_period_end) }], note: 'Členstvo/predplatné sa dokončuje v jadre (Codex).' }) },
]);
function vPomoc(view) {
  view.innerHTML = `<div class="card"><div class="card-h">Potrebujete poradiť?</div><div class="card-b">
    <p>Sme tu pre vás. Pri každom nastavení v administrácii nájdete krátke vysvetlenie, čo zmena ovplyvní.</p>
    <p class="muted">Technická podpora: <a href="mailto:podpora@l-code-dynamics.com">podpora@l-code-dynamics.com</a></p>
  </div></div>`;
}

const ROUTES = {
  '': ['', '', vDashboard],
  'objednavky': ['Objednávky', 'Prehľad a vybavenie objednávok', vOrders],
  'produkty': ['Produkty', 'Katalóg, ceny a akcie', vProducts],
  'kategorie': ['Kategórie', 'Stromy a zaradenie', vCategories],
  'zakaznicky': ['Zákazníčky', 'Účty a história', vCustomers],
  'konzultacie': ['Konzultácie', 'Rezervácie a termíny', vKonzultacie],
  'spravy': ['Správy', 'Konverzácie so zákazníčkami', vSpravy],
  'poukazy': ['Poukazy a zľavy', 'Kupóny, QR a darčekové poukazy', vPoukazy],
  'obsah': ['Obsah a e-maily', 'Stránky, texty, médiá a preklady', vObsah],
  'nastavenia': ['Nastavenia', 'Vzhľad, pripojenia, fakturácia a Klub', vNastavenia],
  'pomoc': ['Pomoc', 'Podpora a vysvetlenia', vPomoc],
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
async function refreshBadges() {
  try { const c = (await api('/admin/orders?fulfillment_status[]=not_fulfilled&limit=1')).count; BADGES.orders = c || 0; } catch { return; }
  const el = document.querySelector('[data-badge="orders"]');
  if (el) { if (BADGES.orders > 0) { el.textContent = BADGES.orders; el.hidden = false; } else el.hidden = true; }
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
