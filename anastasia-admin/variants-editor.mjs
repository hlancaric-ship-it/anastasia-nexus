// Voľby a varianty produktu (napr. Pre: Dámsky/Pánsky, Množstvo: 50 ml/100 ml).
// Každá kombinácia volieb je samostatný variant. Tabuľka variantov ako v Shoptete, úprava v okne so záložkami
// Hlavné údaje / Cenník / Sklad / Logistika. Zmeny sa ukladajú hneď tlačidlom Uložiť v okne.
const escape = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt = n => n == null ? '' : String(n);
const eur = n => n == null ? '–' : new Intl.NumberFormat('sk-SK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' €';
// Technická voľba z jednoduchého produktu („Variant: Štandard“) sa zákazníkovi nezobrazuje.
const technical = o => (o.values || []).length <= 1 && /^(variant|default.*|predvolen.*)$/i.test(o.title || '');
const basePrice = v => (v?.prices || []).find(x => x.currency_code === 'eur' && !x.price_list_id && !(x.rules_count > 0));
const skuPart = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 12);
const errText = e => e?.detail || e?.message || 'Zmena sa nepodarila.';
const fr = (label, control, forId, hint) => `<div class="pe-f">${forId ? `<label for="${forId}">${label}</label>` : `<span class="pe-fl">${label}</span>`}<div class="pe-fc">${control}${hint ? `<p class="muted pe-hint">${hint}</p>` : ''}</div></div>`;
const head = (n, title) => `<header class="ve-h"><span class="pe-n">${n}</span><h3>${escape(title)}</h3></header>`;
const SKU_RE = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;

