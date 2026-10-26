// Koncept úvodu ANASTASIA — pohyb riadený scrollom, bez knižníc
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mobile = () => innerWidth <= 760;

// manifest: rozdelenie na slová v jazyku stránky (preklad celej vety, nie jednotlivých slov)
import {DICT, getLang} from '/i18n.mjs';
const words = document.querySelector('[data-words]');
const HL = /^(zdravý|svet|ideál|healthy|world|ideal|здоровый|мир|идеал)$/i;
let wordEls = [];
function splitWords(lang) {
  if (!words) return;
  if (!words.dataset.src) words.dataset.src = words.textContent.trim();
  const src = words.dataset.src;
  const entry = DICT[src];
  const text = lang === 'en' && entry?.[0] ? entry[0] : lang === 'ru' && entry?.[1] ? entry[1] : src;
  words.innerHTML = text.split(/\s+/).map(w => `<span class="kc-w${HL.test(w.replace(/[^\p{L}]/gu, '')) ? ' hl' : ''}">${w}</span>`).join(' ');
  wordEls = [...words.querySelectorAll('.kc-w')];
}
splitWords(getLang());
document.addEventListener('anastasia:lang', e => { splitWords(e.detail); litCount = -1; dispatchEvent(new Event('scroll')); });

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
  if (mobile() || reduce) { road.style.removeProperty('--road-h'); track.style.transform = ''; last.delete(track); return; }
  const dist = Math.max(0, track.scrollWidth - innerWidth);
  road.style.setProperty('--road-h', `${innerHeight + dist}px`);
}

