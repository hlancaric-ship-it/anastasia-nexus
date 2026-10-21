// ANASTASIA — homepage.
//
// Rozvržení a pohyb podle spojovacího handoffu (design/HANDOFF-merge.md):
// informační architektura, split sekce, boční lišta a footer zůstávají;
// úvod s maskou, obloha, parallax, vrstvené karty a vodorovný pás jsou nové.
//
// Obsah je slovenský a značkový. Barvy jdou přes --site-* proměnné, takže motiv,
// který Lucia vybere v adminu, platí i tady.

import {escape as e, arrow} from './components.mjs';
import {picture} from './webp.mjs';

const CREAM = '#EFE5C7';
const PAPER = '#F4F1EB';
const INK = '#1E281C';

const IMG = {
  hero: '/assets/hero-forest.jpg',
  sky: '/assets/night-sky.jpg',
  lucia: '/assets/lucia-portrait.jpg',
  tree: '/assets/tree.jpg',
  longevity: '/assets/lucia-longevity.png',
  // Ďalšie vlastné zábery (Luciine fotky z media/) – žiadny záber sa neopakuje.
  kozmetika: '/media/legacy-a56cbdc6a741.png',
  vyziva: '/media/legacy-0a1fdf946abe.png',
  program: '/media/learning.jpg',
  zdravy: '/media/legacy-483537f470c4.jpg',
};

const consults = [
  {n: '01', title: 'Online zdravotná konzultácia', sub: 'Osobne aj na diaľku', href: '/konzultacie/online-zdravotna-konzultacia'},
  {n: '02', title: 'Supervízia', sub: 'Pre odborníkov a tímy', href: '/konzultacie/supervizia'},
  {n: '03', title: 'Astrologický profil', sub: 'Zdravie a predispozície', href: '/konzultacie/astrologicky-profil-zdravia-a-vitality'},
];

// Vrstvené karty (bod 4 handoffu). Místo ilustrovaných obalů reálné fotografie
// z /assets — media/ v repu zatím chybí, doplní ho klient. Ilustrované
// p-*.png mají v sobě rozpadlý text, proto se nepoužívají.
const worlds = [
  {
    n: '01', title: 'Kozmetika', from: 'od 11 €',
    text: 'Krém, pleťová voda, sprchový gél a telové maslo – vždy namiešané až po rozhovore s vami.',
    href: '/eshop/kategoria/bio-kozmetika-bez-chemie', img: IMG.kozmetika, tone: 'light',
  },
  {
    n: '02', title: 'Bylinky a výživa', from: 'od 9 €',
    text: 'Chrípkový prášok, Jančova zmes a zdravá káva z koreňa púpavy. Receptúry so stáročnou históriou.',
    href: '/eshop/kategoria/bylinky-a-vyziva', img: IMG.vyziva, tone: 'dark',
  },
  {
    n: '03', title: 'Konzultácie', from: 'od 59 €',
    text: 'Online zdravotná konzultácia, supervízia, personifikovaný protokol a astrologický profil zdravia.',
    href: '/konzultacie', img: IMG.lucia, tone: 'dark',
  },
  {
    n: '04', title: 'Programy', from: 'od 38 €',
    text: 'RESET 40+, výuka vedomého vnímania a audio cyklus Nič nemusíš. Prístup v účte hneď po platbe.',
    href: '/eshop/kategoria/programy-a-sluzby', img: IMG.program, tone: 'dark',
  },
];

// Témy programu (bod 5 handoffu) — schválený text z Claude prototypu.
const topics = [
  ['01', 'Pozornosť', 'Ako si začať všímať signály tela skôr, než musí kričať.'],
  ['02', 'Energia', 'Prečo energia nie je iba otázkou veku.'],
  ['03', 'Spánok', 'Ako podporiť nočnú obnovu tela a mozgu.'],
  ['04', 'Stres', 'Ako rozpoznať preťaženie a pracovať s nervovým systémom.'],
  ['05', 'Pohyb', 'Ako si zachovať silu, mobilitu a samostatnosť.'],
  ['06', 'Výživa', 'Ako jesť pre energiu, stabilitu a dlhodobé zdravie.'],
  ['07', 'Hydratácia', 'Prečo nestačí iba „viac piť“.'],
  ['08', 'Dýchanie', 'Ako dych ovplyvňuje telo, myseľ a reakciu na stres.'],
];

// duo(nadpis, zvýraznený nadpis) + kľúče polí pre obsah z administrácie.
const duo = (italic, caps, keys = {}) => `<span class="lh-display"${keys.a?` data-content="${keys.a}"`:''}>${italic}</span><span class="lh-caps"${keys.b?` data-content="${keys.b}"`:''}>${caps}</span>`;

// Vlastní hlavička úvodu. Designová reference ji kreslí inline styly a přebírá
// průhlednou plochu z railu — nad krémovým úvodem pak vypadá jako šedý pruh.
// Tady je to čistý markup, barva se řídí tónem a jazykem.
export const LH_HEADER = `
<header id="lh-top" class="lh-top">
  <nav class="lh-top__side" aria-label="Obchod">
    <button class="lh-top__menu" type="button" data-menu-open="top" aria-label="Menu" aria-expanded="false" aria-controls="dc-top-menu">
      <span>Menu</span>
      <span class="lh-top__burger" aria-hidden="true"><i></i><i></i><i></i></span>
    </button>
    <a href="/eshop">Obchod</a>
    <a href="/eshop?category=sebarozvoj">Programy a služby</a>
  </nav>
  <a class="lh-top__brand" href="/" aria-label="ANASTASIA — domov">
    <img src="/assets/lucia-logo.png" alt="" width="34" height="34">
    <span>ANASTASIA<small>LIGHT FOR THE FUTURE</small></span>
  </a>
  <nav class="lh-top__side lh-top__side--right" aria-label="Účet">
    <a href="/konzultacie">Konzultácie</a>
    <a href="/kosik" aria-label="Košík">Košík (<span class="cart-count" aria-label="Počet kusov">0</span>)</a>
  </nav>
</header>`;

const listRow = (n, title, sub, href) => `
  <a class="lh-row" href="${href}">
    <span class="lh-row__n">${n}</span>
    <span class="lh-row__body"><strong>${e(title)}</strong><small>${e(sub)}</small></span>
    <span class="lh-row__arrow">↗</span>
  </a>`;

