// Náhľad a tlač darčekového poukazu v rovnakom dizajne ako na webe (storefront .gv-card):
// olivová karta, zlatá fólia, levanduľový svit, odtrhávací ústrižok s kódom. Písma Fraunces + Figtree.
//
// Poukaz NEPOZNÁ hodnotu ani platnosť – tie overuje backend. Admin vidí maskovaný kód;
// plný kód putuje obdarovanej e-mailom.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const VOUCHER_FONTS =
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;1,9..144,300;1,9..144,400&family=Figtree:wght@300;400;500&display=swap';
/** Logo značky v adresári administrácie (dist/logo-mark.png). */
export const VOUCHER_LOGO = './logo-mark.png';
/** Absolútna adresa loga – funguje aj v tlačovom okne (document je mimo administrácie). */
const logoUrl = () => {
  try { return new URL(VOUCHER_LOGO, location.origin).href; } catch { return VOUCHER_LOGO; }
};

const eur = (n) => new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR' }).format(Number(n || 0));
const date = (d) => (d ? new Intl.DateTimeFormat('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d)) : '');
/** Iba číslice (a desatinná čiarka) – hodnota je veľkým Fraunces. */
const digits = (n) => String(Number(n || 0)).replace(/[^\d.,]/g, '');

export const VOUCHER_CSS = `
@import url('${VOUCHER_FONTS}');
*{box-sizing:border-box}
body{margin:0;font:14px/1.5 Figtree,Arial,sans-serif;color:#2c2a23;background:#f1efe6;padding:24px}
.gv{position:relative;width:min(580px,100%);margin:0 auto;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.gv-card{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 150px;aspect-ratio:1.6;border-radius:28px 28px 28px 0;color:#F3EEDC;
  background:radial-gradient(70% 90% at 85% 0%,rgba(167,165,207,.45),transparent 60%),radial-gradient(80% 80% at 0% 100%,#4a5238 0%,transparent 70%),linear-gradient(150deg,#3a4030 0%,#2F3424 55%,#22261a 100%);
  box-shadow:0 40px 70px -40px rgba(34,38,26,.85),0 0 0 1px rgba(201,165,92,.35) inset;overflow:hidden;
  -webkit-mask:radial-gradient(circle at calc(100% - 150px) 0,transparent 15px,#000 16px) top/100% 51% no-repeat,radial-gradient(circle at calc(100% - 150px) 100%,transparent 15px,#000 16px) bottom/100% 51% no-repeat;
  mask:radial-gradient(circle at calc(100% - 150px) 0,transparent 15px,#000 16px) top/100% 51% no-repeat,radial-gradient(circle at calc(100% - 150px) 100%,transparent 15px,#000 16px) bottom/100% 51% no-repeat}
.gv-card:after{content:"";position:absolute;inset:14px;border-radius:18px 18px 18px 0;border:1px solid rgba(201,165,92,.4);pointer-events:none}
.gv-mark{position:absolute;width:420px;height:420px;left:-120px;bottom:-170px;opacity:.13;object-fit:contain;filter:sepia(1) saturate(2.4) hue-rotate(-12deg) brightness(1.6);pointer-events:none}
.gv-main{position:relative;display:flex;flex-direction:column;justify-content:center;gap:4px;padding:34px 30px 34px 40px;min-width:0}
.gv-kick{font:500 9px/1 Figtree,Arial,sans-serif;letter-spacing:.34em;text-transform:uppercase;color:#C9A55C}
.gv-title{margin:14px 0 0;font:300 26px/1 Fraunces,Georgia,serif;letter-spacing:-.01em;color:#F3EEDC}.gv-title em{font-style:italic;color:#D9D7EE}
.gv-value{display:flex;align-items:flex-start;gap:6px;margin:6px 0 2px;font:300 104px/.95 Fraunces,Georgia,serif;letter-spacing:-.04em;color:#C9A55C;
  background:linear-gradient(100deg,#8f7238 0%,#E9D6A3 30%,#C9A55C 70%,#8f7238 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.gv-value small{font:italic 300 34px/1 Fraunces,Georgia,serif;margin-top:14px}
.gv-to{margin:0;font:300 14px/1.4 Figtree,Arial,sans-serif;color:rgba(243,238,220,.7)}.gv-to b{font:italic 400 19px/1.2 Fraunces,Georgia,serif;color:#F3EEDC;overflow-wrap:anywhere}
.gv-msg{margin:6px 0 0;max-width:30ch;font:italic 300 13px/1.45 Fraunces,Georgia,serif;color:rgba(233,233,242,.75);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.gv-stub{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:30px 16px;text-align:center;background:linear-gradient(180deg,rgba(167,165,207,.22),rgba(167,165,207,.08));border-left:2px dashed rgba(233,233,242,.35)}
.gv-stub span{font:500 9px/1 Figtree,Arial,sans-serif;letter-spacing:.3em;text-transform:uppercase;color:#C9A55C;writing-mode:vertical-rl;rotate:180deg}
.gv-stub b{font:400 13px/1 Figtree,Arial,sans-serif;letter-spacing:.2em;color:#F3EEDC;writing-mode:vertical-rl;rotate:180deg}
.gv-stub small{font:300 10px/1.4 Figtree,Arial,sans-serif;color:rgba(243,238,220,.6)}
.gv-note{margin:12px auto 0;max-width:580px;text-align:center;font-size:12px;color:#5f5a48}
@container (max-width:520px){.gv-card{grid-template-columns:1fr;aspect-ratio:auto;-webkit-mask:none;mask:none}.gv-main{padding:30px 24px 22px}.gv-value{font-size:80px}.gv-stub{flex-direction:row;flex-wrap:wrap;border-left:0;border-top:2px dashed rgba(233,233,242,.35);padding:16px 22px 20px}.gv-stub span,.gv-stub b{writing-mode:horizontal-tb;rotate:none}.gv-stub small{flex-basis:100%}}
.gv-wrap{container-type:inline-size}
@media print{body{background:#fff;padding:0}.gv-card{box-shadow:none}}
`;

/**
 * HTML náhľadu poukazu.
 * @param {{value:number, currency?:string, code?:string, expires_at?:string, recipient_name?:string,
 *          message?:string, delivery_date?:string, note?:string}} v
 */
export function voucherHtml(v) {
  const value = digits(v?.value);
  const cur = String(v?.currency || 'eur').toLowerCase() === 'eur' ? '€' : String(v?.currency).toUpperCase();
  const expires = date(v?.expires_at);
  return `<div class="gv-wrap"><section class="gv"><div class="gv-card">
    <img class="gv-mark" src="${esc(v?.logo ?? logoUrl())}" alt="" aria-hidden="true">
    <div class="gv-main">
      <span class="gv-kick">ANASTASIA · Light for the Future</span>
      <p class="gv-title">Darčekový <em>poukaz</em></p>
      <div class="gv-value"><span>${esc(value)}</span><small>${esc(cur)}</small></div>
      <p class="gv-to">pre <b>${esc(v?.recipient_name || 'vašich blízkych')}</b></p>
      ${v?.message ? `<p class="gv-msg">${esc(v.message)}</p>` : ''}
    </div>
    <div class="gv-stub"><span>Kód poukazu</span><b>${esc(v?.code || '—')}</b><small>${expires ? `Platí do ${esc(expires)}` : 'Platnosť a hodnotu potvrdzuje obchod.'}</small></div>
  </div></section>${v?.note ? `<p class="gv-note">${esc(v.note)}</p>` : ''}</div>`;
}

/** Náhľad viacerých poukazov (napr. z objednávky s viacerými obdarovanými). */
export function voucherListHtml(list, note) {
  return `<div style="display:flex;flex-direction:column;gap:14px">${(list || []).map((v) => voucherHtml(v)).join('')}</div>${note ? `<p class="gv-note">${esc(note)}</p>` : ''}`;
}
