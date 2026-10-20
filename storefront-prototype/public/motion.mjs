// Pohyb webu ANASTASIA.
//
// Převzato z Claude prototypu „Pohyb" (design/HANDOFF-merge.md, body 1–3).
// GSAP a ScrollTrigger jsou v /vendor (CSP script-src 'self', nic z CDN).
//
// Pravidla:
// - třída "motion" na <body> se přidává až tady, takže bez JS zůstává stránka
//   statická a čitelná; stejně tak při prefers-reduced-motion;
// - skripty videí jsou volitelné — media/ je v repu prázdná a videa doplní
//   klient, proto všechno má fungovat i s fallbackem na fotku.

let gsap = window.gsap;
let ScrollTrigger = window.ScrollTrigger;
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// GSAP se načítá jako klasický defer skript, module až poté — start proto
// čeká na DOMContentLoaded, aby gsap, ScrollTrigger i Lenis byly připravené.
const start = () => {
gsap = window.gsap;
ScrollTrigger = window.ScrollTrigger;
if (gsap && ScrollTrigger) {
  gsap.registerPlugin(ScrollTrigger);

  // ScrollTrigger musí vědět o Lenis scrollu, jinak scrub laguje.
  const lenis = window.__anaLenis;
  if (lenis) lenis.on('scroll', () => ScrollTrigger.update());

  const intro = $('#lh-intro');
  const top = $('#lh-top');
  const introP = {value: 0};

  // --- Hlavička: tmavý text na krémové, bílý nad tmavými sekcemi -----------
  const darks = $$('.lh-card,#lh-obloha,#lh-reset,.lh-split--dark');
  const head = () => {
    if (!top || !intro) return;
    const past = window.scrollY > intro.offsetHeight - window.innerHeight * 0.4;
    let dark = false;
    for (const el of darks) {
      const r = el.getBoundingClientRect();
      if (r.top <= 48 && r.bottom >= 48) { dark = true; break; }
    }
    top.classList.toggle('lh-top--solid', past && !dark);
    top.classList.toggle('lh-top--dark', dark || (!past && introP.value > 0.42));
  };
  if (top) {
    window.addEventListener('scroll', head, {passive: true});
    head();
  }

  if (!reduce) {
    document.body.classList.add('motion');

    // --- Úvod: video prosvítá jen písmeny, skrol se zavrtí do písmena T ----
    const buildIntro = () => {
      const svg = $('#lh-mask-svg');
      const measure = $('#lh-word-m');
      if (!svg || !measure) return;
      // Na úzké obrazovce tři řádky ANA / STA / SIA – písmeno T zůstane uprostřed.
      if (window.innerWidth < 700) {
        ['#lh-word-t', '#lh-word-m'].forEach(id => {
          const el = $(id);
          if (!el) return;
          el.textContent = '';
          [['ANA', 520 - 236 * 0.92], ['STA', 520], ['SIA', 520 + 236 * 0.92]].forEach(([text, y]) => {
            const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
            tspan.setAttribute('x', '720');
            tspan.setAttribute('y', String(y));
            tspan.textContent = text;
            el.appendChild(tspan);
          });
        });
      }
      const b = measure.getBBox();
      const pad = b.height * 0.06;
      svg.setAttribute('viewBox', [b.x - pad, b.y - pad, b.width + 2 * pad, b.height + 2 * pad].join(' '));
      // Rozměr písmena T se musí měřit na skrytém textu, ne na textu v <mask>.
      const extent = measure.getExtentOfChar(4);
      const fs = 236;
      const ox = extent.x + extent.width / 2;
      const oy = 520 - fs * 0.31;

      gsap.from('.lh-intro__mask', {opacity: 0, duration: 1.6, ease: 'power2.out'});
      gsap.from('.lh-intro__meta .k,.lh-intro__meta li', {y: 18, opacity: 0, duration: 1, ease: 'power3.out', stagger: 0.08, delay: 0.5});

      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: intro, start: 'top top', end: 'bottom bottom', scrub: 1,
          onUpdate: s => { introP.value = s.progress; head(); },
        },
      });
      timeline
        .to('.lh-intro__meta', {opacity: 0, y: -30, duration: 0.12, ease: 'none'}, 0)
        .fromTo('#lh-intro-video', {scale: 1.35}, {scale: 1, duration: 0.62, ease: 'none'}, 0)
        .to('#lh-word-g', {scale: 110, svgOrigin: ox + ' ' + oy, duration: 0.5, ease: 'power3.in'}, 0.04)
        .to('.lh-intro__mask', {opacity: 0, duration: 0.08, ease: 'none'}, 0.46)
        .to('.lh-intro__veil,.lh-vid-btn', {opacity: 1, duration: 0.1, ease: 'none'}, 0.46)
        .fromTo('.lh-say--one', {opacity: 0, y: 80}, {opacity: 1, y: 0, duration: 0.12, ease: 'power2.out'}, 0.56)
        .to('.lh-say--one', {opacity: 0, y: -80, duration: 0.1, ease: 'power2.in'}, 0.74)
        .fromTo('.lh-say--two', {opacity: 0, y: 80}, {opacity: 1, y: 0, duration: 0.12, ease: 'power2.out'}, 0.82)
        .to({}, {duration: 0.06});
    };
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => {
      buildIntro();
      ScrollTrigger.refresh();
    });

    // --- Obloha: kruhové okno do noci sa otvára na celú obrazovku ----------
    const sky = $('#lh-obloha');
    if (sky) {
      gsap.timeline({scrollTrigger: {trigger: sky, start: 'top top', end: 'bottom bottom', scrub: 1}})
        .to('.lh-sky__pre', {opacity: 0, y: -20, duration: 0.15, ease: 'none'}, 0)
        .to('.lh-sky__win', {clipPath: 'circle(80% at 50% 50%)', duration: 0.6, ease: 'power2.inOut'}, 0)
        .fromTo('#lh-sky-video', {scale: 1.5}, {scale: 1, duration: 0.7, ease: 'none'}, 0)
        .fromTo('.lh-sky__txt', {opacity: 0, y: 60}, {opacity: 1, y: 0, duration: 0.2, ease: 'power2.out'}, 0.55)
        .to({}, {duration: 0.2});
    }

    // --- Vrstvy různou rychlostí (text, menší fotka) ------------------------
    $$('[data-speed]').forEach(el => {
      const speed = Number(el.dataset.speed) || 0;
      gsap.fromTo(el, {y: -speed}, {y: speed, ease: 'none', scrollTrigger: {
        trigger: el.closest('section') || el, start: 'top bottom', end: 'bottom top', scrub: true,
      }});
    });

    // --- Svět ANASTASIA: karty se vrství, předchozí se zmenší a ztmaví -----
    const cards = $$('.lh-card');
    cards.forEach((card, i) => {
      const bg = $('.lh-card__bg', card);
      if (bg) gsap.fromTo(bg, {scale: 1.12, yPercent: -8}, {scale: 1, yPercent: 0, ease: 'none', scrollTrigger: {
        trigger: card, start: 'top bottom', end: 'top top', scrub: true,
      }});
      if (i < cards.length - 1) gsap.to(card, {scale: 0.92, filter: 'brightness(.55)', ease: 'none', scrollTrigger: {
        trigger: cards[i + 1], start: 'top bottom', end: 'top top', scrub: true,
      }});
      gsap.from($$('.lh-card__txt h3,.lh-card__txt p', card), {y: 60, opacity: 0, duration: 1, ease: 'power3.out', stagger: 0.1, scrollTrigger: {
        trigger: card, start: 'top 55%',
      }});
    });

    // --- RESET: témata jedou vodorovně, sekce se drží na místě -------------
    ScrollTrigger.matchMedia({'(min-width: 761px)': () => {
      const track = $('#lh-track');
      if (!track) return;
      const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
      gsap.to(track, {
        x: () => -distance(), ease: 'none',
        scrollTrigger: {
          trigger: '#lh-reset', start: 'top top', end: () => '+=' + distance(),
          pin: '.lh-reset__pin', scrub: 1, invalidateOnRefresh: true,
        },
      });
    }});
  }

  // --- Videa: hrají jen na obrazovce, hlavní se dá zastavit ----------------
  const videos = [$('#lh-intro-video'), $('#lh-sky-video')].filter(Boolean);
  // Bez souboru (media/ je zatím prázdná) video kreslí černou a poster se
  // neukáže. Fotka pod ním je proto fallback a video se rozsvítí až když
  // má data.
  const showWhenReady = video => {
    const mark = () => { if (video.readyState >= 2) video.classList.add('lh-ready'); };
    video.addEventListener('loadeddata', mark);
    video.addEventListener('canplay', mark);
    mark();
  };
  videos.forEach(showWhenReady);
  const videoButton = $('#lh-vid-btn');
  let held = false;
  if (videoButton) {
    videoButton.addEventListener('click', () => {
      held = !held;
      videos.forEach(v => {
        if (held) v.pause();
        else v.play().catch(() => {});
      });
      videoButton.setAttribute('aria-pressed', String(held));
      videoButton.textContent = held ? '▷' : 'Ⅱ';
      videoButton.setAttribute('aria-label', held ? 'Prehrať video' : 'Pozastaviť video');
    });
  }
  if (videos.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const video = entry.target;
        if (held) return;
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      });
    }, {threshold: 0.15});
    videos.forEach(v => io.observe(v));
  }
  if (reduce) videos.forEach(v => { v.pause(); v.removeAttribute('autoplay'); });
}
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
else start();
