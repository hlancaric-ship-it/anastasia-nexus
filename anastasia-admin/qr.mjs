// QR is a saved link, never a second coupon balance or a client price calculation.
export function qrAgenda({ api, esc, fmtDate, freshView }) {
  return async function openQr(view) {
    view = freshView(view);
    let offset = 0, query = '';
    const message = (text, error = false) => `<div class="${error ? 'err' : 'notice'}" role="${error ? 'alert' : 'status'}">${esc(text)}</div>`;
    const fail = (error) => { const box = view.querySelector('[data-message]'); if (box) box.innerHTML = message(error.message || 'Spojenie zlyhalo. Skúste to znova.', true); };
    const frame = (title, body) => {
      view.innerHTML = `<div class="card"><div class="card-h">${esc(title)}<button type="button" class="btn ghost" data-back>Späť na zoznam</button></div><div class="card-b"><div data-message></div>${body}</div></div>`;
      view.querySelector('[data-back]').onclick = list;
    };
    async function list() {
      frame('QR kódy', '<p class="muted">Načítavam…</p>');
      try {
        const data = await api(`/admin/coupon-links?limit=12&offset=${offset}&q=${encodeURIComponent(query)}`);
        frame('QR kódy', `<p>Nové aj už vydané QR kódy. Stratený obrázok si môžete znova stiahnuť bez vytvorenia ďalšieho kupónu.</p>
          <div class="row"><button type="button" class="btn gold" data-new>Vytvoriť QR kód</button><button type="button" class="btn ghost" data-import>Pridať staré odkazy</button></div>
          <form data-search><label for="qr-search">Presný kód produktu alebo kupónu</label><div class="row"><input id="qr-search" maxlength="128" value="${esc(query)}"><button class="btn ghost" type="submit">Hľadať</button></div></form>
          <div class="rc-grid" style="margin-top:16px">${data.links.length ? data.links.map(r => `<button type="button" class="rc" data-record="${esc(r.id)}"><b>${esc(r.product_title || r.sku)}</b><p>Kupón: ${esc(r.coupon_code)}</p><span class="pill">${r.source === 'legacy' ? 'Zo starého obchodu' : 'Vytvorený tu'}</span><p>${r.coupon?.available && r.product_available ? 'Kupón dostupný · podmienky overí košík' : 'Vyžaduje kontrolu · otvorte detail'}</p></button>`).join('') : '<p>Zatiaľ tu nie sú žiadne QR kódy zodpovedajúce vyhľadávaniu.</p>'}</div>
          <div class="row" style="margin-top:16px"><button type="button" class="btn ghost" data-prev ${offset ? '' : 'disabled'}>Predchádzajúce</button><span>${data.count ? offset + 1 : 0}–${offset + data.links.length} z ${data.count}</span><button type="button" class="btn ghost" data-next ${offset + data.links.length < data.count ? '' : 'disabled'}>Ďalšie</button></div>`);
        view.querySelector('[data-back]').hidden = true;
        view.querySelector('[data-new]').onclick = generate;
        view.querySelector('[data-import]').onclick = importing;
        view.querySelector('[data-search]').onsubmit = e => { e.preventDefault(); query = view.querySelector('#qr-search').value.trim(); offset = 0; list(); };
        view.querySelector('[data-prev]').onclick = () => { offset = Math.max(0, offset - 12); list(); };
        view.querySelector('[data-next]').onclick = () => { offset += 12; list(); };
        view.querySelectorAll('[data-record]').forEach(b => b.onclick = () => detail(b.dataset.record));
      } catch (e) { fail(e); }
    }
    function generate() {
      frame('Vytvoriť QR kód', `<p>QR nasmeruje zákazníčku na produkt s existujúcim kupónom. Novú zľavu tým nevytvárate.</p><form data-create>
        <label for="qr-sku">Kód produktu</label><input id="qr-sku" required maxlength="128">
        <label for="qr-code">Kód kupónu</label><input id="qr-code" required maxlength="128" autocomplete="off">
        <label for="qr-qty">Počet kusov</label><input id="qr-qty" type="number" min="1" max="999" step="1" required value="1">
        <button type="submit" class="btn gold">Vytvoriť a uložiť</button></form>`);
      view.querySelector('[data-create]').onsubmit = async e => {
        e.preventDefault(); const button = e.currentTarget.querySelector('button'); button.disabled = true;
        try {
          const data = await api('/admin/coupon-links', { method: 'POST', body: { produkt: view.querySelector('#qr-sku').value.trim(), kupon: view.querySelector('#qr-code').value.trim(), ks: Number(view.querySelector('#qr-qty').value), format: 'svg' } });
          await detail(data.record.id);
        } catch (error) { fail(error); button.disabled = false; }
      };
    }
    async function detail(id) {
      frame('Detail QR kódu', '<p class="muted">Načítavam…</p>');
      try {
        const { link: r } = await api(`/admin/coupon-links/${encodeURIComponent(id)}`);
        const state = { active: 'Zapnutý', inactive: 'Vypnutý', draft: 'Čaká na schválenie' };
        frame('Detail QR kódu', `<p><b>${esc(r.product_title || r.sku)}</b> · ${esc(r.quantity)} ks</p>
          <p>Kód produktu: ${esc(r.sku)} · Kupón: <b>${esc(r.coupon_code)}</b></p>
          <p>Pôvod: ${r.source === 'legacy' ? 'Starý obchod' : 'Vytvorený tu'} · Vydaný: ${r.issued_at ? esc(fmtDate(r.issued_at)) : 'Dátum nie je známy'}</p>
          <p>Pridaný do evidencie: ${esc(fmtDate(r.created_at))}</p>
          <p>Produkt: ${r.product_available ? 'Dostupný' : 'Nedostupný alebo nejednoznačný'}</p>
          <p>Stav kupónu: ${esc(r.coupon ? (state[r.coupon.status] || r.coupon.status) : 'Nenašiel sa jednoznačne')}</p>
          ${r.coupon ? `<p>Použitia: ${esc(r.coupon.used)} · Limit: ${r.coupon.limit == null ? 'Bez obmedzenia' : esc(r.coupon.limit)}</p><p>Platnosť: ${r.coupon.starts_at ? esc(fmtDate(r.coupon.starts_at)) : 'Bez dátumu začiatku'} – ${r.coupon.ends_at ? esc(fmtDate(r.coupon.ends_at)) : 'Bez dátumu konca'}</p>` : ''}
          ${!r.product_available || !r.coupon?.available ? message('Odkaz si môžete stiahnuť, ale produkt alebo kupón teraz nie je dostupný. Stiahnutie kupón nezapne.') : '<p>Podmienky a konečnú zľavu vždy overí košík.</p>'}
          <label for="qr-url">Pôvodný odkaz</label><input id="qr-url" readonly value="${esc(r.url)}">
          <div class="row"><button type="button" class="btn gold" data-download="svg">Stiahnuť SVG</button><button type="button" class="btn ghost" data-download="png">Stiahnuť PNG</button></div><div data-qr></div>
          ${r.coupon && r.coupon.status !== 'inactive' ? `<details style="margin-top:20px"><summary>Vypnúť kupón</summary><p>Vypnutie platí pre VŠETKY QR kódy aj iné odkazy používajúce tento kupón. Už dokončené nákupy sa nemenia.</p><form data-disable><label for="qr-confirm">Na potvrdenie opíšte kód kupónu</label><input id="qr-confirm" required autocomplete="off"><button class="btn ghost" type="submit">Potvrdiť vypnutie kupónu</button></form></details>` : ''}`);
        view.querySelectorAll('[data-download]').forEach(b => b.onclick = async () => {
          b.disabled = true;
          try {
            const format = b.dataset.download, result = await api(`/admin/coupon-links/${encodeURIComponent(id)}/qr?format=${format}`);
            if (!['image/svg+xml', 'image/png'].includes(result.qr?.mime_type) || !/^[A-Za-z0-9+/=]+$/.test(result.qr.base64)) throw new Error('Obrázok sa nepodarilo pripraviť. Skúste to znova.');
            const src = `data:${result.qr.mime_type};base64,${result.qr.base64}`;
            view.querySelector('[data-qr]').innerHTML = `<img width="220" height="220" alt="QR kód pôvodného odkazu" src="${src}">`;
            const a = document.createElement('a'); a.href = src; a.download = `qr-${id}.${format}`; view.append(a); a.click(); a.remove();
          } catch (error) { fail(error); } finally { b.disabled = false; }
        });
        const form = view.querySelector('[data-disable]');
        if (form) form.onsubmit = async e => {
          e.preventDefault(); const b = form.querySelector('button'); b.disabled = true;
          try { await api(`/admin/coupon-links/${encodeURIComponent(id)}/deactivate`, { method: 'POST', body: { confirmation: view.querySelector('#qr-confirm').value } }); await detail(id); }
          catch (error) { fail(error); b.disabled = false; }
        };
      } catch (e) { fail(e); }
    }
    function importing() {
      let checked = '';
      frame('Pridať staré QR odkazy', `<p>Vložte pôvodné odkazy, každý na samostatný riadok (najviac 100). Nepridávajte osobné údaje. Najprv zoznam skontrolujeme; až potom ho môžete uložiť.</p><p>Import nezapína kupóny, nemení čerpanie ani vytlačené odkazy. Neznámy dátum vydania zostane neznámy.</p>
        <form data-import-form><label for="qr-import">Pôvodné odkazy</label><textarea id="qr-import" rows="6" required maxlength="205000"></textarea><div class="row"><button class="btn ghost" type="submit">Skontrolovať zoznam</button><button class="btn gold" type="button" data-save-import disabled>Uložiť skontrolované odkazy</button></div></form>`);
      const field = view.querySelector('#qr-import'), save = view.querySelector('[data-save-import]');
      field.oninput = () => { checked = ''; save.disabled = true; };
      const run = async dry => {
        const text = field.value.trim(), links = text.split(/\r?\n/).map(url => url.trim()).filter(Boolean).map(url => ({ url }));
        if (!links.length || links.length > 100) { fail(new Error('Vložte 1 až 100 odkazov.')); return; }
        if (!dry && checked !== text) { fail(new Error('Zmenený zoznam najprv znova skontrolujte.')); return; }
        const buttons = view.querySelectorAll('form button'); buttons.forEach(b => b.disabled = true);
        try {
          const result = await api('/admin/coupon-links/import', { method: 'POST', body: { links, dry_run: dry } });
          view.querySelector('[data-message]').innerHTML = message(`${dry ? 'Kontrola' : 'Uloženie'}: ${result.created} ${dry ? 'nových' : 'pridaných'}, ${result.existing} už evidovaných. Kupóny sa nezmenili.`);
          checked = dry && field.value.trim() === text ? text : ''; save.disabled = !checked;
        } catch (error) { checked = ''; fail(error); save.disabled = true; }
        finally { view.querySelector('form button[type="submit"]').disabled = false; }
      };
      view.querySelector('form').onsubmit = e => { e.preventDefault(); run(true); };
      save.onclick = () => run(false);
    }
    await list();
  };
}