export async function mountVariantsEditor(host, { api, productId, canPrice = true, stockHost = null }) {
  if (!host) return;
  let product = null, busy = false, locations = [];
  const stock = new Map();
  // Sklad každého variantu: úrovne po skladoch, alebo neobmedzené (digitálne, bez sledovania).
  const load = async () => {
    product = (await api(`/admin/products/${productId}?fields=id,title,*options,*options.values,*variants,*variants.options,*variants.prices,variants.sku,variants.manage_inventory,variants.allow_backorder,*variants.inventory_items`)).product;
    if (!locations.length) locations = (await api('/admin/stock-locations?limit=50&fields=id,name').catch(() => ({}))).stock_locations || [];
    stock.clear();
    await Promise.all((product.variants || []).map(async v => {
      const item = v.inventory_items?.[0]?.inventory_item_id;
      if (!v.manage_inventory || !item) return;
      const levels = (await api(`/admin/inventory-items/${item}/location-levels?limit=50`).catch(() => ({}))).inventory_levels || [];
      const sum = k => levels.reduce((n, l) => n + Number(l[k] || 0), 0);
      stock.set(v.id, { item, levels, qty: sum('stocked_quantity'), reserved: sum('reserved_quantity') });
    }));
  };
  const opts = () => product.options || [];
  const valueOf = (v, o) => (v.options || []).find(x => (x.option_id || x.option?.id) === o.id)?.value || '';
  const titleFor = (os, vals) => os.filter(o => !technical(o)).map(o => vals[o.title]).filter(Boolean).join(' / ') || 'Štandard';
  const nameOf = v => titleFor(opts(), Object.fromEntries(opts().map(o => [o.title, valueOf(v, o)])));
  const say = (text, bad) => { const m = host.querySelector('[data-v-msg]'); if (m) m.innerHTML = text ? `<div class="${bad ? 'err' : 'notice'}">${escape(text)}</div>` : ''; };
  const run = async (fn, okText) => {
    if (busy) return false; busy = true; host.classList.add('is-busy');
    try { await fn(); await load(); draw(); say(okText); return true; }
    catch (e) { if (e?.message === '401') throw e; say(errText(e), true); return false; }
    finally { busy = false; host.classList.remove('is-busy'); }
  };
  const stockCell = v => {
    if (!v.manage_inventory) return '<span class="pill ok">neobmedzené</span>';
    const st = stock.get(v.id), q = st?.qty ?? 0;
    return `<b>${q}</b> ks${q - (st?.reserved || 0) <= 0 ? ' <span class="pill warn">vypredané</span>' : ''}`;
  };

  // Okno úpravy variantu ako v Shoptete: nadpis, pripojené záložky, sekcie s riadkami popis – pole, Uložiť vpravo dole.
  const openVariant = (v, tab = 'hlavne') => {
    const st = stock.get(v.id) || { levels: [] }, pr = basePrice(v), unl = !v.manage_inventory;
    const level = loc => st.levels.find(l => l.location_id === loc.id);
    const TABS = [['hlavne', 'Hlavné údaje'], ['cennik', 'Cenník'], ['sklad', 'Sklad'], ['logistika', 'Logistika']];
    const num = (id, val, unit, step = '0.01') => `<span class="pe-unit"><input id="${id}" type="number" min="0" step="${step}" value="${escape(fmt(val))}">${unit ? ` ${unit}` : ''}</span>`;
    const dlg = document.createElement('dialog');
    dlg.className = 'mp ve-dlg';
    dlg.innerHTML = `<form method="dialog" class="ve-dlg-in">
      <div class="ve-dlg-top"><h2>Variant produktu <span>${escape(product.title)} – ${escape(nameOf(v))}</span></h2><button type="button" class="ve-x" data-close aria-label="Zavrieť">×</button></div>
      <nav class="ve-tabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" data-t="${k}">${l}</button>`).join('')}</nav>
      <div data-dlg-msg></div>
      <div class="ve-pane" data-p="hlavne">
        ${head('01', 'Značenie')}
        ${fr('Kód (SKU)', `<input id="vd-sku" value="${escape(v.sku || '')}" maxlength="64" autocomplete="off">`, 'vd-sku', v.sku ? 'Pozor: QR kódy vytvorené pre starý kód po zmene prestanú fungovať.' : '')}
        ${opts().filter(o => !technical(o)).map(o => fr(`Hodnota voľby „${escape(o.title)}“`, `<b>${escape(valueOf(v, o) || '–')}</b>`)).join('')}
        ${head('02', 'Doplňujúce informácie')}
        ${fr('Názov variantu', `<input id="vd-title" value="${escape(v.title || '')}" maxlength="120">`, 'vd-title', 'Zobrazí sa v košíku a v objednávke.')}
      </div>
      <div class="ve-pane" data-p="cennik">
        ${head('01', 'Cena')}
        ${fr('Cena', `${num('vd-price', pr?.amount)} EUR vrátane DPH`, 'vd-price', canPrice ? '' : 'Ceny mení len vlastník administrácie.')}
      </div>
      <div class="ve-pane" data-p="sklad">
        ${head('01', 'Skladové zásoby')}
        <div class="ve-tw"><table class="ve-t"><thead><tr><th>Sklad</th><th class="r">Stav skladu</th><th class="r">Rezervované</th><th class="r">Dostupné</th></tr></thead><tbody>
          <tr class="ve-sum"><td>Celkový stav</td><td class="r">${unl ? '∞' : st.qty ?? 0}</td><td class="r">${unl ? '–' : st.reserved ?? 0}</td><td class="r">${unl ? '∞' : (st.qty ?? 0) - (st.reserved ?? 0)}</td></tr>
          ${locations.map(loc => { const l = level(loc); return `<tr><td>${escape(loc.name)}</td><td class="r"><input type="number" min="0" step="1" inputmode="numeric" data-loc="${escape(loc.id)}" value="${unl ? '' : escape(fmt(l ? Number(l.stocked_quantity || 0) : 0))}" ${unl ? 'disabled' : ''} aria-label="Stav skladu ${escape(loc.name)}"></td><td class="r">${unl ? '–' : Number(l?.reserved_quantity || 0)}</td><td class="r">${unl ? '–' : Number(l?.stocked_quantity || 0) - Number(l?.reserved_quantity || 0)}</td></tr>`; }).join('') || '<tr><td colspan="4" class="muted">Najprv v Nastaveniach založte sklad.</td></tr>'}
        </tbody></table></div>
        ${head('02', 'Správanie produktu na sklade')}
        ${fr('Neobmedzené', `<label class="pe-chk"><input type="checkbox" id="vd-unl" ${unl ? 'checked' : ''}> Nesledovať sklad (digitálny produkt, služba)</label>`)}
        ${fr('Povoliť nákup do mínusu', `<label class="pe-chk"><input type="checkbox" id="vd-back" ${v.allow_backorder ? 'checked' : ''}> Zákazník môže objednať aj pri nulovom stave</label>`)}
      </div>
      <div class="ve-pane" data-p="logistika">
        ${head('01', 'Detail produktu')}
        <p class="muted pe-hint ve-note">Hmotnosť a rozmery zadávajte vrátane balenia.</p>
        ${fr('Hmotnosť', num('vd-weight', v.weight, 'kg', '0.001'), 'vd-weight')}
        ${fr('Šírka', num('vd-width', v.width, 'cm', '0.1'), 'vd-width')}
        ${fr('Dĺžka', num('vd-length', v.length, 'cm', '0.1'), 'vd-length')}
        ${fr('Výška', num('vd-height', v.height, 'cm', '0.1'), 'vd-height')}
        ${head('02', 'Kódy')}
        ${fr('EAN kód', `<input id="vd-ean" value="${escape(v.barcode || v.ean || '')}" maxlength="64" inputmode="numeric" autocomplete="off">`, 'vd-ean')}
        ${fr('UPC kód', `<input id="vd-upc" value="${escape(v.upc || '')}" maxlength="64" autocomplete="off">`, 'vd-upc')}
        ${fr('Colný kód (HS)', `<input id="vd-hs" value="${escape(v.hs_code || '')}" maxlength="64" autocomplete="off">`, 'vd-hs')}
        ${fr('Krajina pôvodu', `<input id="vd-origin" value="${escape(v.origin_country || '')}" maxlength="2" placeholder="napr. SK" autocomplete="off">`, 'vd-origin')}
      </div>
      <div class="ve-dlg-foot"><button type="button" class="btn ghost" data-close>Zavrieť</button><button type="button" class="btn gold" data-save>Uložiť</button></div>
    </form>`;
    document.body.appendChild(dlg);
    const $ = s => dlg.querySelector(s);
    const show = k => { dlg.querySelectorAll('.ve-pane').forEach(p => { p.hidden = p.dataset.p !== k; }); dlg.querySelectorAll('[data-t]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === k))); };
    dlg.querySelectorAll('[data-t]').forEach(b => b.onclick = () => show(b.dataset.t));
    show(tab);
    if (!canPrice) $('#vd-price').disabled = true;
    $('#vd-unl').onchange = e => dlg.querySelectorAll('[data-loc]').forEach(i => { i.disabled = e.target.checked; if (!e.target.checked && i.value === '') i.value = '0'; });
    const close = () => { dlg.close(); dlg.remove(); };
    dlg.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
    dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });
    const bad = (text, t) => { if (t) show(t); $('[data-dlg-msg]').innerHTML = `<div class="err">${escape(text)}</div>`; };
    $('[data-save]').onclick = async () => {
      $('[data-dlg-msg]').innerHTML = '';
      const sku = $('#vd-sku').value.trim().toUpperCase();
      if (sku && !SKU_RE.test(sku)) return bad('Kód (SKU): 2–64 znakov, len písmená A–Z, číslice, bodka, pomlčka alebo podčiarknik.', 'hlavne');
      if (sku !== String(v.sku || '').toUpperCase() && v.sku && !confirm(`Zmeniť kód z ${v.sku} na ${sku || '(prázdny)'}?\n\nQR kódy a odkazy vytvorené pre starý kód prestanú fungovať.`)) return;
      const pIn = $('#vd-price').value.trim();
      if (canPrice && pIn !== '' && !(Number(pIn) > 0)) return bad('Cena musí byť väčšia ako 0.', 'cennik');
      const unlimited = $('#vd-unl').checked;
      const qtys = [...dlg.querySelectorAll('[data-loc]')].map(i => ({ loc: i.dataset.loc, raw: i.value.trim() }));
      if (!unlimited && qtys.some(q => q.raw === '' || !Number.isInteger(Number(q.raw)) || Number(q.raw) < 0)) return bad('Stav skladu musí byť celé číslo 0 alebo viac.', 'sklad');
      if (!unlimited && !locations.length) return bad('Najprv v Nastaveniach založte sklad.', 'sklad');
      const dims = {};
      for (const [k, id] of [['weight', 'vd-weight'], ['width', 'vd-width'], ['length', 'vd-length'], ['height', 'vd-height']]) {
        const raw = $(`#${id}`).value.trim();
        if (raw !== '' && !(Number(raw) >= 0)) return bad('Hmotnosť a rozmery musia byť kladné čísla.', 'logistika');
        if (raw !== fmt(v[k])) dims[k] = raw === '' ? null : Number(raw);
      }
      const origin = $('#vd-origin').value.trim().toUpperCase();
      if (origin && !/^[A-Z]{2}$/.test(origin)) return bad('Krajina pôvodu: dvojpísmenový kód, napr. SK.', 'logistika');
      const body = { ...dims };
      const set = (k, val, cur) => { if (val !== String(cur ?? '')) body[k] = val || null; };
      set('sku', sku, String(v.sku || '').toUpperCase());
      set('title', $('#vd-title').value.trim(), v.title);
      set('barcode', $('#vd-ean').value.trim(), v.barcode || v.ean);
      set('upc', $('#vd-upc').value.trim(), v.upc);
      set('hs_code', $('#vd-hs').value.trim(), v.hs_code);
      set('origin_country', origin.toLowerCase(), String(v.origin_country || '').toLowerCase());
      if ($('#vd-back').checked !== !!v.allow_backorder) body.allow_backorder = $('#vd-back').checked;
      if (body.title === null) delete body.title;
      if (unlimited !== !v.manage_inventory) body.manage_inventory = !unlimited;
      const btn = $('[data-save]'); btn.disabled = true;
      const ok = await run(async () => {
        if (Object.keys(body).length) await api(`/admin/products/${productId}/variants/${v.id}`, { method: 'POST', body });
        if (canPrice && pIn !== '' && Number(pIn) !== pr?.amount) {
          if (pr?.id) await api(`/admin/shop-prices/${v.id}`, { method: 'POST', body: { price_id: pr.id, amount: Number(pIn), expected_amount: Number(pr.amount) } });
          else await api(`/admin/products/${productId}/variants/${v.id}`, { method: 'POST', body: { prices: [{ currency_code: 'eur', amount: Number(pIn) }] } });
        }
        if (unlimited) return;
        let item = st.item || v.inventory_items?.[0]?.inventory_item_id;
        if (!item) {
          const { inventory_item } = await api('/admin/inventory-items', { method: 'POST', body: { title: `${product.title} – ${v.title}`, ...(sku ? { sku } : {}) } });
          item = inventory_item.id;
          await api(`/admin/products/${productId}/variants/inventory-items/batch`, { method: 'POST', body: { create: [{ variant_id: v.id, inventory_item_id: item, required_quantity: 1 }] } });
        }
        for (const { loc, raw } of qtys) {
          const l = st.levels.find(x => x.location_id === loc), q = Number(raw);
          if (l && Number(l.stocked_quantity) === q) continue;
          if (l) await api(`/admin/inventory-items/${item}/location-levels/${loc}`, { method: 'POST', body: { stocked_quantity: q } });
          else if (q > 0 || loc === locations[0]?.id) await api(`/admin/inventory-items/${item}/location-levels`, { method: 'POST', body: { location_id: loc, stocked_quantity: q } });
        }
      }, 'Variant je uložený.');
      if (ok) close();
      else { btn.disabled = false; const m = host.querySelector('[data-v-msg]')?.textContent; if (m) bad(m); }
    };
    dlg.showModal();
  };

  const draw = () => {
    const os = opts(), shown = os.filter(o => !technical(o)), variants = product.variants || [];
    const combos = shown.reduce((acc, o) => acc.flatMap(a => (o.values || []).map(v => ({ ...a, [o.title]: v.value }))), [{}]);
    const has = vals => variants.some(v => shown.every(o => valueOf(v, o) === vals[o.title]));
    const missing = shown.length ? combos.filter(c => !has(c)).length : 0;
    host.innerHTML = `
      <div data-v-msg></div>
      ${head('A', 'Voľby')}
      <p class="muted pe-hint ve-note">Voľby, z ktorých zákazník vyberá na detaile produktu (napr. <b>Pre</b>: Dámsky, Pánsky alebo <b>Množstvo</b>: 50 ml, 100 ml). Každá kombinácia je samostatný variant s vlastnou cenou a skladom.</p>
      ${shown.map(o => fr(escape(o.title), `<div class="ve-vals">${(o.values || []).map(v => `<span class="pill">${escape(v.value)}</span>`).join('')}</div>
        <div class="ve-add"><input data-v-newval="${escape(o.id)}" placeholder="Nová hodnota" maxlength="60" aria-label="Nová hodnota voľby ${escape(o.title)}"><button type="button" class="btn ghost" data-v-addval="${escape(o.id)}">Pridať hodnotu</button></div>`)).join('') || fr('Voľby', '<span class="muted">Produkt zatiaľ nemá voľby, predáva sa v jednom variante.</span>')}
      ${fr('Nová voľba', '<input id="ve-t" placeholder="napr. Pre" maxlength="40">', 've-t')}
      ${fr('Hodnoty', '<div class="ve-add"><input id="ve-v" placeholder="napr. Dámsky, Pánsky" maxlength="300"><button type="button" class="btn ghost" data-v-addopt>Pridať voľbu</button></div>', 've-v', 'Hodnoty oddeľte čiarkou.')}
      ${head('B', 'Varianty')}
      <div class="ve-tw"><table class="ve-t ve-list"><thead><tr><th>Variant</th><th>Kód (SKU)</th><th>EAN</th><th class="r">Cena</th><th class="r">Sklad</th><th></th></tr></thead><tbody>
        ${variants.map(v => `<tr data-vid="${escape(v.id)}"><td><button type="button" class="ve-name" data-v-edit>${escape(nameOf(v))}</button></td><td>${escape(v.sku || '–')}</td><td>${escape(v.barcode || v.ean || '–')}</td><td class="r">${eur(basePrice(v)?.amount)}</td><td class="r">${stockCell(v)}</td>
          <td class="ve-act"><button type="button" class="btn ghost sm" data-v-edit>Upraviť</button>${variants.length > 1 ? '<button type="button" class="btn ghost sm" data-v-del>Odstrániť</button>' : ''}</td></tr>`).join('')}
      </tbody></table></div>
      ${shown.length && missing ? `<p style="margin-top:12px"><button type="button" class="btn gold" data-v-fill>Vytvoriť chýbajúce varianty (${missing})</button> <span class="muted">Cena a SKU sa prevezmú z prvého variantu, potom ich upravte.</span></p>` : ''}`;

    if (stockHost) {
      stockHost.innerHTML = `<div class="ve-tw"><table class="ve-t"><thead><tr><th>Variant</th><th>Kód (SKU)</th>${locations.map(l => `<th class="r">${escape(l.name)}</th>`).join('')}<th class="r">Rezervované</th><th class="r">Dostupné</th><th></th></tr></thead><tbody>
        ${variants.map(v => { const st = stock.get(v.id), unl = !v.manage_inventory;
          return `<tr><td><b>${escape(nameOf(v))}</b></td><td>${escape(v.sku || '–')}</td>${locations.map(loc => `<td class="r">${unl ? '∞' : Number(st?.levels.find(l => l.location_id === loc.id)?.stocked_quantity || 0)}</td>`).join('')}<td class="r">${unl ? '–' : st?.reserved ?? 0}</td><td class="r">${unl ? '<span class="pill ok">neobmedzené</span>' : stockCell(v)}</td><td class="ve-act"><button type="button" class="btn ghost sm" data-s-edit="${escape(v.id)}">Upraviť sklad</button></td></tr>`; }).join('')}
      </tbody></table></div><p class="muted pe-hint">Digitálne produkty a služby majú sklad neobmedzený. Počty upravíte tlačidlom Upraviť sklad.</p>`;
      stockHost.querySelectorAll('[data-s-edit]').forEach(b => b.onclick = () => openVariant(variants.find(x => x.id === b.dataset.sEdit), 'sklad'));
    }

    host.querySelector('[data-v-addopt]').onclick = () => {
      const title = host.querySelector('#ve-t').value.trim();
      const values = [...new Set(host.querySelector('#ve-v').value.split(',').map(s => s.trim()).filter(Boolean))];
      if (!title || !values.length) return say('Vyplňte názov voľby a aspoň jednu hodnotu.', true);
      if (os.some(o => o.title.toLowerCase() === title.toLowerCase())) return say('Voľba s týmto názvom už existuje.', true);
      run(async () => {
        await api(`/admin/products/${productId}/options/batch`, { method: 'POST', body: { add: [{ title, values }] } });
        // Existujúce varianty dostanú prvú hodnotu novej voľby, aby kombinácie ostali úplné.
        for (const v of variants) {
          const current = Object.fromEntries(os.map(o => [o.title, valueOf(v, o)]).filter(([, x]) => x));
          const next = { ...current, [title]: values[0] };
          await api(`/admin/products/${productId}/variants/${v.id}`, { method: 'POST', body: { options: next, title: titleFor([...os, { title, values: values.map(value => ({ value })) }], next) } });
        }
      }, 'Voľba je pridaná. Teraz vytvorte chýbajúce varianty.');
    };
    host.querySelectorAll('[data-v-addval]').forEach(b => b.onclick = () => {
      const o = os.find(x => x.id === b.dataset.vAddval);
      const value = host.querySelector(`[data-v-newval="${CSS.escape(b.dataset.vAddval)}"]`).value.trim();
      if (!value) return say('Zadajte hodnotu.', true);
      if ((o.values || []).some(v => v.value.toLowerCase() === value.toLowerCase())) return say('Táto hodnota už existuje.', true);
      run(() => api(`/admin/products/${productId}/options/batch`, { method: 'POST', body: { update: [{ product_option_id: o.id, add: [value] }] } }), 'Hodnota je pridaná. Vytvorte pre ňu variant.');
    });
    host.querySelector('[data-v-fill]')?.addEventListener('click', () => run(async () => {
      const first = variants[0], pr = basePrice(first);
      if (!pr?.amount) throw new Error('Prvý variant nemá cenu v EUR. Najprv ju doplňte.');
      const skus = new Set(variants.map(v => v.sku).filter(Boolean));
      for (const c of combos.filter(c => !has(c))) {
        const vals = { ...Object.fromEntries(os.filter(technical).map(o => [o.title, o.values?.[0]?.value]).filter(([, x]) => x)), ...c };
        let sku = first.sku ? `${first.sku}-${shown.map(o => skuPart(c[o.title])).join('-')}`.slice(0, 64) : undefined;
        while (sku && skus.has(sku)) sku = `${sku.slice(0, 60)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
        if (sku) skus.add(sku);
        await api(`/admin/products/${productId}/variants`, { method: 'POST', body: { title: titleFor(os, vals), ...(sku ? { sku } : {}), manage_inventory: !!first.manage_inventory, options: vals, prices: [{ currency_code: 'eur', amount: Number(pr.amount) }] } });
      }
      // Pôvodný variant dostane názov podľa svojich hodnôt.
      const fv = Object.fromEntries(os.map(o => [o.title, valueOf(first, o)]));
      if (first.title !== titleFor(os, fv)) await api(`/admin/products/${productId}/variants/${first.id}`, { method: 'POST', body: { title: titleFor(os, fv) } });
    }, 'Varianty sú vytvorené. Skontrolujte ceny a SKU.'));
    host.querySelectorAll('tr[data-vid]').forEach(row => {
      const v = variants.find(x => x.id === row.dataset.vid);
      row.querySelectorAll('[data-v-edit]').forEach(b => b.onclick = () => openVariant(v));
      row.querySelector('[data-v-del]')?.addEventListener('click', () => {
        if (!confirm(`Odstrániť variant ${v.title}? Zákazníci ho už nebudú môcť kúpiť.`)) return;
        run(() => api(`/admin/products/${productId}/variants/${v.id}`, { method: 'DELETE' }), 'Variant je odstránený.');
      });
    });
  };

  try { await load(); draw(); }
  catch (e) {
    if (e?.message === '401') throw e;
    host.innerHTML = `<div class="err">Varianty sa nepodarilo načítať. ${escape(errText(e))}</div>`;
    if (stockHost) stockHost.innerHTML = '<div class="err">Sklad sa nepodarilo načítať.</div>';
  }
}