// Na telefóne sa výška okna mení pri skrole (lišta Safari) – výšku berieme len pri zmene šírky, inak by úvod poskakoval.
let stableVh = innerHeight, stableW = innerWidth;
const cardTops = new Map();
// Zápis štýlu len pri zmene hodnoty – inak by telefón prepočítaval layout každý snímok a skrol by trhal.
const last = new WeakMap();
function put(el, prop, val) {
  if (!el) return;
  let m = last.get(el); if (!m) last.set(el, m = {});
  if (m[prop] === val) return;
  m[prop] = val;
  if (prop.startsWith('--')) el.style.setProperty(prop, val); else el.style[prop] = val;
}
let litCount = -1;
function frame() {
  if (!mobile() || innerWidth !== stableW) { stableVh = innerHeight; stableW = innerWidth; cardTops.clear(); }
  const vh = stableVh;
  // Najprv všetky merania, potom zápisy (bez striedania čítanie/zápis, ktoré vynúti layout viackrát za snímok).
  const rOpen = open && drop && !reduce ? open.getBoundingClientRect() : null;
  const kick = rOpen ? open.querySelector('.kc-open__kicker') : null;
  const top0 = kick ? kick.offsetTop + kick.offsetHeight + 40 : vh * .55;
  const rMani = mani ? mani.getBoundingClientRect() : null;
  const roadOn = road && track && !mobile() && !reduce;
  const rRoad = roadOn ? road.getBoundingClientRect() : null;
  const dist = roadOn ? Math.max(0, track.scrollWidth - innerWidth) : 0;
  const rAi = ai && !reduce ? ai.getBoundingClientRect() : null;
  const rWho = who && !reduce ? who.getBoundingClientRect() : null;
  const cardRects = reduce ? [] : cards.map((c, i) => {
    if (!cards[i + 1]) return null;
    if (!cardTops.has(c)) cardTops.set(c, parseFloat(getComputedStyle(c).top) || 0);
    return { top: cardTops.get(c), nextTop: cards[i + 1].getBoundingClientRect().top };
  });
  // 1 · kvapka rastie do celej obrazovky
  if (rOpen) {
    const p = clamp(-rOpen.top / (rOpen.height - vh));
    const e = 1 - Math.pow(1 - clamp(p / .7), 3);
    const w0 = mobile() ? Math.min(innerWidth * .40, 260) : Math.max(120, Math.min(innerWidth * .18, 260, (vh - top0 - 28) * 3 / 4));
    const h0 = w0 * 4 / 3;
    // plná veľkosť ostáva, rastie len orez (bez prepočtu layoutu na každom snímku)
    const W = innerWidth, w = w0 + (W - w0) * e, h = h0 + (vh - h0) * e;
    put(drop, 'width', `${W}px`);
    put(drop, 'height', `${vh}px`);
    put(drop, 'aspectRatio', 'auto');
    put(drop, 'borderRadius', '0');
    const rad = (999 * (1 - e)).toFixed(1), ix = ((W - w) / 2).toFixed(1), iy = ((vh - h) / 2).toFixed(1);
    put(drop, 'clipPath', `inset(${iy}px ${ix}px round ${rad}px ${rad}px ${rad}px 0)`);
    put(open, '--p', e.toFixed(3));
    open.classList.toggle('is-in', p > .04);
    const dy0 = mobile() ? vh * .26 : top0 + h0 / 2 - vh / 2;
    put(drop, '--dy', `${(dy0 * (1 - e)).toFixed(1)}px`);
    put(drop, '--veil', clamp((p - .45) / .3).toFixed(3));
    put(drop, '--claim', clamp((p - .55) / .3).toFixed(3));
  }
  // 2 · slová sa rozsvecujú podľa postupu v pripnutej sekcii
  if (rMani) {
    const p = reduce ? 1 : clamp(-rMani.top / Math.max(1, rMani.height - vh * 1.1) * 1.15);
    const lit = Math.round(p * wordEls.length * 1.05);
    if (lit !== litCount) { litCount = lit; wordEls.forEach((w, i) => w.classList.toggle('on', i < lit)); }
    put(mani, '--mf', clamp((p - .8) / .2).toFixed(3));
  }
  // 3 · horizontálna cesta
  if (rRoad) {
    const p = clamp(-rRoad.top / Math.max(1, rRoad.height - vh));
    put(track, 'transform', `translate3d(${(-dist * p).toFixed(1)}px,0,0)`);
    put(bar?.parentElement, '--rp', p.toFixed(3));
    put(bar, 'transform', `scaleX(${p.toFixed(3)})`);
  }
  // 4 · AI: písmená s videom sa priblížia, potom sa ukáže text
  if (rAi) {
    const p = clamp(-rAi.top / Math.max(1, rAi.height - vh));
    const z = clamp(p / .6);
    put(ai, '--as', (1 + Math.pow(z, 3) * 14).toFixed(3));
    put(ai, '--ao', clamp(1 - (p - .45) / .15).toFixed(3));
    put(ai, '--ai', clamp((p - .58) / .2).toFixed(3));
  }
  // 5 · Lucia: medailón sa otvorí, prstence sa točia, malé fotky plávajú
  if (rWho) {
    const p = clamp((vh - rWho.top) / (vh + rWho.height));
    const o = clamp((vh - rWho.top) / (vh * .9));
    put(who, '--ci', `${(14 * (1 - o)).toFixed(2)}%`);
    put(who, '--ms', (1.1 - .1 * p).toFixed(3));
    put(who, '--my', `${(-40 * p).toFixed(1)}px`);
    put(who, '--rr', `${(p * 70).toFixed(1)}deg`);
    put(who, '--ya', `${(120 - 320 * p).toFixed(1)}px`);
    put(who, '--yb', `${(-80 + 240 * p).toFixed(1)}px`);
    put(who, '--gx', `${((.5 - p) * 30).toFixed(1)}vw`);
  }
  // 6 · karty sa pri prekrytí zmenšia
  cardRects.forEach((r, i) => {
    if (!r) return;
    const k = clamp((vh - r.nextTop) / (vh - r.top));
    put(cards[i], '--sc', (1 - k * .06).toFixed(4));
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
// beží aj pri obmedzenom pohybe, vtedy CSS len prelína (Lucky 26. 10.)
if (pre.length) {
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
    // Pri obmedzenom pohybe globálne CSS vypína animácie, preto len jemné prelínanie cez Web Animations bez posunu.
    if (reduce) el.animate([{ opacity: 0 }, { opacity: 1, offset: .18 }, { opacity: 1, offset: .78 }, { opacity: 0 }], { duration: 5200, easing: 'ease-in-out' }).onfinish = () => el.classList.remove('on');
  };
  pre.forEach(el => el.addEventListener('animationend', e => { if (e.animationName === 'kc-cycle' || e.animationName === 'kc-fade') el.classList.remove('on'); }));
  setTimeout(() => { show(); setInterval(() => { if (document.visibilityState === 'visible') show(); }, 3800); }, 1200);
}

// Vstúpte: zapne hudbu (klik je gesto, prehliadač ju pustí) a plynulo prehrá otvorenie až do konca
const enter = document.querySelector('[data-enter]');
if (enter && open) {
  enter.addEventListener('click', () => {
    window.anaPlayAmbient?.();
    const end = open.offsetTop + Math.max(open.offsetHeight - innerHeight, innerHeight * .9);
    const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    if (window.__anaLenis) { window.__anaLenis.scrollTo(end, { duration: reduce ? 0 : 3.2, easing: ease }); return; }
    if (reduce) { scrollTo(0, end); return; }
    const y0 = scrollY, t0 = performance.now(), dur = 3200;
    const step = t => { const k = clamp((t - t0) / dur); scrollTo(0, y0 + (end - y0) * ease(k)); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}