export function homeSections(products = []) {
  const items = products.map((p, i) => ({
    ...p,
    n: `N° ${String(i + 1).padStart(2, '0')}`,
    // build.mjs posílá cenu jako `price`; starší mock ji měl jako `priceLabel`.
    price: p.price ?? p.priceLabel ?? '',
  }));

  // --- Úvod: video prosvítá jen písmeny, skrol se zavrtí do písmena T -------
  const hero = `
<section class="lh-intro" id="lh-intro" aria-labelledby="lh-ih">
  <div class="lh-intro__stage">
    <video class="lh-intro__video" id="lh-intro-video" autoplay muted loop playsinline preload="none" fetchpriority="low" aria-hidden="true">
      <source data-lh-src="/media/hero-480p.mp4" media="(max-width: 600px)" type="video/mp4">
      <source data-lh-src="/media/hero-720p.mp4" media="(max-width: 1024px)" type="video/mp4">
      <source data-lh-src="/media/hero-1080p.mp4" type="video/mp4" data-content="global__video__0-video">
    </video>
    <p class="lh-intro__fallback" aria-hidden="true">ANASTASIA</p>
    <div class="lh-intro__veil" aria-hidden="true"></div>
    <div class="lh-intro__tint" aria-hidden="true"></div>
    <div class="lh-intro__mask" aria-hidden="true">
      <svg id="lh-mask-svg" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid meet">
        <defs>
          <mask id="lhWord" maskUnits="userSpaceOnUse" x="-6000" y="-6000" width="13440" height="12900">
            <g id="lh-word-g">
              <rect x="-6000" y="-6000" width="13440" height="12900" fill="#fff"/>
              <text id="lh-word-t" x="720" y="520" text-anchor="middle" font-family="'Fraunces', Georgia, serif" font-style="italic" font-weight="400" font-size="236" letter-spacing="4" fill="#000" stroke="#313C2B" stroke-width="1.5" paint-order="stroke fill">ANASTASIA</text>
            </g>
          </mask>
          <mask id="lhWordInv" maskUnits="userSpaceOnUse" x="-6000" y="-6000" width="13440" height="12900">
            <rect x="-6000" y="-6000" width="13440" height="12900" fill="#000"/>
            <text id="lh-word-inv-t" x="720" y="520" text-anchor="middle" font-family="'Fraunces', Georgia, serif" font-style="italic" font-weight="400" font-size="236" letter-spacing="4" fill="#fff">ANASTASIA</text>
          </mask>
          <linearGradient id="lhShine" gradientUnits="userSpaceOnUse" x1="-900" y1="0" x2="-100" y2="0">
            <stop offset="0" stop-color="#D8C598" stop-opacity="0"/>
            <stop offset=".42" stop-color="#D8C598" stop-opacity=".55"/>
            <stop offset=".55" stop-color="#F3E3B0" stop-opacity=".8"/>
            <stop offset="1" stop-color="#F3E3B0" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <rect id="lh-paper" x="-6000" y="-6000" width="13440" height="12900" fill="${PAPER}" opacity="0.94" mask="url(#lhWord)"/>
        <rect id="lh-word-tint" x="-6000" y="-6000" width="13440" height="12900" fill="#1E2A1A" opacity="0.45" mask="url(#lhWordInv)"/>
        <rect id="lh-word-shine" x="-6000" y="-6000" width="13440" height="12900" fill="url(#lhShine)" mask="url(#lhWord)" opacity="0"/>
        <text id="lh-word-m" x="720" y="520" text-anchor="middle" font-family="'Fraunces', Georgia, serif" font-style="italic" font-weight="400" font-size="236" letter-spacing="4" visibility="hidden">ANASTASIA</text>
      </svg>
    </div>
    <div class="lh-intro__brands">
      <a class="lh-brand lh-brand--academy" href="/ai-anastasia-academy" aria-label="ANASTASIA ACADEMY">
        <span class="lh-brand__stem" aria-hidden="true"></span>
        <span class="lh-brand__name lh-shimmer-text">ANASTASIA</span>
        <span class="lh-brand__sub lh-shimmer-text lh-shimmer-text--gold"><i></i>ACADEMY<i></i></span>
      </a>
      <a class="lh-brand lh-brand--main" href="/" aria-label="ANASTASIA OZ — Light for the Future">
        <span class="lh-brand__lock">
          <img class="lh-brand__mark" src="/assets/lucia-logo.png" alt="ANASTASIA OZ — Light for the Future" width="110" height="165">
          <img class="lh-brand__img--shine" src="/assets/lucia-logo.png" alt="" aria-hidden="true" width="110" height="165">
        </span>
      </a>
      <a class="lh-brand lh-brand--ai" href="/ai-anastasia" aria-label="AI ANASTASIA">
        <span class="lh-brand__lock lh-brand__lock--mark">
          <img class="lh-brand__mark" src="/assets/logo-mark.png" alt="" width="46" height="46">
          <img class="lh-brand__img--shine" src="/assets/logo-mark.png" alt="" aria-hidden="true" width="46" height="46">
        </span>
        <span class="lh-brand__name lh-shimmer-text">ANASTASIA</span>
      </a>
    </div>
    <div class="lh-intro__meta" aria-hidden="true">
      <div class="lh-intro__cats">
        <a class="lh-cat lh-cat--1" href="/eshop?category=bio-kozmetika-bez-chemie">Kozmetika na mieru</a>
        <a class="lh-cat lh-cat--2" href="/eshop?category=zdrave-doplnky-vyzivy">Bylinky Hildegardy</a>
        <a class="lh-cat lh-cat--3" href="/konzultacie">Konzultácie</a>
        <a class="lh-cat lh-cat--4" href="/eshop?category=sebarozvoj">Programy</a>
      </div>
      <div class="lh-enter-wrap">
        <button class="lh-enter" id="lh-scroll-cue" type="button" aria-label="Prejsť ďalej">
          <span>Vstúpte</span><span class="lh-enter__arrow" aria-hidden="true">↓</span>
        </button>
        <span class="lh-or" aria-hidden="true"><span class="lh-scroll-cue__wheel"><i></i></span>alebo posuňte</span>
      </div>
    </div>
    <h1 class="lh-say lh-say--one" id="lh-ih">
      <span class="lh-display" data-content="home__uvod__0-text">Vitajte.</span>
      <span class="lh-say__note" data-content="home__uvod__1-rich">Táto časť webu patrí projektu ANASTASIA. Nie ako ponuka riešení, ale ako priestor, kde veci nemusia byť tlačené, vysvetľované ani riadené. Zdravý svet nie je ideál, ku ktorému sa treba dopracovať. Nie je to cieľ, ktorý treba dosiahnuť prácou na sebe. Je to možnosť, ktorá sa objavuje vtedy, keď prestaneme mať pocit, že so sebou musíme niečo robiť.</span>
    </h1>
    <div class="lh-say lh-say--two">
      <p class="lh-eyebrow">Zdravý svet</p>
      <p class="lh-display">Zdravý svet nie je ideál, ku ktorému sa treba dopracovať.</p>
      <a class="lh-cta lh-cta--gold" href="/zdravy-svet" data-content="home__uvod__2-text">Vstúpte do zdravého sveta ${arrow}</a>
    </div>
    <button class="lh-vid-btn" id="lh-vid-btn" type="button" aria-pressed="false" aria-label="Pozastaviť video">Ⅱ</button>
    <button class="lh-intro__sound" type="button" data-lh-sound aria-pressed="false" aria-label="Zapnúť zvuk" title="Zapnúť zvuk">
      <svg class="lh-sound-on" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 14v-3a8 8 0 0 1 16 0v3M4 12H3v8h4v-8zm16 0h1v8h-4v-8z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a9 9 0 0 1 0 12"/></svg>
      <svg class="lh-sound-off" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 14v-3a8 8 0 0 1 16 0v3M4 12H3v8h4v-8zm16 0h1v8h-4v-8z"/><path d="m9 17 6 6m0-6-6 6"/></svg>
      <span class="media-label">Zvuk vypnutý</span>
    </button>
  </div>
</section>`;

  const manifesto = `
<section class="lh-split lh-split--paper lh-split--wide-text" id="manifest" data-sk-only data-screen-label="02 Manifest">
  <div class="lh-split__text">
    <p class="lh-eyebrow">Vitajte</p>
    <h2 class="lh-display" data-content="home__manifest__0-text">Priestor pre zdravie, poznanie a vedomý život.</h2>
    <p class="lh-lead" data-content="home__manifest__2-rich">Kde veci nemusia byť urýchľované, vysvetľované ani riadené.</p>
    <a class="lh-cta" href="/zdravy-svet">Zdravý svet ${arrow}</a>
  </div>
  <div class="lh-split__media">${picture(IMG.sky,"Nočná obloha nad tmavou krajinou",'data-par="8" loading="lazy"')}</div>
</section>`;

  const collection = `
<section class="lh-split lh-split--flip lh-split--dark lh-split--narrow-text lh-split--tall" id="kolekcia" data-sk-only data-screen-label="03 Kolekcia">
  <div class="lh-split__media">${picture(IMG.vyziva,"Strom v krajine",'data-par="9" loading="lazy"')}</div>
  <div class="lh-split__text">
    <p class="lh-eyebrow">Kolekcia</p>
    <h2 class="lh-display" data-content="home__kolekcia__0-text">Kolekcia</h2>
    <div class="lh-list">${items.map(p => listRow(p.n, p.name, p.price, `/eshop/produkt/${p.slug}`)).join('')}</div>
    <a class="lh-cta" href="/eshop">Celý obchod ${arrow}</a>
  </div>
</section>`;

  const programme = `
<section class="lh-split lh-split--paper lh-split--wide-media" id="program" data-sk-only data-screen-label="04 Program">
  <div class="lh-split__text">
    <p class="lh-eyebrow">Program RESET 40+</p>
    <h2 class="lh-display" data-content="home__program__0-text">AI ANASTASIA Longevity Academy</h2>
    <p class="lh-lead" data-content="home__program__2-rich">16 týždňov, ktoré môžu zmeniť váš pohľad na zdravie, energiu a starnutie.</p>
    <a class="lh-cta" href="/eshop/produkt/reset-40-plus">Objaviť RESET 40+ ${arrow}</a>
  </div>
  <div class="lh-split__media">${picture(IMG.program,"Světlo v lese",'data-par="10" loading="lazy"')}</div>
  <div class="lh-stats">
    <div><strong>16</strong><span>týždňov</span></div>
    <div><strong>∞</strong><span>vlastné tempo</span></div>
    <div><strong>1×</strong><span>jednorazový prístup</span></div>
  </div>
</section>`;

  // --- RESET: vodorovný pás tém (bod 5) -----------------------------------
  const reset = `
<section class="lh-reset" id="lh-reset" data-sk-only aria-labelledby="lh-rh">
  <div class="lh-reset__pin">
    <div class="lh-reset__head">
      <h2 id="lh-rh" class="lh-display" data-content="home__reset__0-text">AI ANASTASIA RESET 40+</h2>
      <div class="lh-reset__buy">
        <span class="lh-reset__price">168 €</span>
        <a class="lh-cta lh-cta--gold" href="/eshop/produkt/reset-40-plus">Začať RESET 40+ ${arrow}</a>
      </div>
    </div>
    <div class="lh-track" id="lh-track">
      ${topics.map(([n, title, text]) => `<article class="lh-topic"><b>${n}</b><div><h3>${e(title)}</h3><p>${e(text)}</p></div></article>`).join('')}
      <article class="lh-topic lh-topic--more"><b>+8</b><div><h3>Ďalšie témy</h3><p>Týždne 9 až 16 nájdete v plnom popise programu.</p></div></article>
    </div>
  </div>
</section>`;

  // --- Obloha: kruhové okno do noci (bod 2) --------------------------------
  const sky = `
<section class="lh-sky" id="lh-obloha" data-sk-only aria-labelledby="lh-skh">
  <div class="lh-sky__stage">
    <p class="lh-sky__pre" aria-hidden="true">Pozrite sa hore</p>
    <div class="lh-sky__win">
      <img loading="lazy" decoding="async" class="lh-sky__poster" src="${IMG.sky}" alt="Nočná obloha nad tmavou krajinou">
      <video id="lh-sky-video" muted loop playsinline preload="none" fetchpriority="low" aria-hidden="true">
        <source src="/media/night-sky.mp4" type="video/mp4">
      </video>
    </div>
    <div class="lh-sky__txt">
      <p class="lh-eyebrow">Pod hviezdami · Konzultácia</p>
      <h2 id="lh-skh" class="lh-display" data-content="home__obloha__0-text">Čo môžeme spolu riešiť?</h2>
      <p>Astrologický profil zdravia a vitality – jedna zo štyroch Luciiných konzultácií.</p>
      <a class="lh-cta lh-cta--gold" href="/eshop/produkt/astrologia-zdravie-predispozicia">Objaviť profil ${arrow}</a>
    </div>
  </div>
</section>`;

  const consultations = `
<section class="lh-split lh-split--flip lh-split--wide-text lh-split--low" id="konzultacie" data-sk-only data-screen-label="06 Konzultácie">
  <div class="lh-lucia">
    <div class="lh-lucia__frame">${picture(IMG.lucia,"Mgr. Lucia Rogožanová, zakladateľka ANASTASIA",'data-par="8" loading="lazy"')}</div>
    <div class="lh-lucia__float" data-speed="-90">${picture(IMG.vyziva,"",'data-par="10" loading="lazy"')}</div>
  </div>
  <div class="lh-split__text" data-speed="50">
    <p class="lh-eyebrow">Sprevádzanie</p>
    <h2 class="lh-display" data-content="home__sluzby__0-text">Čo získate?</h2>
    <div class="lh-list">${consults.map(c => listRow(c.n, c.title, c.sub, c.href)).join('')}</div>
    <a class="lh-cta" href="/konzultacie">Všetky konzultácie ${arrow}</a>
  </div>
</section>`;

  // --- Svět ANASTASIA: vrstvené karty (bod 4) ------------------------------
  const stack = `
<section class="lh-stack" id="lh-stack" data-sk-only data-screen-label="07 Svet ANASTASIA">
  <div class="lh-stack__head">
    <h2 class="lh-display" data-content="home__svet__0-text">Môžeš tu nájsť audio záznamy, texty, priestory bez vysvetlenia.</h2>
    <p>Jedna filozofia, štyri podoby. Od krému miešaného na mieru po šestnásťtýždňový program.</p>
  </div>
  <div class="lh-stack__items">
    ${worlds.map(w => `
    <article class="lh-card lh-card--${w.tone}">
      <div class="lh-card__bg" style="background-image:url(${w.img})"></div>
      <div class="lh-card__shade"></div>
      <div class="lh-card__txt">
        <h3><small>${w.n} · ${e(w.from)}</small>${e(w.title)}</h3>
        <p>${e(w.text)}</p>
        <a class="lh-cta lh-cta--gold" href="${w.href}">Objaviť ${arrow}</a>
      </div>
    </article>`).join('')}
  </div>
</section>`;

  const contact = `
<section class="lh-contact" data-sk-only data-screen-label="08 Kontakt">
  <p class="lh-eyebrow">Kontakt</p>
  <h2 class="lh-display" data-content="home__kontakt__0-text">Kontakt</h2>
  <p class="lh-lead lh-lead--center" data-content="home__kontakt__2-rich">Otázka k produktu, programu alebo konzultácii? Tu je priestor pre vás.</p>
  <a class="lh-cta" href="/kontakt">Napíšte nám ${arrow}</a>
</section>`;

  return [hero, manifesto, collection, programme, reset, sky, consultations, stack, contact].join('\n');
}

