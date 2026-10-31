// QR is a saved link, never a second coupon balance or a client price calculation.
import { qrSvg } from './qr-encode.mjs';

/**
 * QR kód pre dvojfaktorové overenie (TOTP) – z odkazu otpauth://.
 * Generuje sa priamo v prehliadači, tajomstvo nikdy neodchádza zo zariadenia.
 */
export function qrOtpSvg(otpauthUrl, opts = {}) {
  return qrSvg(otpauthUrl, { label: 'QR kód pre dvojfaktorové overenie', ...opts });
}

export function qrAgenda({ api, esc, fmtDate, freshView, openPrintHtml }) {
  return async function openQr(view) {
    view = freshView(view);
    let offset = 0, query = '';
    const message = (text, error = false) => `<div class="${error ? 'err' : 'notice'}" role="${error ? 'alert' : 'status'}">${esc(text)}</div>`;
    const fail = (error) => { const box = view.querySelector('[data-message]'); if (box) box.innerHTML = message(error.message || 'Spojenie zlyhalo. Skúste to znova.', true); };
    const frame = (title, body) => {
      view.innerHTML = `<section class="card" aria-labelledby="qr-heading"><div class="card-h"><h2 id="qr-heading" tabindex="-1" style="font:inherit;margin:0">${esc(title)}</h2><button type="button" class="btn ghost" data-back>Späť na zoznam</button></div><div class="card-b"><div data-message></div>${body}</div></section>`;
      view.querySelector('[data-back]').onclick = list;
    };
    async function list() {
      frame('QR kódy', '<p class="muted">Načítavam…</p>');
      try {
        const data = await api(`/admin/coupon-links?limit=12&offset=${offset}&q=${encodeURIComponent(query)}`);
        frame('QR kódy', `<p>Nové aj už vydané QR kódy. Stratený obrázok si môžete znova stiahnuť bez vytvorenia ďalšieho kupónu.</p>
          <div class="row"><button type="button" class="btn gold" data-new>Vytvoriť QR kód</button><button type="button" class="btn ghost" data-import>Pridať staré odkazy</button></div>
          <form data-search><label for="qr-search">Presný kód produktu alebo kupónu</label><div class="row"><input id="qr-search" maxlength="128" value="${esc(query)}"><button class="btn ghost" type="submit">Hľadať</button></div></form>
          <div class="rc-grid" style="margin-top:16px">${data.links.length ? data.links.map(r => `<button type="button" class="rc rc-card" data-record="${esc(r.id)}"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;width:100%"><b style="font-size:15px;color:var(--ink)">${esc(r.product_title || r.sku)}</b><span class="pill" style="flex:none">${r.source === 'legacy' ? 'Zo starého obchodu' : 'Vytvorený tu'}</span></div><p style="margin:4px 0;font-size:13px;color:var(--ink)">Kupón: <b>${esc(r.coupon_code)}</b></p><p class="muted" style="margin:0;font-size:12.5px">${r.coupon?.available && r.product_available ? 'Kupón dostupný · podmienky overí košík' : 'Vyžaduje kontrolu · otvorte detail'}</p></button>`).join('') : '<p>Zatiaľ tu nie sú žiadne QR kódy zodpovedajúce vyhľadávaniu.</p>'}</div>
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
      frame('Vytvoriť QR kód', `<p>QR nasmeruje zákazníka na produkt s existujúcim kupónom. Novú zľavu tým nevytvárate.</p><form data-create>
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
        const ok = r.product_available && r.coupon?.available;
        const couponState = r.coupon ? (state[r.coupon.status] || r.coupon.status) : 'Nenašiel sa jednoznačne';
        const c = r.coupon, used = Number(c?.used) || 0, limit = c?.limit == null ? null : Number(c.limit);
        const pct = limit ? Math.min(100, Math.round(used / limit * 100)) : 0;
        const ring = `<svg viewBox="0 0 120 120" class="qx-ring" aria-hidden="true"><circle cx="60" cy="60" r="50"/><circle cx="60" cy="60" r="50" class="qx-ring-v" style="stroke-dasharray:${(pct / 100 * 314.16).toFixed(1)} 314.16"/></svg>`;
        const t0 = c?.starts_at ? Date.parse(c.starts_at) : null, t1 = c?.ends_at ? Date.parse(c.ends_at) : null, now = Date.now();
        const span = t0 && t1 && t1 > t0 ? Math.min(100, Math.max(0, (now - t0) / (t1 - t0) * 100)) : null;
        const ico = d => `<svg viewBox="0 0 24 24" class="qx-i" aria-hidden="true"><path d="${d}"/></svg>`;
        const DL = 'M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14', PR = 'M7 9V4h10v5M7 17H5v-6h14v6h-2M8 14h8v6H8z', CP = 'M9 9h10v10H9zM5 15V5h10';
        frame('Detail QR kódu', `<style>${QD_CSS}</style><div class="qx">
          <article class="qx-ticket">
            <div class="qx-stub"><span class="qx-kicker">ANASTASIA · QR</span><div class="qx-qr" data-qr><span>Pripravujem…</span></div><span class="qx-qty">${esc(r.quantity)} ks v košíku</span></div>
            <div class="qx-body">
              <div class="qx-top"><span class="qx-state ${ok ? 'on' : 'off'}"><i></i>${ok ? 'QR kód funguje' : 'Vyžaduje kontrolu'}</span><span class="qx-src">${r.source === 'legacy' ? 'Zo starého obchodu' : 'Vytvorený v administrácii'}</span></div>
              <h3 class="qx-title">${esc(r.product_title || r.sku)}</h3>
              <p class="qx-sku">kód produktu ${esc(r.sku)}</p>
              <div class="qx-code"><span>kupón</span><b>${esc(r.coupon_code)}</b></div>
              <div class="qx-acts">
                <div class="qx-seg"><span>${ico(DL)}Stiahnuť</span><button type="button" data-download="svg">SVG</button><button type="button" data-download="png">PNG</button></div>
                <div class="qx-seg"><span>${ico(PR)}Tlačiť</span><button type="button" data-print="a4">A4</button><button type="button" data-print="sticker">Nálepka</button></div>
              </div>
            </div>
          </article>
          <div class="qx-stats">
            <section class="qx-tile qx-use">${ring}<div><span class="qx-lab">Použitia kupónu</span><b class="qx-big">${c ? esc(used) : '–'}<small>${c ? (limit == null ? ' / ∞' : ` / ${esc(limit)}`) : ''}</small></b><p>${!c ? 'Kupón sa nenašiel jednoznačne' : limit == null ? 'Bez limitu použití' : `Zostáva ${esc(Math.max(0, limit - used))} použití`}</p></div></section>
            <section class="qx-tile"><span class="qx-lab">Platnosť</span><b class="qx-mid">${c?.ends_at ? 'do ' + esc(fmtDate(c.ends_at)) : 'Bez dátumu konca'}</b>${span == null ? `<p>${c?.starts_at ? 'Platí od ' + esc(fmtDate(c.starts_at)) : 'Platí od vytvorenia kupónu'}</p>` : `<div class="qx-bar"><i style="width:${span.toFixed(0)}%"></i></div><p>${esc(fmtDate(c.starts_at))} → ${esc(fmtDate(c.ends_at))}</p>`}</section>
            <section class="qx-tile"><span class="qx-lab">Stav</span><b class="qx-mid">${esc(couponState)}</b><p>Produkt ${r.product_available ? 'je dostupný' : 'nie je dostupný alebo je nejednoznačný'}</p><p class="qx-meta">Vydaný ${r.issued_at ? esc(fmtDate(r.issued_at)) : '– dátum nie je známy'}<br>V evidencii od ${esc(fmtDate(r.created_at))}</p></section>
          </div>
          <div class="qx-link"><span class="qx-lab">Odkaz v QR kóde</span><div class="qx-url"><input id="qr-url" aria-label="Odkaz v QR kóde" readonly value="${esc(r.url)}"><button type="button" data-copy>${ico(CP)}<span>Kopírovať</span></button></div>
            ${ok ? '<p class="qx-note">Podmienky a konečnú zľavu vždy overí košík.</p>' : message('Odkaz si môžete stiahnuť, ale produkt alebo kupón teraz nie je dostupný. Stiahnutie kupón nezapne.')}</div>
          ${c && c.status !== 'inactive' ? `<details class="qx-danger"><summary>Vypnúť kupón</summary><p>Vypnutie platí pre VŠETKY QR kódy aj iné odkazy používajúce tento kupón. Už dokončené nákupy sa nemenia.</p><form data-disable><label for="qr-confirm">Na potvrdenie opíšte kód kupónu</label><div class="qx-url"><input id="qr-confirm" required autocomplete="off"><button type="submit">Potvrdiť vypnutie</button></div></form></details>` : ''}
        </div>`);
        const qrBox = view.querySelector('[data-qr]');
        const qrSrc = async format => {
          const result = await api(`/admin/coupon-links/${encodeURIComponent(id)}/qr?format=${format}`);
          if (!['image/svg+xml', 'image/png'].includes(result.qr?.mime_type) || !/^[A-Za-z0-9+/=]+$/.test(result.qr.base64)) throw new Error('Obrázok sa nepodarilo pripraviť. Skúste to znova.');
          return `data:${result.qr.mime_type};base64,${result.qr.base64}`;
        };
        qrSrc('svg').then(src => { qrBox.innerHTML = `<img alt="QR kód odkazu" src="${src}">`; }).catch(() => { qrBox.innerHTML = '<span class="muted">Náhľad sa nenačítal. Stiahnutie funguje.</span>'; });
        view.querySelector('[data-copy]').onclick = async e => {
          const b = e.currentTarget, field = view.querySelector('#qr-url');
          try { await navigator.clipboard.writeText(field.value); const l = b.querySelector('span'); l.textContent = 'Skopírované'; b.classList.add('done'); setTimeout(() => { l.textContent = 'Kopírovať'; b.classList.remove('done'); }, 1800); }
          catch { field.select(); }
        };
        view.querySelectorAll('[data-download]').forEach(b => b.onclick = async () => {
          b.disabled = true;
          try {
            const format = b.dataset.download, src = await qrSrc(format);
            const a = document.createElement('a'); a.href = src; a.download = `qr-${id}.${format}`; view.append(a); a.click(); a.remove();
          } catch (error) { fail(error); } finally { b.disabled = false; }
        });
        view.querySelectorAll('[data-print]').forEach((b) => b.onclick = async () => {
          b.disabled = true;
          try {
            const result = await api(`/admin/coupon-links/${encodeURIComponent(id)}/qr?format=png`);
            if (!result.qr?.base64 || !/^[A-Za-z0-9+/=]+$/.test(result.qr.base64)) throw new Error('QR kód sa nepodarilo pripraviť. Skúste to znova.');
            const src = `data:${result.qr.mime_type || 'image/png'};base64,${result.qr.base64}`;
            const info = [
              ['Produkt', r.product_title || r.sku],
              ['Kupón', r.coupon_code],
              ['Platnosť', r.coupon?.ends_at ? fmtDate(r.coupon.ends_at) : 'bez dátumu konca'],
            ].filter(([, v]) => v);
            openPrintHtml('QR kód – ANASTASIA', qrPrintHtml(b.dataset.print, src, info, esc), QR_PRINT_CSS);
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

const QD_CSS = `
.qx{--ol:#2F3424;--ol2:#3c4330;--olm:#E4E6D6;--lv:#A7A5CF;--lvd:#73729C;--lvm:#E9E9F2;--gd:#C9A55C;display:grid;gap:22px}
.qx-ticket{position:relative;display:grid;grid-template-columns:300px minmax(0,1fr);border-radius:28px 28px 28px 0;overflow:hidden;background:linear-gradient(120deg,#f4f3fa 0%,var(--lvm) 55%,#e2e4d3 100%);box-shadow:0 30px 60px -30px rgba(47,52,36,.45)}
.qx-ticket:after{content:"";position:absolute;right:-90px;top:-90px;width:300px;height:300px;border-radius:50%;background:radial-gradient(circle,rgba(167,165,207,.55),transparent 70%);pointer-events:none}
.qx-stub{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:30px 26px;background:radial-gradient(120% 90% at 20% 0%,#4a5238 0%,var(--ol) 60%);color:var(--olm)}
.qx-stub:after{content:"";position:absolute;right:-1px;top:14px;bottom:14px;width:2px;background:repeating-linear-gradient(to bottom,rgba(233,233,242,.55) 0 7px,transparent 7px 14px)}
.qx-kicker{font-size:10px;letter-spacing:.32em;color:var(--gd)}
.qx-qr{width:200px;aspect-ratio:1;display:grid;place-items:center;padding:14px;background:#fff;border-radius:22px 22px 22px 0;box-shadow:0 0 0 6px rgba(201,165,92,.25),0 18px 40px -12px #000;font-size:12px;color:#777;transition:transform .5s cubic-bezier(.2,.8,.2,1)}
.qx-ticket:hover .qx-qr{transform:rotate(-2deg) scale(1.03)}
.qx-qr img{width:100%;height:100%;image-rendering:pixelated}
.qx-qty{font-family:'Fraunces',Georgia,serif;font-style:italic;font-size:15px;opacity:.85}
.qx-body{position:relative;z-index:1;padding:30px 34px;display:flex;flex-direction:column;min-width:0}
.qx-top{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;justify-content:space-between}
.qx-state{display:inline-flex;align-items:center;gap:9px;font-size:12px;font-weight:600;padding:7px 14px 7px 11px;border-radius:30px;background:rgba(255,255,255,.7);backdrop-filter:blur(6px)}
.qx-state i{width:9px;height:9px;border-radius:50%;background:#5f8f4e;box-shadow:0 0 0 0 rgba(95,143,78,.6);animation:qxp 2.2s infinite}
.qx-state.off{color:#8a5a17}.qx-state.off i{background:#c98a2c;animation:none}
@keyframes qxp{70%{box-shadow:0 0 0 9px rgba(95,143,78,0)}100%{box-shadow:0 0 0 0 rgba(95,143,78,0)}}
.qx-src{font-size:12px;color:var(--lvd)}
.qx-title{margin:22px 0 4px;font-family:'Fraunces',Georgia,serif;font-weight:300;font-size:clamp(28px,3vw,42px);line-height:1.05;letter-spacing:-.02em;color:var(--ol)}
.qx-sku{margin:0;font-size:12px;color:var(--muted);letter-spacing:.04em}
.qx-code{display:flex;align-items:baseline;gap:14px;margin:22px 0 26px}
.qx-code span{font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:var(--lvd)}
.qx-code b{font-family:'Fraunces',Georgia,serif;font-weight:400;font-size:clamp(30px,3.4vw,48px);letter-spacing:.14em;color:var(--ol);background:linear-gradient(90deg,var(--ol),var(--lvd));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;overflow-wrap:anywhere}
.qx-acts{margin-top:auto;display:flex;flex-wrap:wrap;gap:12px}
.qx-seg{display:inline-flex;align-items:center;padding:5px;border-radius:40px;background:var(--ol);color:var(--olm)}
.qx-seg>span{display:inline-flex;align-items:center;gap:7px;padding:0 12px 0 10px;font-size:12px}
.qx-seg button{border:0;cursor:pointer;min-height:38px;padding:0 16px;border-radius:30px;background:transparent;color:inherit;font:600 12px/1 'Figtree',sans-serif;transition:background .2s,color .2s}
.qx-seg button:hover,.qx-seg button:focus-visible{background:var(--olm);color:var(--ol)}
.qx-seg button:disabled{opacity:.5}
.qx-i{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.qx-stats{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:16px}
.qx-tile{padding:22px 24px;border-radius:20px;background:var(--surface);border:1px solid var(--line-soft);display:flex;flex-direction:column;gap:6px;min-width:0}
.qx-tile p{margin:0;font-size:13px;color:var(--muted)}
.qx-use{flex-direction:row;align-items:center;gap:20px}
.qx-ring{width:84px;height:84px;flex:none;transform:rotate(-90deg)}.qx-ring circle{fill:none;stroke:var(--lvm);stroke-width:12}.qx-ring .qx-ring-v{stroke:var(--lvd);stroke-linecap:round}
.qx-lab{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted)}
.qx-big{font-family:'Fraunces',Georgia,serif;font-weight:300;font-size:40px;line-height:1;color:var(--ol);display:block;margin:4px 0}.qx-big small{font-size:20px;color:var(--muted)}
.qx-mid{font-family:'Fraunces',Georgia,serif;font-weight:400;font-size:22px;line-height:1.2;color:var(--ol)}
.qx-bar{height:6px;border-radius:6px;background:var(--lvm);overflow:hidden;margin:6px 0 2px}.qx-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--lv),var(--lvd))}
.qx-meta{margin-top:auto!important;padding-top:10px;border-top:1px dashed var(--line);font-size:12px!important}
.qx-link{display:grid;gap:8px}
.qx-url{display:flex;align-items:center;gap:6px;padding:6px 6px 6px 18px;border-radius:40px;background:var(--surface);border:1px solid var(--line)}
.qx-url input{flex:1;min-width:0;border:0;background:transparent;font-size:13px;padding:0;min-height:38px;color:var(--ink)}
.qx-url input:focus{outline:none}
.qx-url button{flex:none;display:inline-flex;align-items:center;gap:7px;border:0;cursor:pointer;min-height:40px;padding:0 18px;border-radius:30px;background:var(--lvd);color:#fff;font:600 12px/1 'Figtree',sans-serif;transition:background .2s}
.qx-url button.done{background:#5f8f4e}
.qx-note{margin:0;font-size:12px;color:var(--muted)}
.qx-danger{padding:14px 20px;border-radius:16px;border:1px dashed #d9b3b3;background:rgba(253,246,245,.8)}
.qx-danger summary{cursor:pointer;font-weight:600;color:#8b3a3a;font-size:13px}.qx-danger p{margin:10px 0;font-size:13px}
.qx-danger .qx-url button{background:#8b3a3a}
@media (max-width:1100px){.qx-stats{grid-template-columns:1fr 1fr}.qx-use{grid-column:1/-1}}
@media (max-width:760px){.qx-ticket{grid-template-columns:1fr}.qx-stub:after{left:14px;right:14px;top:auto;bottom:-1px;width:auto;height:2px;background:repeating-linear-gradient(to right,rgba(233,233,242,.55) 0 7px,transparent 7px 14px)}@media (prefers-reduced-motion:reduce){.qx-state i{animation:none}.qx-qr{transition:none}}
`;

// --- Tlač QR kódu: A4 list so záluskou alebo samostatná nálepka ---
const QR_PRINT_CSS = `
@page{margin:0}*{box-sizing:border-box}
body{margin:0;font:14px/1.5 Outfit,Arial,sans-serif;color:#2c2a23;background:#fff;padding:10mm}
.qr-sheet{width:190mm;margin:0 auto;display:flex;flex-direction:column;align-items:center;gap:6mm;padding:12mm;border:1px solid #c9a44a;border-radius:8px;background:#f8f3e6}
.qr-sheet img{width:90mm;height:90mm;image-rendering:pixelated}
.qr-brand{font-size:15px;letter-spacing:5px;color:#203b32}
.qr-kind{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#7c2438}
.qr-info{width:100%;border-top:1px solid rgba(185,138,47,.6);padding-top:5mm;display:grid;grid-template-columns:1fr 1fr;gap:3mm 8mm;font-size:12px}
.qr-info b{display:block;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#7a6a44;font-weight:500}
.qr-sticker{width:80mm;height:80mm;margin:0 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2mm;border:1px dashed #c9a44a;border-radius:6mm;background:#f8f3e6;page-break-after:always}
.qr-sticker img{width:55mm;height:55mm;image-rendering:pixelated}
.qr-sticker .qr-brand{font-size:11px;letter-spacing:3px}
`;
function qrPrintHtml(kind, src, info, esc) {
  const rows = info.map(([k, v]) => `<div><b>${esc(k)}</b>${esc(String(v))}</div>`).join('');
  if (kind === 'sticker') {
    return `<section class="qr-sticker"><img src="${src}" alt="QR kód"><span class="qr-brand">ANASTASIA</span></section>`;
  }
  return `<section class="qr-sheet"><span class="qr-brand">ANASTASIA</span><span class="qr-kind">QR kód na zľavu</span><img src="${src}" alt="QR kód"><div class="qr-info">${rows}</div></section>`;
}
