// Voľby a varianty produktu (napr. Pre: Dámsky/Pánsky, Množstvo: 50 ml/100 ml).
// Každá kombinácia volieb je samostatný variant s vlastnou cenou, SKU a skladom. Zmeny sa ukladajú hneď.
const escape = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt = n => n == null ? '' : String(n);
// Technická voľba z jednoduchého produktu („Variant: Štandard“) sa zákazníkovi nezobrazuje.
const technical = o => (o.values || []).length <= 1 && /^(variant|default.*)$/i.test(o.title || '');
const basePrice = v => (v?.prices || []).find(x => x.currency_code === 'eur' && !x.price_list_id && !(x.rules_count > 0));
const skuPart = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 12);
const errText = e => e?.detail || e?.message || 'Zmena sa nepodarila.';

export async function mountVariantsEditor(host, { api, productId, canPrice = true }) {
  if (!host) return;
  let product = null, busy = false;
  const load = async () => {
    product = (await api(`/admin/products/${productId}?fields=id,title,*options,*options.values,*variants,*variants.options,*variants.prices,variants.sku,variants.manage_inventory`)).product;
  };
  const optTitle = o => o.title;
  const valueOf = (v, o) => (v.options || []).find(x => (x.option_id || x.option?.id) === o.id)?.value || '';
  const titleFor = (opts, vals) => opts.filter(o => !technical(o)).map(o => vals[o.title]).filter(Boolean).join(' / ') || 'Štandard';
  const say = (text, bad) => { const m = host.querySelector('[data-v-msg]'); if (m) m.innerHTML = text ? `<div class="${bad ? 'err' : 'notice'}">${escape(text)}</div>` : ''; };
  const run = async (fn, okText) => {
    if (busy) return; busy = true; host.classList.add('is-busy');
    try { await fn(); await load(); draw(); say(okText); }
    catch (e) { if (e?.message === '401') throw e; say(errText(e), true); }
    finally { busy = false; host.classList.remove('is-busy'); }
  };

  const draw = () => {
    const opts = product.options || [];
    const shown = opts.filter(o => !technical(o));
    const variants = product.variants || [];
    const combos = shown.reduce((acc, o) => acc.flatMap(a => (o.values || []).map(v => ({ ...a, [o.title]: v.value }))), [{}]);
    const has = vals => variants.some(v => shown.every(o => valueOf(v, o) === vals[o.title]));
    const missing = shown.length ? combos.filter(c => !has(c)).length : 0;
    host.innerHTML = `
      <p class="muted" style="margin:0 0 12px">Voľby, z ktorých zákazník vyberá na detaile produktu (napr. <b>Pre</b>: Dámsky, Pánsky alebo <b>Množstvo</b>: 50 ml, 100 ml). Každá kombinácia je samostatný variant s vlastnou cenou a skladom.</p>
      <div data-v-msg></div>
      <div class="ve-opts">${shown.map(o => `<div class="ve-opt">
        <b>${escape(o.title)}</b>
        <div class="ve-vals">${(o.values || []).map(v => `<span class="pill">${escape(v.value)}</span>`).join('')}</div>
        <div class="ve-add"><input data-v-newval="${escape(o.id)}" placeholder="Nová hodnota" maxlength="60"><button type="button" class="btn ghost" data-v-addval="${escape(o.id)}">Pridať hodnotu</button></div>
      </div>`).join('') || '<p class="muted">Produkt zatiaľ nemá voľby, predáva sa v jednom variante.</p>'}</div>
      <div class="ve-new">
        <div><label for="ve-t">Nová voľba</label><input id="ve-t" placeholder="napr. Pre" maxlength="40"></div>
        <div><label for="ve-v">Hodnoty (oddeľte čiarkou)</label><input id="ve-v" placeholder="napr. Dámsky, Pánsky" maxlength="300"></div>
        <button type="button" class="btn ghost" data-v-addopt>Pridať voľbu</button>
      </div>
      ${shown.length ? `<div class="ve-table">
        <div class="ve-row ve-head"><span>Variant</span><span>Cena (EUR)</span><span>SKU</span><span></span></div>
        ${variants.map(v => { const pr = basePrice(v); return `<div class="ve-row" data-vid="${escape(v.id)}">
          <span><b>${escape(titleFor(opts, Object.fromEntries(opts.map(o => [o.title, valueOf(v, o)]))))}</b></span>
          <span><input type="number" step="0.01" min="0" data-v-price value="${escape(fmt(pr?.amount))}" ${canPrice ? '' : 'disabled'} aria-label="Cena"></span>
          <span><input data-v-sku value="${escape(v.sku || '')}" maxlength="64" aria-label="SKU"></span>
          <span class="ve-act"><button type="button" class="btn ghost" data-v-save>Uložiť</button>${variants.length > 1 ? '<button type="button" class="btn ghost" data-v-del>Odstrániť</button>' : ''}</span>
        </div>`; }).join('')}
      </div>
      ${missing ? `<p style="margin-top:12px"><button type="button" class="btn gold" data-v-fill>Vytvoriť chýbajúce varianty (${missing})</button> <span class="muted">Cena a SKU sa prevezmú z prvého variantu, potom ich upravte.</span></p>` : ''}` : ''}`;

    host.querySelector('[data-v-addopt]').onclick = () => {
      const title = host.querySelector('#ve-t').value.trim();
      const values = [...new Set(host.querySelector('#ve-v').value.split(',').map(s => s.trim()).filter(Boolean))];
      if (!title || !values.length) return say('Vyplňte názov voľby a aspoň jednu hodnotu.', true);
      if (opts.some(o => o.title.toLowerCase() === title.toLowerCase())) return say('Voľba s týmto názvom už existuje.', true);
      run(async () => {
        await api(`/admin/products/${productId}/options/batch`, { method: 'POST', body: { add: [{ title, values }] } });
        // Existujúce varianty dostanú prvú hodnotu novej voľby, aby kombinácie ostali úplné.
        for (const v of variants) {
          const current = Object.fromEntries(opts.map(o => [o.title, valueOf(v, o)]).filter(([, x]) => x));
          const next = { ...current, [title]: values[0] };
          await api(`/admin/products/${productId}/variants/${v.id}`, { method: 'POST', body: { options: next, title: titleFor([...opts, { title, values: values.map(value => ({ value })) }], next) } });
        }
      }, 'Voľba je pridaná. Teraz vytvorte chýbajúce varianty.');
    };
    host.querySelectorAll('[data-v-addval]').forEach(b => b.onclick = () => {
      const o = opts.find(x => x.id === b.dataset.vAddval);
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
        const vals = { ...Object.fromEntries(opts.filter(technical).map(o => [o.title, o.values?.[0]?.value]).filter(([, x]) => x)), ...c };
        let sku = first.sku ? `${first.sku}-${shown.map(o => skuPart(c[o.title])).join('-')}`.slice(0, 64) : undefined;
        while (sku && skus.has(sku)) sku = `${sku.slice(0, 60)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
        if (sku) skus.add(sku);
        await api(`/admin/products/${productId}/variants`, { method: 'POST', body: { title: titleFor(opts, vals), ...(sku ? { sku } : {}), manage_inventory: !!first.manage_inventory, options: vals, prices: [{ currency_code: 'eur', amount: Number(pr.amount) }] } });
      }
      // Pôvodný variant dostane názov podľa svojich hodnôt.
      const fv = Object.fromEntries(opts.map(o => [o.title, valueOf(first, o)]));
      if (first.title !== titleFor(opts, fv)) await api(`/admin/products/${productId}/variants/${first.id}`, { method: 'POST', body: { title: titleFor(opts, fv) } });
    }, 'Varianty sú vytvorené. Skontrolujte ceny a SKU.'));
    host.querySelectorAll('.ve-row[data-vid]').forEach(row => {
      const v = variants.find(x => x.id === row.dataset.vid);
      row.querySelector('[data-v-save]').onclick = () => run(async () => {
        const sku = row.querySelector('[data-v-sku]').value.trim().toUpperCase();
        if (sku !== String(v.sku || '').toUpperCase()) await api(`/admin/products/${productId}/variants/${v.id}`, { method: 'POST', body: { sku: sku || null } });
        const pIn = row.querySelector('[data-v-price]').value, pr = basePrice(v);
        if (canPrice && pIn !== '' && Number(pIn) !== pr?.amount) {
          if (!(Number(pIn) > 0)) throw new Error('Cena musí byť väčšia ako 0.');
          if (pr?.id) await api(`/admin/shop-prices/${v.id}`, { method: 'POST', body: { price_id: pr.id, amount: Number(pIn), expected_amount: Number(pr.amount) } });
          else await api(`/admin/products/${productId}/variants/${v.id}`, { method: 'POST', body: { prices: [{ currency_code: 'eur', amount: Number(pIn) }] } });
        }
      }, 'Variant je uložený.');
      row.querySelector('[data-v-del]')?.addEventListener('click', () => {
        if (!confirm(`Odstrániť variant ${v.title}? Zákazníci ho už nebudú môcť kúpiť.`)) return;
        run(() => api(`/admin/products/${productId}/variants/${v.id}`, { method: 'DELETE' }), 'Variant je odstránený.');
      });
    });
  };

  try { await load(); draw(); }
  catch (e) { if (e?.message === '401') throw e; host.innerHTML = `<div class="err">Varianty sa nepodarilo načítať. ${escape(errText(e))}</div>`; }
}
