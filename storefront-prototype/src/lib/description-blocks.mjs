// Rozdelí pôvodný popis produktu na prehľadné odstavce. Text zostáva 1:1, mení sa len členenie.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Označenia, pred ktorými v pôvodných popisoch začína nová časť.
const LABELS = ['ZLOŽENIE','Zloženie','Typ','Účinky','Vodná fáza','Olejová fáza','Esenciálne oleje','Esenciálny olej','Spôsob prípravy','Spôsob použitia','Použitie','Dávkovanie','Uchovávajte','Upozornenie','Dátum prípravy','Dátum spotreby','Objem','Obsah','Balenie'];
const LABEL_RE = new RegExp(`(^|[\\s.)])(${LABELS.map(l => l.replace(/\s/g, '\\s+')).join('|')})(\\s*:)`, 'g');
const HEAD_RE = new RegExp(`^(${LABELS.map(l => l.replace(/\s/g, '\\s+')).join('|')})\\s*:\\s*`);
const MAX = 420;

const splitLong = text => {
  if (text.length <= MAX) return [text];
  const sentences = text.match(/[^.!?…]+(?:[.!?…]+["“”)]*\s*|$)/g) || [text];
  const out = [];
  let buf = '';
  for (const s of sentences) {
    if (buf && (buf + s).length > MAX) { out.push(buf.trim()); buf = ''; }
    buf += s;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
};

export function descriptionParts(source) {
  const text = String(source ?? '').replace(/\r/g, '').trim();
  if (!text) return [];
  const marked = text.replace(LABEL_RE, (m, pre, label, colon) => `${pre}\n\n${label}${colon}`);
  const parts = [];
  for (const raw of marked.split(/\n\s*\n/)) {
    const chunk = raw.replace(/\s+/g, ' ').trim();
    if (!chunk) continue;
    const head = chunk.match(HEAD_RE);
    const label = head ? head[1].replace(/\s+/g, ' ') : '';
    const body = head ? chunk.slice(head[0].length) : chunk;
    splitLong(body).forEach((t, i) => parts.push({ label: i === 0 ? label : '', text: t }));
  }
  return parts;
}

export function descriptionHtml(source) {
  return descriptionParts(source).map(({ label, text }) => `<p>${label ? `<strong>${esc(label)}:</strong> ` : ''}${esc(text)}</p>`).join('');
}
