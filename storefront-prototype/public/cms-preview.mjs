// Náhľad v admine (iframe): zvýrazní na stránke text poľa, ktoré sa práve upravuje,
// a pri písaní ukáže nové znenie. Správy prijíma len z adminu tohto webu.
const ADMIN_ORIGIN = location.origin.replace(/^(https?:\/\/[^.]+)/, '$1-admin');
const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;
const norm = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
let active = null;
let original = '';

function findElement(text) {
  const needle = norm(text).slice(0, 60);
  if (needle.length < 2) return null;
  let best = null;
  for (const el of document.body.querySelectorAll('h1,h2,h3,h4,h5,p,li,a,span,button,figcaption,blockquote,div,label,small,strong,em')) {
    if (el.closest('[hidden],script,style')) continue;
    const t = norm(el.textContent);
    if (!t.includes(needle)) continue;
    if (!best || t.length < norm(best.textContent).length) best = el;
  }
  return best;
}

function clear() {
  if (!active) return;
  active.style.outline = '';
  active.style.outlineOffset = '';
  active.style.backgroundColor = '';
  active = null;
}

if (window.parent !== window) {
  document.documentElement.classList.add('cms-preview');
  window.addEventListener('message', (ev) => {
    if (ev.origin !== ADMIN_ORIGIN && !LOCAL.test(ev.origin)) return;
    const d = ev.data;
    if (!d || d.type !== 'ana-cms-field') return;
    try {
      if (d.action === 'focus') {
        clear();
        const el = findElement(d.text);
        if (!el) { ev.source?.postMessage({ type: 'ana-cms-found', found: false }, ev.origin); return; }
        active = el;
        original = el.innerHTML;
        el.style.outline = '3px solid #9C86C2';
        el.style.outlineOffset = '4px';
        el.style.backgroundColor = 'rgba(232,225,241,.55)';
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        ev.source?.postMessage({ type: 'ana-cms-found', found: true }, ev.origin);
      } else if (d.action === 'input' && active) {
        // Len náhľad: text sa nikam neukladá, po obnovení stránky platí uložené znenie.
        if (d.rich) active.innerHTML = String(d.value || '').replace(/<(script|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/\son\w+="[^"]*"/gi, '');
        else active.textContent = String(d.value || '');
      } else if (d.action === 'reset' && active) {
        active.innerHTML = original;
      }
    } catch {}
  });
}
