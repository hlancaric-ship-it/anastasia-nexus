// Náhľad a tlač darčekového poukazu v značke ANASTASIA: krémový papier, zlatá linka,
// bordó akcent, hodnota veľkým EB Garamond (iba číslice), texty Outfit.
//
// Poukaz NEPOZNÁ hodnotu ani platnosť – tie overuje backend. Admin vidí maskovaný kód;
// plný kód putuje obdarovanej e-mailom.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const VOUCHER_FONTS =
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&family=EB+Garamond:wght@500;600&display=swap';
/** Logo značky v adresári administrácie (dist/logo-mark.png). */
export const VOUCHER_LOGO = './logo-mark.png';
/** Absolútna adresa loga – funguje aj v tlačovom okne (document je mimo administrácie). */
const logoUrl = () => {
  try { return new URL(VOUCHER_LOGO, location.origin).href; } catch { return VOUCHER_LOGO; }
};

const eur = (n) => new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR' }).format(Number(n || 0));
const date = (d) => (d ? new Intl.DateTimeFormat('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d)) : '');
/** Iba číslice (a desatinná čiarka) – hodnota je v EB Garamond. */
const digits = (n) => String(Number(n || 0)).replace(/[^\d.,]/g, '');

export const VOUCHER_CSS = `
@import url('${VOUCHER_FONTS}');
*{box-sizing:border-box}
body{margin:0;font:14px/1.5 Outfit,Arial,sans-serif;color:#2c2a23;background:#efe9dc;padding:16px}
.voucher{width:340px;min-height:190px;margin:0 auto;background:#f8f3e6;border:1px solid #c9a44a;border-radius:6px;
  padding:22px 24px;position:relative;box-shadow:0 10px 30px rgba(70,55,20,.18)}
.voucher:before{content:"";position:absolute;inset:6px;border:1px solid rgba(185,138,47,.45);border-radius:3px;pointer-events:none}
.voucher-head{display:flex;align-items:center;gap:10px}
.voucher-head img{width:30px;height:30px;object-fit:contain}
.voucher-brand{font-size:15px;letter-spacing:5px;font-weight:500;color:#203b32}
.voucher-kind{margin-top:14px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#7c2438}
.voucher-value{font-family:'EB Garamond',Georgia,serif;font-size:54px;line-height:1.05;color:#203b32;margin-top:2px}
.voucher-value .cur{font-size:22px;margin-left:6px;color:#7c2438}
.voucher-meta{display:flex;justify-content:space-between;gap:12px;margin-top:16px;padding-top:12px;border-top:1px solid rgba(185,138,47,.5);font-size:12px}
.voucher-meta b{display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#7a6a44;font-weight:500;margin-bottom:3px}
.voucher-code{font-family:'EB Garamond',Georgia,serif;font-size:20px;letter-spacing:1px;color:#203b32}
.voucher-note{margin-top:12px;font-size:12px;color:#5f5334}
@media print{body{background:#fff;padding:0}.voucher{box-shadow:none;margin:0 auto}}
`;

/**
 * HTML náhľadu poukazu.
 * @param {{value:number, currency?:string, code?:string, expires_at?:string, recipient_name?:string,
 *          message?:string, delivery_date?:string, note?:string}} v
 */
export function voucherHtml(v) {
  const value = digits(v?.value);
  const cur = String(v?.currency || 'eur').toUpperCase();
  return `<section class="voucher">
    <div class="voucher-head"><img src="${esc(v?.logo ?? logoUrl())}" alt=""><span class="voucher-brand">ANASTASIA</span></div>
    <div class="voucher-kind">Darčekový poukaz</div>
    <div class="voucher-value">${esc(value)}<span class="cur">${esc(cur)}</span></div>
    <div class="voucher-meta">
      <div><b>Kód poukazu</b><span class="voucher-code">${esc(v?.code || '—')}</span></div>
      <div style="text-align:right"><b>Platí do</b>${esc(date(v?.expires_at) || '—')}</div>
    </div>
    ${v?.recipient_name ? `<div class="voucher-note">Pre: ${esc(v.recipient_name)}</div>` : ''}
    ${v?.message ? `<div class="voucher-note">${esc(v.message)}</div>` : ''}
    ${v?.note ? `<div class="voucher-note">${esc(v.note)}</div>` : ''}
  </section>`;
}

/** Náhľad viacerých poukazov (napr. z objednávky s viacerými obdarovanými). */
export function voucherListHtml(list, note) {
  return `<div style="display:flex;flex-direction:column;gap:14px">${(list || []).map((v) => voucherHtml(v)).join('')}</div>${note ? `<p class="voucher-note" style="text-align:center;max-width:340px;margin:12px auto 0">${esc(note)}</p>` : ''}`;
}
