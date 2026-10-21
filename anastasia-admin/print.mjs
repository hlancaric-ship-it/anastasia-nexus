// Tlač adresného štítku (A6) a dodacieho listu (A4) z objednávky. Bez dopravcu: obsah skladá admin
// z údajov objednávky, tlač rieši prehliadač (aj „Uložiť ako PDF“). Štítok od konkrétneho dopravcu
// (čiarový kód, číslo zásielky) doplní konektor dopravcu – vtedy sa použije jeho PDF.
export const SENDER = {
  name: 'Lucrat spol. s r.o. – ANASTASIA',
  street: 'Sokolská 88',
  city: '960 01 Zvolen',
  country: 'Slovensko',
  phone: '+421 905 363 778',
  email: 'zdravysvet@anastasiaoz.eu',
};

const COUNTRY = { sk: 'Slovensko', cz: 'Česko' };
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR' }).format(Number(n || 0));
const date = (d) => (d ? new Date(d).toLocaleDateString('sk-SK') : '');
const num = (o) => o.metadata?.legacy_customer_migration?.number || o.display_id || '';

function addressLines(a = {}) {
  return [
    [a.first_name, a.last_name].filter(Boolean).join(' '),
    a.company,
    a.address_1,
    a.address_2,
    [a.postal_code, a.city].filter(Boolean).join(' '),
    COUNTRY[String(a.country_code || '').toLowerCase()] || String(a.country_code || '').toUpperCase(),
  ].filter(Boolean);
}

const isCod = (o) => (o.payment_collections || []).some((pc) => (pc.payment_sessions || pc.payments || []).some((p) => /cod|dobier/i.test(String(p.provider_id || ''))));

function labelHtml(o) {
  const a = o.shipping_address || {};
  const cod = isCod(o) && !['captured', 'paid'].includes(o.payment_status);
  return `<section class="label">
    <div class="from"><b>Odosielateľ</b>${[SENDER.name, SENDER.street, SENDER.city, SENDER.phone].map(h).join('<br>')}</div>
    <div class="to"><b>Príjemca</b><div class="addr">${addressLines(a).map(h).join('<br>')}</div>
      ${a.phone ? `<div class="tel">Tel.: ${h(a.phone)}</div>` : ''}</div>
    <div class="meta"><span>Objednávka <b>#${h(num(o))}</b></span><span>${h(date(o.created_at))}</span>
      <span>${h((o.shipping_methods || []).map((m) => m.name).join(', ') || 'Kuriér')}</span>
      ${cod ? `<span class="cod">DOBIERKA ${h(eur(o.total))}</span>` : ''}</div>
  </section>`;
}

function slipHtml(o) {
  const a = o.shipping_address || {}, b = o.billing_address || a;
  const items = o.items || [];
  return `<section class="slip">
    <header><div><h1>Dodací list</h1><p>Objednávka #${h(num(o))} · ${h(date(o.created_at))}</p></div>
      <div class="brand">ANASTASIA<small>Light for the Future</small></div></header>
    <div class="cols"><div><b>Dodávateľ</b>${[SENDER.name, SENDER.street, SENDER.city, SENDER.email, SENDER.phone].map(h).join('<br>')}</div>
      <div><b>Doručovacia adresa</b>${addressLines(a).map(h).join('<br>')}</div>
      <div><b>Fakturačná adresa</b>${addressLines(b).map(h).join('<br>')}${o.email ? `<br>${h(o.email)}` : ''}</div></div>
    <table><thead><tr><th>Položka</th><th>Kód</th><th class="r">Ks</th><th class="r">Cena/ks</th><th class="r">Spolu</th></tr></thead><tbody>
      ${items.map((i) => `<tr><td>${h(i.title || i.product_title)}${i.variant_title && i.variant_title !== 'Default' ? ` <small>${h(i.variant_title)}</small>` : ''}</td><td>${h(i.variant_sku || '')}</td><td class="r">${h(i.quantity)}</td><td class="r">${eur(i.unit_price)}</td><td class="r">${eur(i.total ?? Number(i.unit_price) * Number(i.quantity))}</td></tr>`).join('')}
      ${(o.shipping_methods || []).map((m) => `<tr><td>Doprava: ${h(m.name)}</td><td></td><td class="r">1</td><td class="r">${eur(m.amount)}</td><td class="r">${eur(m.total ?? m.amount)}</td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan="4" class="r">Spolu s DPH</td><td class="r"><b>${eur(o.total)}</b></td></tr></tfoot></table>
    <p class="note">Ďakujeme za nákup. Pri vrátení tovaru postupujte podľa obchodných podmienok na webe ANASTASIA.</p>
  </section>`;
}

const CSS = `@page{margin:0}*{box-sizing:border-box}body{margin:0;font:13px/1.45 Arial,Helvetica,sans-serif;color:#111}
.label{width:105mm;height:148mm;padding:8mm;page-break-after:always;display:flex;flex-direction:column;gap:6mm;border:1px dashed #bbb}
.label b{display:block;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#555;margin-bottom:2mm}
.from{font-size:11px}.to{flex:1;border:2px solid #111;border-radius:3mm;padding:5mm}.addr{font-size:18px;line-height:1.35;font-weight:700}
.tel{margin-top:3mm;font-size:13px}.meta{display:flex;flex-wrap:wrap;gap:2mm 5mm;font-size:12px}.cod{width:100%;font-size:17px;font-weight:700;border:2px solid #111;padding:2mm;text-align:center}
.slip{width:210mm;min-height:297mm;padding:16mm;page-break-after:always}.slip header{display:flex;justify-content:space-between;border-bottom:2px solid #203b32;padding-bottom:5mm}
.slip h1{margin:0;font-size:22px}.brand{font-size:18px;letter-spacing:.3em;text-align:right;color:#203b32}.brand small{display:block;font-size:9px;letter-spacing:.2em}
.cols{display:grid;grid-template-columns:repeat(3,1fr);gap:8mm;margin:8mm 0}.cols b{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#555;margin-bottom:2mm}
table{width:100%;border-collapse:collapse}th,td{padding:2.5mm 2mm;border-bottom:1px solid #ddd;text-align:left}th{background:#eef3e8;font-size:11px}.r{text-align:right}tfoot td{border:0;font-size:14px}
.note{margin-top:10mm;color:#555;font-size:11px}@media screen{body{background:#eee;padding:10mm}.label,.slip{background:#fff;margin:0 auto 10mm}}`;

// Otvorí okno s tlačovou stránkou. Okno sa otvára synchrónne v kliknutí (inak ho prehliadač zablokuje),
// obsah sa doplní po načítaní objednávok.
export function openPrintWindow(title) {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) throw new Error('Prehliadač zablokoval nové okno. Povoľte vyskakovacie okná pre administráciu.');
  w.document.write(`<!doctype html><html lang="sk"><head><meta charset="utf-8"><title>${h(title)}</title><style>${CSS}</style></head><body><p style="font:14px Arial">Pripravujem…</p></body></html>`);
  w.document.close();
  return w;
}

export function fillPrintWindow(w, orders, kind) {
  w.document.body.innerHTML = orders.map((o) => (kind === 'slip' ? slipHtml(o) : labelHtml(o))).join('');
  setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 250);
}

export const PRINT_FIELDS = 'id,display_id,email,total,currency_code,created_at,payment_status,metadata,*items,*shipping_address,*billing_address,*shipping_methods,*payment_collections,*payment_collections.payment_sessions';
