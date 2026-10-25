// Koncept úvodu ANASTASIA — pohyb riadený scrollom, bez knižníc
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mobile = () => innerWidth <= 760;

// manifest: rozdelenie na slová
const words = document.querySelector('[data-words]');
if (words) {
  const hl = new Set(['Zdravý', 'svet', 'ideál,']);
  words.innerHTML = words.textContent.trim().split(/\s+/).map(w => `<span class="kc-w${hl.has(w) ? ' hl' : ''}">${w}</span>`).join(' ');
}
const wordEls = [...document.querySelectorAll('.kc-w')];

const open = document.querySelector('[data-open]');
const drop = document.querySelector('[data-drop]');
const road = document.querySelector('[data-road]');
const track = document.querySelector('[data-track]');
const bar = document.querySelector('[data-bar]');
const mani = document.querySelector('[data-mani]');
const ai = document.querySelector('[data-ai]');
const who = document.querySelector('[data-who]');
const cards = [...document.querySelectorAll('.kc-sc')];
const count = document.querySelector('[data-count]');

function sizeRoad() {
  if (!road || !track) return;
  if (mobile() || reduce) { road.style.removeProperty('--road-h'); track.style.transform = ''; return; }
  const dist = Math.max(0, track.scrollWidth - innerWidth);
  road.style.setProperty('--road-h', `${innerHeight + dist}px`);
}

function frame() {
  const vh = innerHeight;
  // 1 · kvapka rastie do celej obrazovky
  if (open && drop && !reduce) {
    const r = open.getBoundingClientRect();
    const p = clamp(-r.top / (r.height - vh));
    const e = 1 - Math.pow(1 - clamp(p / .7), 3);
    // desktop: kvapka začína tesne pod podtitulom a celá sa zmestí na obrazovku
    const kick = open.querySelector('.kc-open__kicker');
    const top0 = kick ? kick.offsetTop + kick.offsetHeight + 40 : vh * .55;
    const w0 = mobile() ? Math.min(innerWidth * .40, 260) : Math.max(120, Math.min(innerWidth * .18, 260, (vh - top0 - 28) * 3 / 4));
    const h0 = w0 * 4 / 3;
    drop.style.width = `${w0 + (innerWidth - w0) * e}px`;
    drop.style.height = `${h0 + (vh - h0) * e}px`;
    drop.style.aspectRatio = 'auto';
    const rad = 999 * (1 - e);
    drop.style.borderRadius = `${rad}px ${rad}px ${rad}px 0`;
    open.style.setProperty('--p', e.toFixed(3));
    const dy0 = mobile() ? vh * .26 : top0 + h0 / 2 - vh / 2;
    drop.style.setProperty('--dy', `${(dy0 * (1 - e)).toFixed(1)}px`);
    drop.style.setProperty('--veil', clamp((p - .45) / .3).toFixed(3));
    drop.style.setProperty('--claim', clamp((p - .55) / .3).toFixed(3));
  }
  // 2 · slová sa rozsvecujú podľa postupu v pripnutej sekcii
  if (mani) {
    const r = mani.getBoundingClientRect();
    const p = reduce ? 1 : clamp(-r.top / Math.max(1, r.height - vh * 1.1) * 1.15);
    const lit = Math.round(p * wordEls.length * 1.05);
    wordEls.forEach((w, i) => w.classList.toggle('on', i < lit));
    mani.style.setProperty('--mf', clamp((p - .8) / .2).toFixed(3));
  }
  // 3 · horizontálna cesta
  if (road && track && !mobile() && !reduce) {
    const r = road.getBoundingClientRect();
    const dist = Math.max(0, track.scrollWidth - innerWidth);
    const p = clamp(-r.top / Math.max(1, r.height - vh));
    track.style.transform = `translate3d(${-dist * p}px,0,0)`;
    bar?.parentElement.style.setProperty('--rp', p.toFixed(3));
    bar && (bar.style.transform = `scaleX(${p.toFixed(3)})`);
  }
  // 4 · AI: písmená s videom sa priblížia, potom sa ukáže text
  if (ai && !reduce) {
    const r = ai.getBoundingClientRect();
    const p = clamp(-r.top / Math.max(1, r.height - vh));
    const z = clamp(p / .6);
    ai.style.setProperty('--as', (1 + Math.pow(z, 3) * 14).toFixed(3));
    ai.style.setProperty('--ao', clamp(1 - (p - .45) / .15).toFixed(3));
    ai.style.setProperty('--ai', clamp((p - .58) / .2).toFixed(3));
  }
  // 5 · Lucia: medailón sa otvorí, prstence sa točia, malé fotky plávajú
  if (who && !reduce) {
    const r = who.getBoundingClientRect();
    const p = clamp((vh - r.top) / (vh + r.height));
    const o = clamp((vh - r.top) / (vh * .9));
    who.style.setProperty('--ci', `${(14 * (1 - o)).toFixed(2)}%`);
    who.style.setProperty('--ms', (1.1 - .1 * p).toFixed(3));
    who.style.setProperty('--my', `${(-40 * p).toFixed(1)}px`);
    who.style.setProperty('--rr', `${(p * 70).toFixed(1)}deg`);
    who.style.setProperty('--ya', `${(120 - 320 * p).toFixed(1)}px`);
    who.style.setProperty('--yb', `${(-80 + 240 * p).toFixed(1)}px`);
    who.style.setProperty('--gx', `${((.5 - p) * 30).toFixed(1)}vw`);
  }
  // 6 · karty sa pri prekrytí zmenšia
  if (!reduce) cards.forEach((c, i) => {
    const next = cards[i + 1];
    if (!next) return;
    const top = parseFloat(getComputedStyle(c).top) || 0;
    const k = clamp((vh - next.getBoundingClientRect().top) / (vh - top));
    c.style.setProperty('--sc', (1 - k * .06).toFixed(4));
  });
}

