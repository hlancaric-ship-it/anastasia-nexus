// Newsletter with Lucia: keep browser preview and backend renderer identical.
export function renderLuciaLetter(input) {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] ?? c));
  const asset = String(input.asset).replace(/\/+$/, '');
  const serif = "Georgia,'Times New Roman',serif", sans = 'Arial,Helvetica,sans-serif';
  const parts = String(input.bodyHtml || '<h2>Milá priateľka,</h2><p>Váš list sa zobrazí tu.</p>').split(/(?=<h2>)/i).filter(s => s.trim());
  const style = (html, dark = false) => html
    .replace(/<p>\s*<a [^>]*href="([^"]+)"[^>]*>([^<]{1,80})<\/a>\s*<\/p>/gi, (_m, href, label) => `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding:14px 0"><a data-letter-cta href="${href}" style="display:inline-block;background:${dark?'#f7f4ec':'#2f3424'};color:${dark?'#2f3424':'#f7f4ec'};padding:13px 24px;border-radius:999px;text-decoration:none;font:13px ${sans}">${label}</a></td></tr></table>`)
    .replace(/<h2>/gi, `<h2 style="font-family:${serif};font-size:32px;line-height:1.15;font-weight:400;color:${dark?'#f7f4ec':'#2f3424'};margin:0 0 20px">`)
    .replace(/<h3>/gi, `<h3 style="font-family:${serif};font-size:23px;font-weight:400;margin:18px 0 12px">`)
    .replace(/<p>/gi, '<p style="margin:0 0 16px">')
    .replace(/<img /gi, '<img style="display:block;max-width:100%;height:auto;border-radius:16px" ')
    .replace(/<a (?!data-letter-cta)/gi, `<a style="color:${dark?'#e4c688':'#8b6a36'}" `);
  const panels = parts.slice(1).map((part, i) => {
    const dark = i % 3 === 2, bg = dark?'#2f3424':i%3===0?'#eeebf1':'#f7f4ec';
    return `<tr><td colspan="2" bgcolor="${bg}" style="padding:30px 28px;background:${bg};color:${dark?'#f7f4ec':'#2f3424'};font:16px/1.7 ${sans}">${style(part,dark)}</td></tr>`;
  }).join('');
  const unsubscribe = input.unsubscribeUrl
    ? `<a href="${esc(input.unsubscribeUrl)}" style="color:#55534c">Odhlásiť sa z odberu</a>`
    : 'Toto je testovacia správa.';
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(input.subject)}</title>
<style>@media(max-width:520px){.letter-copy,.letter-portrait{display:block!important;width:100%!important;box-sizing:border-box}.letter-portrait img{max-height:340px;object-position:center 28%}.letter-copy{padding:28px!important}}</style></head>
<body style="margin:0;background:#2f3424"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#2f3424"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#f7f4ec">
<tr><td colspan="2" align="center" style="padding:26px 22px 22px;border-bottom:1px solid #ccb37d">
<img src="${asset}/assets/anastasia-oz-logo.png" alt="ANASTASIA OZ" width="150" height="150" style="display:block;width:150px;height:150px;object-fit:contain;margin:0 auto 10px">
<div style="font:9px ${sans};letter-spacing:3px;color:#a17a3d;margin-top:8px">LIGHT FOR THE FUTURE</div></td></tr>
<tr><td class="letter-copy" width="52%" valign="top" style="width:52%;padding:32px 22px 24px 28px;color:#2f3424;font:16px/1.7 ${sans}">${style(parts[0])}</td>
<td class="letter-portrait" width="48%" valign="top" style="width:48%;padding:20px 18px 0 0"><img src="${asset}/assets/lucia-portrait.jpg" alt="Lucia Rogožanová" width="310" style="display:block;width:100%;max-width:310px;height:430px;object-fit:cover;border-radius:180px 180px 0 0"></td></tr>
${panels}
<tr><td colspan="2" align="center" style="padding:24px 28px;border-top:1px solid #ccb37d;font:11px/1.7 ${sans};color:#68665e">
<div style="font:16px ${sans};letter-spacing:3px;color:#2f3424;margin-bottom:12px">ANASTASIA OZ</div>
<p style="margin:0 0 8px">Tento e-mail ste dostali, pretože ste súčasťou komunity ANASTASIA.</p>${unsubscribe}
<p style="margin:12px 0 0">LUCRAT spol. s r.o. · IČO 36652164 · anastasiaoz.eu · info@anastasiaoz.eu</p></td></tr>
</table></td></tr></table></body></html>`;
}