// CSS homepage. Drží se v jednom bloku, aby se design dal přehledně měnit.
export const HOME_CSS = `
.lh-display{font-family:'Fraunces',Georgia,serif;font-style:normal;font-weight:300;font-size:clamp(27px,3.2vw,50px);line-height:1.1;letter-spacing:-.005em;display:block;color:var(--site-cream,#EFE5C7)}
.lh-caps{font-family:'Fraunces',Georgia,serif;font-weight:300;font-size:clamp(28px,3.8vw,64px);line-height:1.02;letter-spacing:0;text-transform:uppercase;display:block;margin-top:.14em;color:var(--site-cream,#EFE5C7)}
.lh-eyebrow{font-size:11px;font-weight:400;letter-spacing:.2em;text-transform:uppercase;color:var(--site-accent,#C9A355);margin:0}
.lh-lead{font-size:clamp(15px,1.15vw,17px);line-height:1.7;color:currentColor;opacity:.78;max-width:44ch;margin:0}
.lh-lead--center{margin-inline:auto;text-align:center}
.lh-cta{display:inline-flex;align-items:center;gap:22px;align-self:flex-start;height:54px;padding:0 26px;border-radius:27px;background:var(--site-main,#283020);color:var(--site-cream,#EFE5C7);font-size:14px;font-weight:400;border:1px solid var(--site-main,#283020);transition:background .3s,color .3s,border-color .3s}
.lh-cta:hover{background:var(--site-deep,#26321E);border-color:var(--site-deep,#26321E)}
.lh-cta .arrow{width:20px;height:20px}
.lh-cta--ghost{background:rgba(255,255,255,.09);border-color:rgba(255,255,255,.22);color:var(--site-cream,#EFE5C7);backdrop-filter:blur(14px) saturate(140%);-webkit-backdrop-filter:blur(14px) saturate(140%)}
.lh-cta--ghost:hover{background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.32)}
.lh-cta--gold{background:var(--site-accent-light,#D8C598);border-color:transparent;color:#1E281C}
.lh-cta--gold:hover{background:#fff;border-color:transparent}

/* --- Úvod: maska se slovem ANASTASIA, video prosvítá jen písmeny ---------- */
.lh-intro{position:relative;height:100svh;min-height:640px}
.motion .lh-intro{height:380svh}
/* Po prvním přehrání je úvod hero sekcí: bez zoomu, bez kategorií. */
html.lh-hero-mode .lh-intro{height:100svh;min-height:640px}
html.lh-hero-mode .lh-intro__cats{display:none}
.lh-intro__stage{position:sticky;top:0;height:100svh;overflow:hidden;background:var(--lh-paper,#F5F2E8)}
.lh-intro__video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .6s ease}
.lh-intro__video.lh-ready{opacity:1}
.lh-intro__tint{display:none}
.motion .lh-intro__tint{display:block;position:absolute;inset:0;background:rgba(14,20,13,.4)}
.lh-intro__veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(14,20,13,.5),rgba(14,20,13,.28) 40%,rgba(14,20,13,.8)),radial-gradient(120% 70% at 0% 100%,rgba(14,20,13,.55),transparent 70%)}
.motion .lh-intro__veil{opacity:0}
.lh-intro__mask{position:absolute;inset:0;display:none}

.motion .lh-intro__mask{display:block}
.lh-intro__mask svg{position:absolute;inset:0 var(--lh-gut,16px);width:calc(100% - 2*var(--lh-gut,16px));height:100%;overflow:visible}
.lh-intro__meta{position:absolute;inset:0;pointer-events:none;color:var(--lh-ink,#1E281C);display:none}
.motion .lh-intro__meta{display:block}
.lh-intro__meta .k{position:absolute;top:clamp(96px,16vh,160px);left:0;right:0;margin:0;text-align:center;font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:var(--lh-muted,#6E7468)}
.lh-intro__meta .k span{display:block}
.lh-intro__meta ul{position:absolute;bottom:clamp(96px,14vh,140px);left:var(--lh-gut,16px);right:var(--lh-gut,16px);margin:0;padding:0;list-style:none;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px 24px;font-size:13px;letter-spacing:.18em;text-transform:uppercase;max-width:1100px;margin-inline:auto}
.lh-intro__meta li::before{content:"";display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--site-accent,#C9A355);margin:0 10px 2px 0}
/* --- Tři loga v řadě nad úvodem: hlavní uprostřed, boční symetricky -------- */
.lh-intro__brands{position:absolute;top:clamp(24px,5vh,58px);left:0;right:0;z-index:3;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:56px;color:#EFE5C7;pointer-events:none}
.motion .lh-intro__brands{color:var(--lh-ink,#1E281C)}
.lh-brand{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-decoration:none;color:inherit;pointer-events:auto;opacity:1}
.motion .lh-brand{opacity:0}
.lh-brand--academy{order:1;height:96px}
.lh-brand--main{order:2;height:96px}
.lh-brand--ai{order:3;height:96px}
.lh-brand__lock{position:relative;display:flex;align-items:center;justify-content:center;height:100%}
.lh-brand__lock--mark{height:auto;width:46px}
.lh-brand__mark{height:100%;width:auto;display:block}
.lh-brand--main .lh-brand__mark{filter:invert(1) sepia(.3) saturate(1.4) brightness(.95)}
.motion .lh-brand--main .lh-brand__mark{filter:none}
.lh-brand__lock--mark .lh-brand__mark{height:auto;width:100%}
/* Zlatý odlesk: kopie loga pod maskou, která se posouvá přes obraz. */
.lh-brand__img--shine{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;filter:sepia(.85) saturate(2.6) hue-rotate(3deg) brightness(1.05);-webkit-mask-image:linear-gradient(100deg,transparent 46%,#000 50%,transparent 54%);mask-image:linear-gradient(100deg,transparent 46%,#000 50%,transparent 54%);-webkit-mask-size:250% 100%;mask-size:250% 100%;-webkit-mask-position:150% 0;mask-position:150% 0}
.lh-brand__stem{width:1px;height:22px;background:linear-gradient(180deg,rgba(201,163,85,0),var(--site-accent,#C9A355))}
.lh-brand__name{font-weight:200;font-size:clamp(16px,1.4vw,26px);letter-spacing:.3em;padding-left:.3em;white-space:nowrap;--lh-shim-base:var(--lh-ink,#1E281C)}
.lh-brand__sub{color:#8A6520!important;display:flex;align-items:center;gap:10px;font-weight:300;font-size:clamp(10px,.95vw,14px);letter-spacing:.44em;padding-left:.44em;color:var(--site-accent,#C9A355);white-space:nowrap;--lh-shim-base:var(--site-accent,#C9A355)}
.lh-brand__sub i{width:20px;height:1px;background:currentColor}
.lh-shimmer-text--gold{--lh-shim-base:var(--site-accent,#C9A355)}
/* Odlesk textu: barva zůstává, přes ni přejede úzký zlatý pruh. */
.motion .lh-shimmer-text,.motion .lh-cat{background-image:linear-gradient(100deg,var(--lh-shim-base,#1E281C) 0 46%,#D8C598 48%,#F3E3B0 50%,var(--lh-shim-base,#1E281C) 52% 100%);background-size:250% 100%;background-position:150% 0;-webkit-background-clip:text;background-clip:text;color:transparent}
.motion .lh-cat{--lh-shim-base:var(--lh-ink,#1E281C)}
@media (max-width:699.98px){
  .lh-intro__brands{top:clamp(16px,2.6vh,34px);gap:12px 22px}
  .lh-brand--main{flex:0 0 auto;height:58px}
  .lh-brand--academy,.lh-brand--ai{height:58px}
  .lh-brand__lock--mark{width:34px}
  .lh-brand__stem{height:14px}
  .lh-brand__name{font-size:13px;letter-spacing:.24em;padding-left:.24em}
  .lh-brand__sub{font-size:9px;letter-spacing:.3em;padding-left:.3em;gap:6px}
  .lh-brand__sub i{width:12px}
}
.lh-say{position:absolute;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.45),0 4px 28px rgba(0,0,0,.4)}
.lh-say .lh-cta{text-shadow:none}
.lh-say .lh-display{display:block;font-family:'Fraunces',Georgia,serif;font-weight:300;font-size:clamp(44px,8vw,132px);line-height:.95}
.lh-say__note{display:block;max-width:52ch;margin-top:18px;font-size:clamp(15px,1.05vw,17px);font-weight:400;line-height:1.65;color:#EFEAE0}
.lh-say--one{left:var(--lh-gut,16px);bottom:14vh;max-width:min(92vw,1100px);display:none}
.motion .lh-say--one{display:block;opacity:0}
.lh-say--two{left:6vw;right:auto;top:auto;bottom:14vh;text-align:left;max-width:560px}
.lh-say--two .lh-eyebrow{margin:0 0 14px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#E6D3A3}
.lh-say--two .lh-display{font-size:clamp(28px,2.6vw,44px);line-height:1.22;max-width:560px;font-weight:300}
.lh-say--two .lh-cta{margin-top:26px}
@media (prefers-reduced-motion:reduce){.lh-say--two{display:none}}
.motion .lh-say{opacity:0}
.motion .lh-say--one,.motion .lh-say--two{opacity:0}
.lh-vid-btn{position:absolute;right:auto;left:calc(var(--lh-gut,16px) + 8px);bottom:24px;width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.5);background:rgba(0,0,0,.15);color:#fff;font:inherit;font-size:13px;cursor:pointer;opacity:0}
.motion .lh-vid-btn{opacity:1}
.lh-scroll-cue{position:absolute;bottom:28px;left:50%;transform:translateX(-50%);font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:var(--lh-muted,#6E7468);display:flex;flex-direction:column;align-items:center;gap:10px}
.lh-scroll-cue i{width:1px;height:44px;background:linear-gradient(var(--site-accent-light,#D8C598),transparent);animation:lh-cue 2.2s ease-in-out infinite}
@keyframes lh-cue{0%{transform:scaleY(0);transform-origin:top}50%{transform:scaleY(1);transform-origin:top}51%{transform-origin:bottom}100%{transform:scaleY(0);transform-origin:bottom}}
@media (prefers-reduced-motion:reduce){.lh-scroll-cue i{animation:none}}

/* --- Hlavička nad úvodem: barva podle toho, kde je scroll ------------------ */
.lh-top{position:fixed;left:0;right:0;top:0;z-index:40;opacity:1;transform:none;pointer-events:auto;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:24px;padding:14px clamp(16px,4vw,64px);border-bottom:1px solid rgba(201,163,85,.28);color:var(--lh-ink,#1E281C);background:none;backdrop-filter:none;-webkit-backdrop-filter:none;transition:opacity .6s var(--ana-ease-soft),transform .6s var(--ana-ease-soft),color .4s ease,background-color .4s ease}
.lh-top{background:transparent;border:0;border-radius:0;box-shadow:none}
.lh-top__side{display:flex;align-items:center;gap:clamp(18px,2.4vw,40px);font-size:12px;letter-spacing:1.6px;text-transform:uppercase;font-weight:400}
.lh-top__side--right{justify-content:flex-end}
.lh-top__side a{color:inherit;text-decoration:none}
.lh-top__brand{display:flex;flex-direction:column;align-items:center;gap:5px;color:inherit;text-decoration:none}
.lh-top__brand img{width:34px;height:34px;object-fit:contain;filter:brightness(.2)}
.lh-top__brand span{font-size:14px;letter-spacing:.42em;font-weight:500;display:flex;flex-direction:column;align-items:center;gap:3px;padding-left:.42em}
.lh-top__brand small{font-size:7px;letter-spacing:.3em;opacity:.75}
.lh-top__menu{display:inline-flex;align-items:center;gap:12px;height:50px;padding:0 22px;border-radius:80px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.09);color:inherit;font-family:inherit;font-size:15px;letter-spacing:0;text-transform:none;cursor:pointer;backdrop-filter:blur(14px) saturate(140%);-webkit-backdrop-filter:blur(14px) saturate(140%);transition:background .3s,border-color .3s}
.lh-top__menu:hover{background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.32)}
.lh-top__burger{display:flex;flex-direction:column;gap:4px}
.lh-top__burger i{width:20px;height:1px;background:currentColor}
/* Hlavička je vidět na všech stránkách. Skrytá je jen na úvodu webu (preloader),
   kde se s chromem objeví až za úvodem. */
.lh-intro-page:not(.lh-chrome-in) 
.lh-chrome-in .lh-top{opacity:1;transform:none;pointer-events:auto}
/* Boční lišta se na začátku úvodu schová a po prvním skrolu se vrátí. */
.lh-intro-page #ana-rail{opacity:0;transform:translateX(-14px);pointer-events:none;transition:opacity .6s var(--ana-ease-soft),transform .6s var(--ana-ease-soft)}
.lh-intro-page.lh-chrome-in #ana-rail{opacity:1;transform:none;pointer-events:auto}
/* Obsah úvodu je přes celou šířku; až s lištou se odsadí. Ostatní stránky
   drží odsazení pořád, jako předtím. */
.lh-intro-page .dc-root{padding-left:0;transition:padding-left .6s var(--ana-ease-soft)}
.lh-intro-page.lh-chrome-in .dc-root{padding-left:var(--rail-pad)}
.lh-top--dark{color:#fff}
.lh-top--dark .lh-top__brand img{filter:invert(1) sepia(.3) saturate(1.4) brightness(.95)}
.lh-top--solid{background:rgba(244,241,235,.86);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.lh-top--solid .lh-top__brand img{filter:brightness(.2)}
@media (max-width:760px){
  .lh-top{grid-template-columns:auto auto;justify-content:space-between;padding:16px 20px}
  .lh-top__side a:not([aria-label="Košík"]):not(.lh-top__menu){display:none}
  .lh-top__side--right{display:flex;gap:14px}
  .lh-top__side--right>a:not(.lh-top__menu){font-size:11px}
}
/* Úzký telefon: lišta se musí vejít do šířky displeje, jinak ho prohlížeč oddálí. */
@media (max-width:480px){
  .lh-top{padding:12px 14px;gap:10px}
  .lh-top__side--right{gap:8px;min-width:0}
  .lh-top__side--right>a:not(.lh-top__menu):not([href*="kosik"]){display:none}
  .lh-top__menu{padding:0 14px;gap:8px}
}

/* --- Kategorie se objevují jedna po druhé kolem slova --------------------- */
.lh-intro__cats{position:absolute;inset:0;pointer-events:none}
.lh-cat{text-shadow:0 1px 14px rgba(245,242,232,.92),0 0 4px rgba(245,242,232,.85);position:absolute;pointer-events:auto;font-weight:200;font-size:clamp(26px,3.4vw,54px);line-height:1.1;letter-spacing:-.03em;color:var(--lh-ink,#1E281C);opacity:0;text-decoration:none;white-space:nowrap}
.lh-cat--1{top:16vh;left:9%}
.lh-cat--2{bottom:22vh;right:11%}
.lh-cat--3{top:30vh;right:13%}
.lh-cat--4{bottom:15vh;left:12%}
@media (max-width:760px){
  /* r12/1: na mobilu logo vľavo, košík a Menu vpravo, hlavička fixná. */
  .lh-top{grid-template-columns:auto minmax(0,1fr);gap:12px;padding:9px 14px}
  .lh-top__side--right{grid-column:2;justify-self:end}
  .lh-top>nav:first-child>a{display:none}
  .lh-top>nav:first-child .lh-top__menu{display:inline-flex!important;flex:0 0 auto}
  .lh-top__brand{align-items:flex-start;gap:0}
  .lh-top__brand span{display:none}
  .lh-top__brand img{width:30px;height:30px}
  .lh-top__side--right{gap:10px;font-size:11px}
  .lh-top__side--right>a:not([aria-label="Košík"]){display:none}
  .lh-top__side--right .lh-top__menu{display:none}
  .lh-top__menu{height:36px;padding:0 14px;gap:8px;font-size:11px;letter-spacing:1.2px}
  .lh-intro-page:not(.lh-chrome-in) .lh-top__brand{display:none}
  .lh-intro__brands{top:62px;gap:0 14px;flex-wrap:nowrap;justify-content:center}
  .lh-brand--main,.lh-brand--academy,.lh-brand--ai{height:58px;flex:0 0 auto}
  .lh-brand__lock--mark{width:26px}
  .lh-brand__name{font-size:11px;letter-spacing:.18em;padding-left:.18em}
  .lh-brand__sub{font-size:8px;letter-spacing:.22em;padding-left:.22em;gap:5px}
  .lh-brand__sub i{width:9px}
  .lh-brand__stem{height:10px}
  .lh-intro__cats{position:absolute;left:0;right:0;top:auto;bottom:20vh;height:0;display:block}
  .lh-cat{position:absolute;left:0;right:0;top:auto;bottom:0;width:100%;font-size:21px;white-space:normal;text-align:center;line-height:1.2}
  .lh-intro__meta .k{font-size:10px;letter-spacing:.22em}
}

/* --- Výzva ke skrolování: tlačítko, ne text, který vypadá jako odkaz ------ */
.lh-enter-wrap{position:absolute;bottom:26px;left:50%;transform:translateX(-50%);z-index:4;display:flex;flex-direction:column;align-items:center;gap:12px}
.lh-enter{display:inline-flex;align-items:center;gap:16px;height:54px;padding:0 26px;border-radius:27px;background:rgba(255,255,255,.42);border:1px solid rgba(255,255,255,.78);box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 2px 6px rgba(40,48,32,.06);backdrop-filter:blur(14px) saturate(140%);-webkit-backdrop-filter:blur(14px) saturate(140%);color:var(--lh-ink,#1E281C);font-family:inherit;font-size:13px;letter-spacing:.2em;text-transform:uppercase;cursor:pointer;transition:background .35s,border-color .35s,transform .35s}
.lh-enter:hover{background:rgba(255,255,255,.68);transform:translateY(-2px)}
.lh-enter__arrow{font-size:16px;letter-spacing:0;animation:lh-arrow 1.9s ease-in-out infinite}
@keyframes lh-arrow{0%,100%{transform:translateY(0)}50%{transform:translateY(5px)}}
.lh-or{display:flex;flex-direction:column;align-items:center;gap:8px;font-size:10px;letter-spacing:.26em;text-transform:uppercase;color:var(--lh-muted,#6E7468)}
.lh-or .lh-scroll-cue__wheel{width:18px;height:28px}
@media (prefers-reduced-motion:reduce){.lh-enter__arrow{animation:none}}

/* --- Zvuk v úvodu, dokud není vidět lišta ------------------------------- */
/* r12/2a: na mobile je úvod bez scrollu – iba tlačidlo Vstúpte. */
html.lh-locked,html.lh-locked body{overflow:hidden!important;height:100%;overscroll-behavior:none}
html.lh-mobile-intro .lh-intro{height:100svh!important;min-height:560px!important}
html.lh-mobile-intro .lh-intro__stage{height:100svh!important}
@media (max-width:768px),(pointer:coarse){
  .lh-or{display:none!important}
  .lh-enter{height:64px;padding:0 34px;font-size:15px;letter-spacing:.22em}
  .lh-enter-wrap{bottom:34px}
}
/* r12/2b: ak maska nejde vykresliť, ostane čitateľný tmavý nápis. */
.lh-intro__fallback{display:none;position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;font-family:'Fraunces',Georgia,serif;font-style:italic;font-weight:300;font-size:clamp(38px,11vw,72px);letter-spacing:.04em;color:#283020}
@supports (mask:url(#lhWord)){.lh-intro__fallback{display:none!important}}
@media (max-width:768px),(pointer:coarse){.motion .lh-intro__mask #lh-word-tint{opacity:.88!important}}
.lh-intro__sound{position:absolute;right:calc(var(--lh-gut,16px) + 8px);bottom:24px;z-index:4;width:44px;height:44px;border-radius:22px;display:grid;place-items:center;background:rgba(255,255,255,.4);border:1px solid rgba(255,255,255,.7);color:var(--lh-ink,#1E281C);cursor:pointer;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);transition:opacity .5s}
.lh-intro__sound .lh-sound-on{display:none}
.lh-intro__sound.is-on{background:var(--site-accent-light,#D8C598)!important;border-color:var(--site-accent,#C9A355)!important;color:#1E281C!important}
.lh-intro__sound.is-on .lh-sound-on{display:block}
.lh-intro__sound.is-on .lh-sound-off{display:none}
.lh-intro__sound .media-label{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.lh-chrome-in .lh-intro__sound{opacity:0;pointer-events:none}


.lh-scroll-cue__wheel{width:20px;height:32px;border:1px solid currentColor;border-radius:12px;display:grid;place-items:start center;padding-top:6px}
.lh-scroll-cue__wheel i{width:3px;height:6px;border-radius:2px;background:currentColor;animation:lh-wheel 1.8s ease-in-out infinite}
@keyframes lh-wheel{0%{transform:translateY(0);opacity:0}30%{opacity:1}70%{opacity:1}100%{transform:translateY(10px);opacity:0}}
@media (prefers-reduced-motion:reduce){.lh-scroll-cue__wheel i{animation:none;opacity:1}}

/* --- Split sekce ---------------------------------------------------------- */
.lh-split{position:relative;display:grid;grid-template-columns:1fr 1fr;min-height:min(86vh,860px);background:var(--site-main,#283020);color:var(--site-cream,#EFE5C7);overflow:hidden}
/* Každá sekce má jiný poměr – mřížka není pravidelná jako na referenci. */
.lh-split--wide-text{grid-template-columns:minmax(0,58%) minmax(0,42%)}
.lh-split--wide-media{grid-template-columns:minmax(0,42%) minmax(0,58%)}
.lh-split--narrow-text{grid-template-columns:minmax(0,36%) minmax(0,64%)}
.lh-split--tall{min-height:min(96vh,980px)}
.lh-split--low .lh-split__text{justify-content:flex-end}
.lh-split--high .lh-split__text{justify-content:flex-start;padding-top:clamp(40px,6vw,96px)}
.lh-split--flip .lh-split__media{order:-1}
.lh-split--paper{background:var(--lh-paper,#F4F1EB);color:var(--lh-ink,#1E281C)}
.lh-split__text{display:flex;flex-direction:column;justify-content:center;gap:clamp(20px,2.4vw,34px);padding:clamp(56px,7vw,120px) clamp(28px,5vw,96px)}
.lh-split--paper .lh-display,.lh-split--paper .lh-caps{color:var(--lh-ink,#1E281C)}
.lh-split__media{position:relative;overflow:hidden;min-height:380px;background:var(--site-deep,#26321E)}
.lh-split__media img{position:absolute;left:0;top:-12%;width:100%;height:124%;object-fit:cover}
.lh-split--paper .lh-cta{background:var(--lh-ink,#1E281C);border-color:var(--lh-ink,#1E281C);color:var(--lh-paper,#F4F1EB)}

.lh-list{display:flex;flex-direction:column;border-top:1px solid currentColor}
.lh-row{display:grid;grid-template-columns:44px minmax(0,1fr) auto;align-items:center;gap:16px;padding:20px 0;border-bottom:1px solid rgba(239,229,199,.18);transition:padding .35s var(--ana-ease-soft)}
.lh-split--paper .lh-row{border-bottom-color:rgba(30,40,28,.16)}
.lh-row:hover{padding-left:12px}
.lh-row__n{font-size:12px;letter-spacing:.12em;color:var(--site-accent,#C9A355)}
.lh-row__body{display:flex;flex-direction:column;gap:4px;min-width:0}
.lh-row__body strong{font-weight:300;font-size:clamp(19px,1.7vw,26px);letter-spacing:-.02em;line-height:1.2}
.lh-row__body small{font-size:13px;color:currentColor;opacity:.7}
.lh-row__arrow{font-size:16px;opacity:.7}

.lh-stats{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:rgba(30,40,28,.14);border-top:1px solid rgba(30,40,28,.14)}
.lh-stats>div{background:var(--lh-paper,#F4F1EB);color:var(--lh-ink,#1E281C);padding:clamp(28px,4vw,52px) clamp(20px,3vw,44px);display:flex;flex-direction:column;gap:8px}
.lh-stats strong{font-weight:100;font-size:clamp(38px,4.6vw,68px);line-height:1;letter-spacing:-.04em}
.lh-stats span{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:currentColor;opacity:.7}

/* --- Lucia: portrét a menšia fotka inou rychlostí -------------------------- */
.lh-lucia{position:relative;overflow:hidden;min-height:380px;background:var(--site-deep,#26321E)}
.lh-lucia__frame{position:absolute;inset:0;overflow:hidden}
.lh-lucia__frame img{position:absolute;left:0;top:-12%;width:100%;height:124%;object-fit:cover;object-position:center 40%}
.lh-lucia__float{position:absolute;right:-8%;bottom:-10%;width:42%;aspect-ratio:3/4;overflow:hidden;border:10px solid var(--lh-paper,#F4F1EB)}
.lh-lucia__float img{position:absolute;left:0;top:-12%;width:100%;height:124%;object-fit:cover;object-position:center 70%}

/* --- RESET: vodorovný pás tém -------------------------------------------- */
.lh-reset{background:var(--site-main,#283020);color:#EDE7DA;overflow:hidden}
.lh-reset__pin{min-height:100svh;display:flex;flex-direction:column;justify-content:center;gap:48px;padding-block:clamp(64px,8vw,96px)}
.lh-reset__head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:24px;max-width:1440px;margin:0 auto;width:100%;padding-inline:clamp(20px,4vw,64px)}
.lh-reset__head .lh-display{font-size:clamp(40px,5vw,68px);color:var(--site-accent-light,#D8C598)}
.lh-reset__head .lh-caps{font-size:clamp(34px,4.6vw,64px)}
.lh-reset__buy{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.lh-reset__price{font-family:'Fraunces',Georgia,serif;font-size:36px;color:var(--site-accent-light,#D8C598)}
.lh-track{display:flex;gap:20px;width:max-content;padding-inline:clamp(20px,4vw,64px)}
.lh-topic{flex:0 0 min(78vw,340px);min-height:300px;padding:28px;border:1px solid rgba(227,205,156,.28);border-radius:2px;display:flex;flex-direction:column;justify-content:space-between;background:rgba(255,255,255,.03)}
.lh-topic b{font-family:'Fraunces',Georgia,serif;font-weight:400;font-size:54px;line-height:1;color:var(--site-accent-light,#D8C598)}
.lh-topic h3{margin:0 0 8px;font-size:22px;font-weight:400;letter-spacing:0}
.lh-topic p{margin:0;font-size:15px;color:#BFB9A9;line-height:1.5}
.lh-topic--more{background:var(--site-accent-light,#D8C598);color:var(--site-dark,#14200F);border-color:transparent}
.lh-topic--more p{color:var(--lh-ink,#1E281C);opacity:.8}
@media (max-width:760px){.lh-track{flex-direction:column;width:auto;padding-inline:24px}.lh-topic{flex:none;min-height:0}.lh-reset__pin{min-height:0}}

/* --- Obloha: kruh sa otvorí na celú obrazovku ------------------------------ */
.lh-sky{position:relative;height:100svh;background:#070A0E;color:#EDE7DA}
.motion .lh-sky{height:280svh}
.lh-sky__stage{position:sticky;top:0;height:100svh;overflow:hidden;display:grid;place-items:center;text-align:center}
.lh-sky__win{position:absolute;inset:0;clip-path:circle(80% at 50% 50%)}
.motion .lh-sky__win{clip-path:circle(7% at 50% 50%)}
.lh-sky__poster{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.lh-sky__win video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .6s ease}
.lh-sky__win video.lh-ready{opacity:1}
.lh-sky__win::after{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,rgba(7,10,14,.55),rgba(7,10,14,.15) 55%,rgba(7,10,14,.6))}
.lh-sky__pre{position:absolute;top:calc(50% - 7vmax - 64px);left:0;right:0;font-size:12px;letter-spacing:.34em;text-transform:uppercase;color:#9C9785}
.lh-sky__txt{position:relative;z-index:2;padding-inline:clamp(20px,4vw,64px);text-shadow:0 2px 24px rgba(0,0,0,.5)}
.lh-sky__txt .lh-display{font-size:clamp(44px,6vw,88px);color:var(--site-accent-light,#D8C598)}
.lh-sky__txt .lh-caps{font-size:clamp(40px,6.4vw,100px);color:#EDE7DA}
.lh-sky__txt p:last-of-type{max-width:460px;margin:22px auto 28px;font-weight:300;color:#CFC9B9}
.lh-sky__txt .lh-cta{align-self:center}
.motion .lh-sky__txt{opacity:0}

/* --- Svět ANASTASIA: vrstvené karty ---------------------------------------- */
.lh-stack{background:var(--lh-paper,#F4F1EB);color:var(--lh-ink,#1E281C)}
.lh-stack__head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:24px;max-width:1440px;margin:0 auto;width:100%;padding:clamp(72px,9vw,120px) clamp(20px,4vw,64px) clamp(32px,4vw,48px)}
.lh-stack__head .lh-display{font-size:clamp(40px,5vw,64px);color:var(--lh-ink,#1E281C)}
.lh-stack__head .lh-caps{font-size:clamp(34px,4.4vw,60px);color:var(--lh-ink,#1E281C)}
.lh-stack__head p{max-width:420px;color:currentColor;opacity:.8;margin:0}
.lh-stack__items{position:relative}
.lh-card{position:sticky;top:0;height:100svh;min-height:560px;display:flex;align-items:flex-end;overflow:hidden;color:#fff}
.lh-card__bg{position:absolute;inset:0;background-size:cover;background-position:center;will-change:transform}
.lh-card--light .lh-card__bg{background-color:#D8CDB8}
.lh-card--dark .lh-card__bg{background-color:#3B4537}
.lh-card__shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(14,18,14,.05) 30%,rgba(14,18,14,.72))}
.lh-card__txt{position:relative;z-index:2;width:100%;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:24px;padding:0 clamp(20px,4vw,64px) clamp(40px,6vw,80px)}
.lh-card__txt h3{font-family:'Figtree','Helvetica Neue',sans-serif;font-style:normal;font-weight:200;font-size:clamp(46px,7.4vw,118px);line-height:.95;margin:0}
.lh-card__txt h3 small{display:block;font-family:'Figtree',sans-serif;font-style:normal;font-size:13px;letter-spacing:.28em;text-transform:uppercase;margin-bottom:14px;color:var(--site-accent-light,#D8C598)}
.lh-card__txt p{max-width:400px;margin:0;font-weight:300;font-size:17px;color:#EDE7DA}

/* --- Kontakt --------------------------------------------------------------- */
.lh-contact{display:flex;flex-direction:column;align-items:center;text-align:center;gap:clamp(18px,2.2vw,30px);padding:clamp(88px,11vw,170px) clamp(20px,4vw,64px);background:var(--lh-paper,#F4F1EB);color:var(--lh-ink,#1E281C)}
.lh-contact .lh-display,.lh-contact .lh-caps{color:var(--lh-ink,#1E281C)}
.lh-contact .lh-cta{background:var(--lh-ink,#1E281C);border-color:var(--lh-ink,#1E281C);color:var(--lh-paper,#F4F1EB)}

@media(max-width:999.98px){
  .lh-split{grid-template-columns:1fr;min-height:0}
  .lh-split--flip .lh-split__media{order:0}
  .lh-split__media{min-height:58vw}
  .lh-split__text{padding:clamp(48px,9vw,72px) 24px}
  .lh-stats{grid-template-columns:1fr}
  .lh-lucia{min-height:70vw}
  .lh-lucia__float{right:-3%;bottom:-6%;width:38%;border-width:8px}
  .lh-say--two{top:auto;bottom:14vh;left:var(--lh-gut,16px);text-align:left}
  .lh-say--two p:last-child{margin-left:0}
}
@media(max-width:600px){
  .lh-intro{height:92svh;min-height:560px}
  .lh-intro__meta ul{justify-content:center;font-size:11px}
  .lh-card{height:auto;min-height:0;position:relative;padding:clamp(80px,20vw,120px) 0}
  .lh-card__bg{position:absolute;inset:0}
  .lh-card__shade{background:linear-gradient(180deg,rgba(14,18,14,.12) 18%,rgba(14,18,14,.84) 78%)}
  .lh-stack__items{display:flex;flex-direction:column}
  .lh-reset__head{flex-direction:column;align-items:flex-start}
}
`;