let ticking = false;
const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { frame(); ticking = false; }); } };
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', () => { sizeRoad(); frame(); });
addEventListener('load', () => { sizeRoad(); frame(); });
sizeRoad(); frame();

// počítadlo 30
if (count && !reduce) {
  let done = false;
  new IntersectionObserver(([en], io) => {
    if (!en.isIntersecting || done) return;
    done = true; io.disconnect();
    const end = Number(count.dataset.count); const t0 = performance.now();
    const step = t => { const k = clamp((t - t0) / 1600); count.textContent = Math.round(end * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
    count.textContent = '0'; requestAnimationFrame(step);
  }, { threshold: .5 }).observe(count);
}

// odhaľovanie blokov
const rv = document.querySelectorAll('.kc-who__copy > *, .kc-offer__head > *, .kc-gift__copy > *');
if (!reduce) {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -10% 0px' });
  rv.forEach((el, i) => { el.setAttribute('data-rv', ''); el.style.transitionDelay = `${(i % 4) * 80}ms`; io.observe(el); });
}

// ponuka: plávajúca kvapka s fotkou za kurzorom
const float = document.querySelector('[data-float]');
if (float && matchMedia('(hover: hover)').matches) {
  const img = float.querySelector('img');
  document.querySelectorAll('.kc-list a').forEach(a => {
    a.addEventListener('mouseenter', () => { const src = a.dataset.img; if (!src) return; img.src = src; float.classList.add('on'); });
    a.addEventListener('mouseleave', () => float.classList.remove('on'));
    a.addEventListener('mousemove', e => { float.style.setProperty('--fx', `${e.clientX + 30}px`); float.style.setProperty('--fy', `${e.clientY - 180}px`); });
  });
}

// poukaz: náklon
const tilt = document.querySelector('[data-tilt]');
if (tilt && !reduce && matchMedia('(hover: hover)').matches) {
  tilt.addEventListener('mousemove', e => {
    const r = tilt.getBoundingClientRect();
    tilt.style.setProperty('--rx', `${((e.clientX - r.left) / r.width - .5) * 14}deg`);
    tilt.style.setProperty('--ry', `${-((e.clientY - r.top) / r.height - .5) * 12}deg`);
  });
  tilt.addEventListener('mouseleave', () => { tilt.style.setProperty('--rx', '0deg'); tilt.style.setProperty('--ry', '0deg'); });
}

// úvod: kategórie a značky sa striedajú – rozsvieti sa, prejde zlatý odlesk, zmizne a ďalšia sa objaví inde
const preCats = [...document.querySelectorAll('.kc-pre__cat')];
const preBrands = [...document.querySelectorAll('.kc-pre__brand')];
// kategória, značka, kategória… – kategórie sú hlavné, značky medzi nimi
const pre = preCats.flatMap((c, i) => preBrands[i] ? [c, preBrands[i]] : [c]);
if (pre.length && !reduce) {
  const SLOTS = [[22, 12], [78, 12], [23, 60], [77, 60], [21, 72], [79, 73], [77, 86]];
  const SLOTS_M = [[32, 22], [68, 26], [50, 24], [36, 27], [64, 21]];
  let i = 0, last = -1;
  const show = () => {
    const slots = mobile() ? SLOTS_M : SLOTS;
    let s; do { s = Math.floor(Math.random() * slots.length); } while (s === last);
    last = s;
    const el = pre[i++ % pre.length];
    el.classList.remove('on');
    el.style.setProperty('--x', slots[s][0]);
    el.style.setProperty('--y', slots[s][1]);
    void el.offsetWidth;
    el.classList.add('on');
  };
  pre.forEach(el => el.addEventListener('animationend', e => { if (e.animationName === 'kc-cycle') el.classList.remove('on'); }));
  setTimeout(() => { show(); setInterval(() => { if (document.visibilityState === 'visible') show(); }, 3800); }, 1200);
}
