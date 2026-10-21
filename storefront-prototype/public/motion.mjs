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
// Telefon/dotyk: žádné scrubované filtry, paralaxy ani zmenšování karet – na mobilu trhaly skrol
// a karty zůstávaly ztmavené (brightness .55) přesně ve chvíli, kdy je člověk četl.
const lite = window.matchMedia('(max-width: 760px), (hover: none) and (pointer: coarse)').matches;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Čistý preloader: úvod se přehrává jen při prvním otevření webu v relaci.
// Pak je to hero sekce (video + slovo), bez zoomu a bez kategorií.
// Kliknutí na „Domů“ vede vždy na hero, nikoli na preloader.
const heroMode = (() => {
  const params = new URLSearchParams(location.search);
  const asked = params.has('hero');
  if (asked) {
    params.delete('hero');
    const query = params.toString();
    history.replaceState(null, '', location.pathname + (query ? '?' + query : '') + location.hash);
  }
  let seen = false;
  try { seen = sessionStorage.getItem('ana-intro-seen') === '1'; } catch {}
  return asked || seen;
})();
if (heroMode) document.documentElement.classList.add('lh-hero-mode');
const markIntroSeen = () => { try { sessionStorage.setItem('ana-intro-seen', '1'); } catch {} };

// GSAP se načítá jako klasický defer skript, module až poté — start proto
// čeká na DOMContentLoaded, aby gsap, ScrollTrigger i Lenis byly připravené.
const start = () => {
gsap = window.gsap;
ScrollTrigger = window.ScrollTrigger;
if (gsap && ScrollTrigger) {
  gsap.registerPlugin(ScrollTrigger);

  // Zlatý odlesk: úzký pruh přejede přes nápis. Animuje se jen background-position
  // (u loga maska), žádný layout.
  const shimmerText = el => gsap.fromTo(el, {backgroundPosition: '150% 0'}, {backgroundPosition: '-50% 0', duration: 1.6, ease: 'sine.inOut', overwrite: 'auto'});
  const shimmerImage = el => gsap.fromTo(el, {maskPosition: '150% 0', webkitMaskPosition: '150% 0'}, {maskPosition: '-50% 0', webkitMaskPosition: '-50% 0', duration: 1.6, ease: 'sine.inOut', overwrite: 'auto'});

  // ScrollTrigger musí vědět o Lenis scrollu, jinak scrub laguje.
  const lenis = window.__anaLenis;
  if (lenis) lenis.on('scroll', () => ScrollTrigger.update());

  const intro = $('#lh-intro');
  const top = $('#lh-top');
  // r12/2a: mobilný úvod – bez scrollovania, iba tlačidlo Vstúpte.
  const mobileIntro = Boolean(intro) && matchMedia('(max-width:768px), (pointer:coarse)').matches;
  if (mobileIntro) {
    document.documentElement.classList.add('lh-locked');
    document.documentElement.classList.add('lh-mobile-intro');
    if (window.__anaLenis) window.__anaLenis.stop();
  }
  const introP = {value: 0};
  // Úvod je přes celou šířku. Padding je inline v ROOT_STYLE, proto ho tady
  // zrušíme; s lištou se pak vrátí.
  if (intro) {
    const root = document.querySelector('.dc-root');
    if (root) root.style.paddingLeft = '0';
  }

  // --- Hlavička: tmavý text na krémové, bílý nad tmavými sekcemi -----------
  const darks = $$('.lh-card,#lh-obloha,#lh-reset,.lh-split--dark');
  // Hlavička a boční lišta jsou na začátku skryté a objeví se po prvním
  // skrolu nebo kliku na „Posuňte nadol". Pak už zůstávají.
  // Během preloaderu je hlavička i lišta skrytá a neaktivní: na neviditelný
  // „Menu“ se nesmí dát kliknout ani se na něj nesmí dostat tabem.
  const chromeInteractive = on => {
    for (const el of [document.querySelector('#ana-rail'), document.querySelector('#lh-top')]) {
      if (!el) continue;
      el.inert = !on;
      el.setAttribute('aria-hidden', String(!on));
    }
  };
  if (intro) chromeInteractive(false);
  const showChrome = () => {
    if (document.body.classList.contains('lh-chrome-in')) return;
    document.body.classList.add('lh-chrome-in');
    chromeInteractive(true);
    if (intro) markIntroSeen();
    // Obsah úvodu je přes celou šířku; s lištou se odsadí. Padding je inline
    // z ROOT_STYLE, proto se musí nastavit tady.
    const root = document.querySelector('.dc-root');
    if (root && intro) root.style.paddingLeft = 'var(--rail-pad)';
  };
  // Hlavička a boční lišta jsou součástí preloaderu? Ne: na úvodu nejsou vidět
  // vůbec a objeví se až za ním, když už je člověk v obsahu.
  const chromeAt = () => (intro ? Math.max(0, intro.offsetHeight - window.innerHeight) : 10);
  const head = () => {
    if (window.scrollY > chromeAt()) showChrome();
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
          [['ANA', 520 - 236 * 0.78], ['STA', 520], ['SIA', 520 + 236 * 0.78]].forEach(([text, y]) => {
            const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
            tspan.setAttribute('x', '720');
            tspan.setAttribute('y', String(y));
            tspan.textContent = text;
            el.appendChild(tspan);
          });
        });
      }
      // ViewBox obepíná všechny řádky slova (ANA / STA / SIA) s rezervou 6 %,
      // jinak se první písmeno na úzké obrazovce usekne.
      const boxes = [...measure.querySelectorAll('tspan')].map(t => t.getBBox());
      const b = boxes.length ? boxes.reduce((acc, box) => {
        const x = Math.min(acc.x, box.x), y = Math.min(acc.y, box.y);
        const right = Math.max(acc.x + acc.width, box.x + box.width);
        const bottom = Math.max(acc.y + acc.height, box.y + box.height);
        return {x, y, width: right - x, height: bottom - y};
      }, boxes[0]) : measure.getBBox();
      const padX = b.width * 0.06, padY = b.height * 0.06;
      // Na mobilu je slovo o kus výš, aby se pod ním vešla kategorie a tlačítko.
      const lift = window.innerWidth < 700 ? 20 : 0;
      svg.setAttribute('viewBox', [b.x - padX, b.y - padY + lift, b.width + 2 * padX, b.height + 2 * padY].join(' '));
      // r12/2b: na mobile maska len na ploche viewBoxu – obrie plochy
      // (13440×12900) prekročila limit GPU pri DPR 3 a slovo sa nevykreslilo.
      if (mobileIntro) {
        const maskEl = $('#lhWord');
        const bgEl = $('#lh-word-bg');
        const vb = svg.getAttribute('viewBox').split(' ').map(Number);
        if (maskEl && bgEl && vb.length === 4) {
          for (const el of [maskEl, bgEl]) {
            el.setAttribute('x', String(vb[0])); el.setAttribute('y', String(vb[1]));
            el.setAttribute('width', String(vb[2])); el.setAttribute('height', String(vb[3]));
          }
        }
      }
      // Rozměr písmena T se musí měřit na skrytém textu, ne na textu v <mask>.
      const extent = measure.getExtentOfChar(4);
      const fs = 236;
      const ox = extent.x + extent.width / 2;
      const oy = 520 - fs * 0.31;

      gsap.from('.lh-intro__mask', {opacity: 0, duration: 1.6, ease: 'power2.out'});
      gsap.from('.lh-intro__meta .k,.lh-intro__meta li', {y: 18, opacity: 0, duration: 1, ease: 'power3.out', stagger: 0.08, delay: 0.5});
      // Tři loga nad úvodem: hlavní přijde první, boční o chvíli později,
      // odlesk běží ~0,4 s po náběhu.
      const mainBrand = $('.lh-brand--main');
      const sideBrands = $$('.lh-brand--academy,.lh-brand--ai');
      if (mainBrand) gsap.fromTo(mainBrand, {opacity: 0, y: 12}, {opacity: 1, y: 0, duration: 1.5, ease: 'sine.out', delay: 0.25});
      if (sideBrands.length) gsap.fromTo(sideBrands, {opacity: 0, y: 10}, {opacity: 1, y: 0, duration: 1.5, ease: 'sine.out', delay: 0.75, stagger: 0.18});
      gsap.delayedCall(2.15, () => {
        shimmerImage($('.lh-brand--main .lh-brand__img--shine'));
      });
      gsap.delayedCall(2.65, () => {
        $$('.lh-brand--academy,.lh-brand--ai').forEach(brand => {
          $$('.lh-shimmer-text', brand).forEach(text => shimmerText(text));
          shimmerImage($('.lh-brand__img--shine', brand));
        });
      });
      // Jednou zlatý odlesk přes samotné slovo ANASTASIA (přes masku, jemně).
      const wordShine = $('#lh-word-shine');
      if (wordShine) {
        gsap.timeline({delay: 1.6})
          .to(wordShine, {opacity: 0.9, duration: 0.35, ease: 'sine.out'}, 0)
          .fromTo('#lhShine', {attr: {x1: -900, x2: -100}}, {attr: {x1: 1500, x2: 2300}, duration: 1.6, ease: 'sine.inOut'}, 0)
          .to(wordShine, {opacity: 0, duration: 0.5, ease: 'sine.in'}, 1.25);
      }

      // V hero režimu je úvod statická hero sekce – zoom se nepřehrává.
      const timeline = heroMode || mobileIntro ? gsap.timeline() : gsap.timeline({
        scrollTrigger: {
          trigger: intro, start: 'top top', end: 'bottom bottom', scrub: 1,
          onUpdate: s => { introP.value = s.progress; head(); },
        },
      });
      timeline
        .to('.lh-intro__meta', {opacity: 0, y: -30, duration: 0.12, ease: 'none'}, 0)
        .to('.lh-intro__brands', {opacity: 0, y: -30, duration: 0.12, ease: 'none'}, 0)
        .fromTo('#lh-intro-video', {scale: 1.35}, {scale: 1, duration: 0.62, ease: 'none'}, 0)
        // Pod maskou ztmavené video (průhledná vrstva, ne filtr – levnější na mobilu), aby slovo ANASTASIA bylo čitelné i u světlých záběrů.
        .to('.lh-intro__tint', {opacity: 0, duration: 0.4, ease: 'none'}, 0.12)
        .to('#lh-word-g', {scale: 110, svgOrigin: ox + ' ' + oy, duration: 0.5, ease: 'power3.in'}, 0.04)
        .to('.lh-intro__mask', {opacity: 0, duration: 0.08, ease: 'none'}, 0.46)
        .to('.lh-intro__veil,.lh-vid-btn', {opacity: 1, duration: 0.1, ease: 'none'}, 0.46)
        // immediateRender, protože fromTo začíná až v 0.56 — bez něj by text
        // vstal viditelný od začátku průběhu.
        .to('.lh-say--one', {opacity: 1, y: 0, duration: 0.12, ease: 'power2.out'}, 0.56)
        .to('.lh-say--one', {opacity: 0, y: -80, duration: 0.1, ease: 'power2.in'}, 0.74)
        .to('.lh-say--two', {opacity: 1, y: 0, duration: 0.12, ease: 'power2.out'}, 0.82)
        .to({}, {duration: 0.06});
      // Texty zůstávají skryté, dokud maska neodstoupí. Nastavíme to až po
      // vytvoření timeline, aby je scrub přepsal jen v okamžiku, kdy mají přijít.
      gsap.set(['.lh-say--one', '.lh-say--two'], {opacity: 0, y: 80});
      if (mobileIntro) {
        // r12/2a: na mobilu sa úvod prehrá sám po Vstúpte (3–4 s).
        window.__anaIntroTimeline = timeline;
        const unlock = () => {
          document.documentElement.classList.remove('lh-locked');
          if (window.__anaLenis) window.__anaLenis.start();
        };
        timeline.eventCallback('onComplete', () => { unlock(); markIntroSeen(); });
      }
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
    if (!lite) $$('[data-speed]').forEach(el => {
      const speed = Number(el.dataset.speed) || 0;
      gsap.fromTo(el, {y: -speed}, {y: speed, ease: 'none', scrollTrigger: {
        trigger: el.closest('section') || el, start: 'top bottom', end: 'bottom top', scrub: true,
      }});
    });

    // --- Svět ANASTASIA: karty se vrství, předchozí se zmenší a ztmaví -----
    const cards = lite ? [] : $$('.lh-card');
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

  // --- Kategorie se střídají jedna po druhé, dokud uživitel neskroluje ---
  const cats = $$('.lh-cat');
  if (cats.length && !reduce && !heroMode) {
    const loop = gsap.timeline({repeat: -1});
    cats.forEach(cat => {
      // Náběh 1,4 s, ~4 s viditelná, odchod 1,4 s, krátká pauza.
      loop.fromTo(cat, {opacity: 0, y: 18}, {opacity: 1, y: 0, duration: 1.4, ease: 'sine.inOut'})
        .call(() => shimmerText(cat), null, '+=0.4')
        .to(cat, {opacity: 0, y: -14, duration: 1.4, ease: 'sine.inOut'}, '+=4')
        .to({}, {duration: 0.8});
    });
    addEventListener('scroll', () => {
      if (window.scrollY <= 10) return;
      loop.kill();
      cats.forEach(cat => gsap.set(cat, {opacity: 0}));
    }, {passive: true, once: true});
  }

  // --- Zvuk v úvodu: stejný ambient jako v liště ---------------------------
  const sound = $('[data-lh-sound]');
  if (sound) {
    const sync = () => {
      const on = window.anaSoundState ? window.anaSoundState() : false;
      sound.setAttribute('aria-pressed', String(on));
      sound.setAttribute('aria-label', on ? 'Vypnúť zvuk' : 'Zapnúť zvuk');
      sound.setAttribute('title', on ? 'Vypnúť zvuk' : 'Zapnúť zvuk');
      sound.classList.toggle('is-on', on);
      const label = sound.querySelector('.media-label');
      if (label) label.textContent = on ? 'Zvuk zapnutý' : 'Zvuk vypnutý';
    };
    document.addEventListener('ana:sound', sync);
    sound.addEventListener('click', async () => {
      if (window.anaToggleAmbient) await window.anaToggleAmbient();
      sync();
    });
    sync();
  }

  // --- Výzva ke skrolování: tlačítko i klávesy přehrávají úvod do konce ----
  const scrollIntro = () => {
    if (!intro) return;
    showChrome();
    const end = Math.max(0, intro.offsetHeight - window.innerHeight);
    if (window.__anaLenis) window.__anaLenis.scrollTo(end, {duration: 3});
    else window.scrollTo(0, end);
  };
  const cue = $('#lh-scroll-cue');
  if (cue) cue.addEventListener('click', scrollIntro);
  if (cue) cue.addEventListener('click', () => {
    if (!mobileIntro) return;
    const t = window.__anaIntroTimeline;
    if (!t) { document.documentElement.classList.remove('lh-locked'); if (window.__anaLenis) window.__anaLenis.start(); return; }
    if (!t.isActive()) t.play(0);
  });
  // r12/2: klik na VSTÚPTE je gestum – hudba sa spustí pri ňom (iOS/Android).
  if (cue) cue.addEventListener('click', ()=>{
    try{ if(window.anaSoundState&&!window.anaSoundState()&&window.anaToggleAmbient) window.anaToggleAmbient(); }catch{}
  });
  addEventListener('keydown', event => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key;
    if (key !== 'ArrowDown' && key !== ' ' && key !== 'Spacebar') return;
    const tag = (event.target && event.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (!intro || window.scrollY > intro.offsetHeight - window.innerHeight) return;
    event.preventDefault();
    scrollIntro();
  });

  // --- Videa: hrají jen na obrazovce, hlavní se dá zastavit ----------------
  const videos = [$('#lh-intro-video'), $('#lh-sky-video')].filter(Boolean);
  // Úvodné video sa načíta až po prvej kresbe (LCP) a pri slabom pripojení
  // alebo úspore dát vôbec – ostane krémová plocha so slovom.
  const connection=navigator.connection||{};
  const heavy=Boolean(connection.saveData)||/^(slow-2g|2g)$/.test(String(connection.effectiveType||''));
  const loadIntroVideo=()=>{
    const video=$('#lh-intro-video');if(!video||heavy)return;
    for(const source of video.querySelectorAll('source[data-lh-src]')){
      if(!source.src)source.setAttribute('src',source.dataset.lhSrc);
    }
    video.load();video.play().catch(()=>{});
  };
  if('requestIdleCallback' in window)requestIdleCallback(loadIntroVideo,{timeout:2500});else setTimeout(loadIntroVideo,600);
  // Rozměry po nabití videa se přepočítají, ale ne během skrolu.
  let refreshed = false;
  // Bez souboru (media/ je zatím prázdná) video kreslí černou a poster se
  // neukáže. Fotka pod ním je proto fallback a video se rozsvítí až když
  // má data.
  const showWhenReady = video => {
    const mark = () => { if (video.readyState >= 2) { video.classList.add('lh-ready'); } };
    video.addEventListener('loadeddata', mark);
    video.addEventListener('canplay', mark);
    video.addEventListener('loadedmetadata', () => { if (refreshed) return; refreshed = true; setTimeout(() => window.ScrollTrigger && window.ScrollTrigger.refresh(), 400); });
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
