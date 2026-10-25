// ANASTASIA — homepage.
//
// Rozvržení a pohyb podle spojovacího handoffu (design/HANDOFF-merge.md):
// informační architektura, split sekce, boční lišta a footer zůstávají;
// úvod s maskou, obloha, parallax, vrstvené karty a vodorovný pás jsou nové.
//
// Obsah je slovenský a značkový. Barvy jdou přes --site-* proměnné, takže motiv,
// který Lucia vybere v adminu, platí i tady.

import {escape as e, arrow} from './components.mjs';

const CREAM = '#EFE5C7';
const PAPER = '#F4F1EB';
const INK = '#1E281C';

const IMG = {
  hero: '/assets/hero-forest.jpg',
  sky: '/assets/night-sky.jpg',
  lucia: '/img/lucia/lucia-aktualna-1000.webp',
  tree: '/assets/tree.jpg',
  longevity: '/assets/lucia-longevity.png',
  // Veľké fotky z public/media/ (min. 1600px šírka)
  // Kategórie nikdy neberú ilustrácie z blogu. Používajú len čisté
  // produktové/lifestylové vizuály; ich obsah sa nemení z CMS.
  kozmetika: '/assets/hero-forest.jpg',
  vyziva: '/assets/tree.jpg',
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
    href: '/eshop/kategoria/bio-kozmetika-bez-chemie', img: '', icon: '<path d="M7 14h10v7H7zM10 14V8h4v6M10 8V4h4v4M19 5c0 3-3 4-3 4s-3-1-3-4"/>', tone: 'light',
  },
  {
    n: '02', title: 'Bylinky a výživa', from: 'od 9 €',
    text: 'Chrípkový prášok, Jančova zmes a zdravá káva z koreňa púpavy. Receptúry so stáročnou históriou.',
    href: '/eshop/kategoria/bylinky-a-vyziva', img: '', icon: '<path d="M12 22V3M12 8C7 8 5 5 5 3c4 0 7 2 7 5Zm0 6c-5 0-7-3-7-5 5 0 7 3 7 5Zm0-6c5 0 7-3 7-5-4 0-7 2-7 5Zm0 6c5 0 7-3 7-5-5 0-7 2-7 5Z"/>', tone: 'dark',
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
    <img src="/assets/brand-seal.svg" class="brand-seal" alt="" width="34" height="34">
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

export function homeSections(products = [], activeCategories = []) {
  // Vyber 4 produkty z roznych kategorii (nie z rovnakej)
  const categories = {};
  const selected = [];
  for (const p of products) {
    const cat = p.category || 'AI ANASTASIA ACADEMY';
    if (!categories[cat] && selected.length < 4) {
      categories[cat] = true;
      selected.push(p);
    }
  }
  const items = selected.map((p, i) => ({
    ...p,
    n: `N° ${String(i + 1).padStart(2, '0')}`,
    // build.mjs posílá cenu jako `price`; starší mock ji měl jako `priceLabel`.
    price: p.price ?? p.priceLabel ?? '',
    image: p.image || p.images?.[0] || '',
  }));

  // --- Úvod: video prosvítá jen písmeny, skrol se zavrtí do písmena T -------
  const hero = `
<section class="lh-intro" id="lh-intro" aria-labelledby="lh-ih">
  <div class="lh-intro__stage">
    <video class="lh-intro__video" id="lh-intro-video" autoplay muted loop playsinline preload="auto" fetchpriority="high" aria-hidden="true">
      <source src="/media/hero-480p.mp4" data-lh-src="/media/hero-480p.mp4" media="(max-width: 600px)" type="video/mp4">
      <source src="/media/hero-720p.mp4" data-lh-src="/media/hero-720p.mp4" media="(max-width: 1024px)" type="video/mp4">
      <source src="/media/hero-1080p.mp4" data-lh-src="/media/hero-1080p.mp4" type="video/mp4" data-content="global__video__0-video">
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
          <img class="lh-brand__mark" src="/assets/logo-mark.png" alt="" width="72" height="72">
          <img class="lh-brand__img--shine" src="/assets/logo-mark.png" alt="" aria-hidden="true" width="72" height="72">
        </span>
        <span class="lh-brand__name">ANASTASIA</span>
        <span class="lh-brand__sub">LIGHT FOR THE FUTURE</span>
      </a>
      <a class="lh-brand lh-brand--ai" href="/ai-anastasia" aria-label="AI ANASTASIA">
        <span class="lh-brand__lock lh-brand__lock--mark">
          <img class="lh-brand__mark" src="/assets/logo-mark.png" alt="" width="46" height="46">
          <img class="lh-brand__img--shine" src="/assets/logo-mark.png" alt="" aria-hidden="true" width="46" height="46">
        </span>
        <span class="lh-brand__name lh-shimmer-text">ANASTASIA</span>
      </a>
    </div>
    <p class="lh-intro__kicker" aria-hidden="true">Lucia Rogožanová · Light for the Future</p>
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
      <p class="lh-eyebrow" data-content="home__uvod__3-text">Zdravý svet</p>
      <p class="lh-display" data-content="home__uvod__4-rich">Zdravý svet nie je ideál, ku ktorému sa treba dopracovať.</p>
      <a class="lh-cta lh-cta--gold" href="/zdravy-svet" data-content="home__uvod__2-text">Vstúpte do zdravého sveta ${arrow}</a>
    </div>
    <button class="lh-vid-btn" id="lh-vid-btn" type="button" aria-pressed="false" aria-label="Pozastaviť video">Ⅱ</button>
    <div class="lh-post-entry lh-hx" aria-live="polite">
      <div class="lh-hx__title">
        <p class="lh-hx__brand"><img src="/assets/brand-mark.svg" alt="" width="34" height="34"><span class="lh-post-entry__brand">ANASTASIA</span></p>
        <p class="lh-post-entry__claim lh-hx__claim"><span>Light for</span> <em>the Future</em></p>
      </div>
      <nav class="lh-hx__index" aria-label="Ponuka">
        <a href="/eshop?category=bio-kozmetika-bez-chemie"><small>01</small><span>Kozmetika na mieru</span><i aria-hidden="true">→</i></a>
        <a href="/eshop?category=zdrave-doplnky-vyzivy"><small>02</small><span>Bylinky Hildegardy</span><i aria-hidden="true">→</i></a>
        <a href="/konzultacie"><small>03</small><span>Konzultácie</span><i aria-hidden="true">→</i></a>
        <a href="/eshop?category=sebarozvoj"><small>04</small><span>Programy</span><i aria-hidden="true">→</i></a>
      </nav>
    </div>
    <button class="lh-intro__sound" type="button" data-lh-sound aria-pressed="false" aria-label="Zapnúť zvuk" title="Zapnúť zvuk">
      <svg class="lh-sound-on" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 14v-3a8 8 0 0 1 16 0v3M4 12H3v8h4v-8zm16 0h1v8h-4v-8z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a9 9 0 0 1 0 12"/></svg>
      <svg class="lh-sound-off" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 14v-3a8 8 0 0 1 16 0v3M4 12H3v8h4v-8zm16 0h1v8h-4v-8z"/><path d="m9 17 6 6m0-6-6 6"/></svg>
      <span class="media-label">Zvuk vypnutý</span>
    </button>
  </div>
</section>`;

  const bySlug = slug => products.find(p => p.slug === slug);
  const price = p => p?.price ?? p?.priceLabel ?? '';
  const priced = p => Boolean(price(p) && !/cena sa doplní|price unavailable/i.test(String(price(p))) && /\d/.test(String(price(p))));
  const amount = p => Number(String(price(p)).replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '')) || Number.POSITIVE_INFINITY;
  const media = p => ['online-zdravotna-konzultacia','supervizia'].includes(p?.slug) ? IMG.lucia : p?.image && !/placeholder|\.svg(?:\?|$)|\/blog\//i.test(p.image) ? p.image : p?.images?.find(src => !/placeholder|\.svg(?:\?|$)|\/blog\//i.test(src)) || '';
  const imageMarkup = (src, alt, attrs = '') => src === IMG.lucia
    ? `<img src="${src}" srcset="/img/lucia/lucia-aktualna-600.webp 600w, ${src} 977w" sizes="(max-width:760px) 82vw, 560px" alt="${e(alt)}" ${attrs}>`
    : `<img src="${e(src)}" alt="${e(alt)}" ${attrs}>`;
  const realProducts = products.filter(p => media(p) && p.slug && priced(p));
  // Ostré originály z podkladov Lucie (min. 2× šírka zobrazenia), nie malé fotky produktov zo starého webu.
  const WORLD_SHOTS = {
    'BIOKOZMETIKA': ['/assets/packshots/sprchovy-gel-kralovna.webp', '/assets/packshots/sprchovy-gel-kralovna.webp', 'center 35%'],
    'Zdravé doplnky výživy': ['/img/lucia/lekaren-800.webp', '/img/lucia/lekaren-1600.webp', '38% center'],
    'Konzultácie': ['/img/lucia/stacionar-kresla-800.webp', '/img/lucia/stacionar-kresla-1600.webp', '45% center'],
    'AI ANASTASIA ACADEMY': ['/img/lucia/lucia-portret-hero-800.webp', '/img/lucia/lucia-portret-hero-1600.webp', '64% center'],
  };
  const categoryOrder = ['BIOKOZMETIKA', 'Zdravé doplnky výživy', 'Konzultácie', 'AI ANASTASIA ACADEMY'];
  const categoryProducts = {
    'BIOKOZMETIKA': 'bio-sprchovy-gel',
    'Zdravé doplnky výživy': 'antibioticky-prasok',
    'Konzultácie': 'online-zdravotna-konzultacia',
    'AI ANASTASIA ACADEMY': 'reset-40-plus',
  };
  const categoryLinks = categoryOrder.filter(name => activeCategories.includes(name)).map((name, i) => {
    const categoryItems = realProducts.filter(item => item.category === name);
    const p = realProducts.find(item => item.slug === categoryProducts[name]) || categoryItems[0];
    const from = categoryItems.reduce((lowest, item) => amount(item) < amount(lowest) ? item : lowest, p);
    if (!p) return '';
    const href = name === 'Konzultácie' ? '/konzultacie' : `/eshop?category=${encodeURIComponent(name)}`;
    const shot = WORLD_SHOTS[name];
    return `<a class="lh-world" href="${href}"><span class="lh-frame" data-parallax-speed="7">${shot ? `<img src="${shot[1]}" srcset="${shot[0]} 800w, ${shot[1]} 1600w" sizes="(max-width:560px) 100vw, (max-width:1100px) 50vw, 25vw" alt="${e(name)}" loading="lazy" decoding="async" style="object-position:${shot[2]}">` : imageMarkup(media(p),p.name,'loading="lazy" decoding="async"')}</span><span class="lh-world__n">0${i + 1}</span><span class="lh-world__copy"><small>${e(name)}</small><strong>${e(name)}</strong><span><small>od</small> ${e(price(from))}</span></span></a>`;
  }).filter(Boolean).join('');
  const featuredPriority = ['bio-sprchovy-gel', 'antibioticky-prasok', 'pletova-voda', 'reset-40-plus', 'online-zdravotna-konzultacia'];
  const featured = featuredPriority.map(slug => realProducts.find(p => p.slug === slug)).filter(Boolean).map((p, i) => `<article class="lh-product"><a href="/eshop/produkt/${encodeURIComponent(p.slug)}"><span class="lh-frame" data-parallax-speed="6">${imageMarkup(media(p),p.name,'loading="lazy" decoding="async"')}</span><span class="lh-product__n">0${i + 1}</span><h3>${e(p.name)}</h3></a><p>${e(price(p))}</p><button class="lh-cta" type="button" data-add-to-cart="${e(p.slug)}">Do košíka ${arrow}</button></article>`).join('');
  const resetProduct = bySlug('reset-40-plus');
  const nic = bySlug('nic-nemusis');
  const online = bySlug('online-zdravotna-konzultacia');
  const lucia = `
<section class="lh-about" id="o-mne" aria-labelledby="lh-about-title">
 <div class="lh-about__photo" data-parallax-speed="8"><img src="/img/lucia/lucia-aktualna-1000.webp" srcset="/img/lucia/lucia-aktualna-600.webp 600w, /img/lucia/lucia-aktualna-1000.webp 977w" sizes="(max-width:760px) 100vw, 55vw" alt="Lucia Rogožanová" loading="lazy"></div>
 <div class="lh-about__text"><p class="lh-eyebrow">Kto je Lucia</p><h2 id="lh-about-title">Mgr. Lucia Rogožanová, MBA</h2><p class="lh-about__role">Farmaceutka a zakladateľka ANASTASIA</p><p>Som farmaceutka, podnikateľka, tvorca projektu AI ANASTASIA a predovšetkým človek, ktorý verí, že zdravie sa nedá oddeliť od života ako celku.</p><p>Viac ako tridsať rokov pracujem s ľuďmi, ich príbehmi, obavami, nádejami a každodennými zdravotnými otázkami. Mnohí ľudia nehľadajú ďalší liek. Hľadajú porozumenie.</p><p class="lh-signature">Lucia</p><a class="lh-cta" href="/o-lucii">O mne ${arrow}</a></div>
</section>`;
  const benefits = `<section class="lh-benefits" aria-labelledby="lh-benefits-title"><p class="lh-eyebrow">ANASTASIA · LEKÁREŇ</p><h2 id="lh-benefits-title">Čo vzniká z rozhovoru</h2><p class="lh-benefits__sub">Lekárenské poznatky a kozmetika namiešaná podľa vašej pleti.</p><div class="lh-benefits__row"><span><i aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M16 27V8m0 7c-6 0-9-3-9-8 6 0 9 3 9 8Zm0 4c6 0 9-3 9-8-6 0-9 3-9 8Z"/></svg></i>Kozmetika namiešaná na mieru po rozhovore</span><span><i aria-hidden="true"><svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="10"/><path d="m10 17 4 4 8-10"/></svg></i>Bez syntetickej parfumácie</span><span><i aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M7 25V12l9-6 9 6v13M12 25v-8h8v8"/></svg></i>Odborné farmaceutické poznatky</span><span><i aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M7 9h18v14H7zM12 14h8m-8 4h5"/><circle cx="23" cy="23" r="4"/></svg></i>Individuálna konzultácia</span></div><a class="lh-cta" href="/eshop/kategoria/bio-kozmetika-bez-chemie">Pozrieť bio kozmetiku ${arrow}</a><figure class="lh-frame lh-benefits__photo" data-parallax-speed="8"><img src="/img/lucia/mineral-protect-1200.webp" alt="Mineral Protect z Lekárne ANASTASIA" width="1200" height="1200" loading="lazy" decoding="async"></figure></section>`;
  const worldsSection = categoryLinks ? `<section class="lh-worlds" aria-labelledby="lh-worlds-title"><div class="lh-worlds__intro"><p class="lh-eyebrow">ANASTASIA · V PONUKE</p><h2 id="lh-worlds-title">Štyri oblasti práce</h2><p>Aktívne kategórie a ich produkty z obchodu ANASTASIA.</p><a class="lh-cta" href="/eshop">Celý obchod ${arrow}</a></div><div class="lh-worlds__grid">${categoryLinks}</div></section>` : '';
  const productsSection = featured ? `<section class="lh-featured" aria-labelledby="lh-featured-title"><div class="lh-featured__head"><p class="lh-eyebrow">VYBRANÉ Z PONUKY</p><h2 id="lh-featured-title">Produkty z ANASTASIA</h2><p>Aktuálne produkty a ceny z obchodu.</p><a class="lh-cta" href="/eshop">Všetky produkty ${arrow}</a></div><div class="lh-featured__items">${featured}</div></section>` : '';
  const reset = resetProduct && priced(resetProduct) ? `<section class="lh-program lh-program--reset"><figure class="lh-frame" data-parallax-speed="10"><img src="/img/lucia/lucia-arabeska-1600.webp" srcset="/img/lucia/lucia-arabeska-800.webp 800w, /img/lucia/lucia-arabeska-1600.webp 1536w" sizes="(max-width:760px) 100vw, 60vw" alt="Lucia Rogožanová" loading="lazy" decoding="async" style="object-position:center 30%"></figure><div><p class="lh-eyebrow">AI ANASTASIA · PROGRAM</p><h2>RESET 40+</h2><p>Šestnásť týždňov v členskej zóne, pracovné listy a Zrkadielko na vlastné pozorovania a sebareflexiu. Súčasťou je 117 PDF materiálov.</p><p class="lh-program__price">${e(price(resetProduct))}</p><a class="lh-cta" href="/eshop/produkt/${e(resetProduct.slug)}">Spoznajte program ${arrow}</a></div></section>` : '';
  const nicSection = nic && priced(nic) ? `<section class="lh-nic"><p class="lh-eyebrow">AI ANASTASIA · PROGRAM</p><h2>Nič nemusíš</h2><p>Program Nič nemusíš nájdete v aktuálnej ponuke ANASTASIA.</p><p class="lh-program__price">${e(price(nic))}</p><a class="lh-cta" href="/eshop/produkt/${e(nic.slug)}">Pozrieť program ${arrow}</a></section>` : '';
  const pharmacy = `<section class="lh-pharmacy"><div class="lh-pharmacy__main" data-parallax-speed="9"><img src="/img/lucia/lekaren-1600.webp" alt="Lekáreň ANASTASIA vo Vyšnej Slanej" width="1600" height="1200" loading="lazy" decoding="async"></div><div class="lh-pharmacy__copy"><p class="lh-eyebrow">VYŠNÁ SLANÁ</p><h2>Lekáreň ANASTASIA<br>a denný stacionár</h2><p>Denný stacionár vo Vyšnej Slanej · plánované otvorenie jeseň 2026.</p><p>Vyšná Slaná 259<br>049 26 Vyšná Slaná</p><p>Osobný odber sa uskutočňuje po potvrdení pripravenosti a v oznámenom čase.</p><a class="lh-cta" href="https://maps.google.com/?q=Lek%C3%A1re%C5%88+ANASTASIA%2C+Vy%C5%A1n%C3%A1+Slan%C3%A1+259" target="_blank" rel="noopener">Otvoriť mapu ${arrow}</a></div><div class="lh-pharmacy__gallery" aria-label="Priestory denného stacionára"><figure class="lh-pharmacy__room" data-parallax-speed="10"><div class="lh-pharmacy__room-frame"><img src="/img/lucia/stacionar-priestor-1600.webp" alt="Spoločenský priestor denného stacionára vo Vyšnej Slanej" loading="lazy" decoding="async"></div><figcaption>Priestor denného stacionára</figcaption></figure><figure class="lh-pharmacy__room" data-parallax-speed="8"><div class="lh-pharmacy__room-frame"><img src="/img/lucia/stacionar-kresla-1600.webp" alt="Oddychová časť denného stacionára" loading="lazy" decoding="async"></div><figcaption>Oddychová časť</figcaption></figure><figure class="lh-pharmacy__room" data-parallax-speed="12"><div class="lh-pharmacy__room-frame"><img src="/img/lucia/stacionar-poradna-1600.webp" alt="Poradenská miestnosť denného stacionára" loading="lazy" decoding="async"></div><figcaption>Poradenská miestnosť</figcaption></figure></div></section>`;
  const consult = online && priced(online) ? `<section class="lh-consult"><div><p class="lh-eyebrow">ONLINE · 60 MINÚT</p><h2>Online zdravotná konzultácia</h2><p>Konzultáciu vedie farmaceutka s dlhoročnou praxou, ktorá prepája odborné farmaceutické poznatky s celostným pohľadom na človeka.</p><p class="lh-program__price">${e(price(online))}</p><a class="lh-cta" href="/konzultacie/rezervacia">Rezervovať konzultáciu ${arrow}</a></div></section>` : '';
  const registration = `<section class="lh-register"><p class="lh-eyebrow">VÁŠ ÚČET ANASTASIA</p><h2>Registrácia a novinky</h2><p>V účte nájdete svoje objednávky a zakúpené programy. Novinky posielame iba po samostatnom súhlase.</p><a class="lh-cta" href="/prihlasenie">Registrácia ${arrow}</a><form data-newsletter><label for="lh-newsletter-email">Váš e-mail</label><input id="lh-newsletter-email" name="email" type="email" autocomplete="email" required><label class="lh-newsletter-consent"><input name="newsletter_consent" type="checkbox" required> Súhlasím so zasielaním noviniek e-mailom.</label><button class="lh-cta" type="submit">Odoberať ${arrow}</button></form><p class="newsletter-status" role="status" aria-live="polite"></p></section>`;

  const contact = `
<section class="lh-contact" data-sk-only data-screen-label="08 Kontakt">
  <p class="lh-eyebrow" data-content="home__kontakt__1-text">Kontakt</p>
  <h2 class="lh-display" data-content="home__kontakt__0-text">Kontakt</h2>
  <p class="lh-lead lh-lead--center">Otázka k produktu, programu alebo konzultácii? Zavolajte alebo napíšte.</p>
  <p class="lh-contact__details"><a href="tel:+421905363778">+421 905 363 778</a><span> · </span><a href="mailto:zdravysvet@anastasiaoz.eu">zdravysvet@anastasiaoz.eu</a></p>
  <a class="lh-cta" href="/kontakt" data-content="home__kontakt__3-text">Napíšte nám ${arrow}</a>
</section>`;

  return [hero, '<div class="lh-flow">', lucia, benefits, worldsSection, productsSection, reset, nicSection, pharmacy, consult, registration, contact, '</div>'].join('\n');
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
.lh-intro{position:relative;height:100svh;min-height:640px;pointer-events:none}
.lh-intro{margin-left:var(--rail-neg,0px)}
.motion .lh-intro{height:380svh}
/* Po prvním přehrání je úvod hero sekcí: bez zoomu, bez kategorií. */
html.lh-hero-mode .lh-intro{height:100svh;min-height:640px}
html.lh-hero-mode .lh-intro__cats{display:none}
.lh-intro__stage{position:sticky;top:0;height:100svh;overflow:hidden;background:var(--lh-paper,#F5F2E8);pointer-events:none}
.lh-intro__video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .6s ease;pointer-events:none}
.lh-intro__video.lh-ready{opacity:1}
.lh-intro__tint{display:none}
.motion .lh-intro__tint{display:block;position:absolute;inset:0;background:rgba(14,20,13,.4)}
.lh-intro__veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(14,20,13,.5),rgba(14,20,13,.28) 40%,rgba(14,20,13,.8)),radial-gradient(120% 70% at 0% 100%,rgba(14,20,13,.55),transparent 70%)}
.lh-intro__veil,.lh-intro__tint{pointer-events:none}
.motion .lh-intro__veil{opacity:0}
.lh-intro__mask{position:absolute;inset:0;display:block;pointer-events:none}

.motion .lh-intro__mask{display:block}
.lh-intro__mask svg{position:absolute;inset:0 var(--lh-gut,16px);width:calc(100% - 2*var(--lh-gut,16px));height:100%;overflow:visible}
.lh-intro__meta{position:absolute;inset:0;pointer-events:none;color:var(--lh-ink,#1E281C);display:none}
.motion .lh-intro__meta{display:block}
.lh-intro__meta .k{position:absolute;top:clamp(96px,16svh,160px);left:0;right:0;margin:0;text-align:center;font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:var(--lh-muted,#6E7468)}
.lh-intro__meta .k span{display:block}
.lh-intro__meta ul{position:absolute;bottom:clamp(96px,14svh,140px);left:var(--lh-gut,16px);right:var(--lh-gut,16px);margin:0;padding:0;list-style:none;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px 24px;font-size:13px;letter-spacing:.18em;text-transform:uppercase;max-width:1100px;margin-inline:auto}
.lh-intro__meta li::before{content:"";display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--site-accent,#C9A355);margin:0 10px 2px 0}
/* --- Tři loga v řadě nad úvodem: hlavní uprostřed, boční symetricky -------- */
.lh-intro__brands{position:absolute;top:clamp(24px,5svh,58px);left:0;right:0;z-index:3;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:56px;color:#EFE5C7;pointer-events:none}
/* r17/1: rada troch log je na desktope aspoň 48 px pod hlavičkou. */
@media (min-width:761px) and (pointer:fine){.lh-intro__brands{top:clamp(112px,11svh,150px)}}
.motion .lh-intro__brands{color:#EFE5C7}
.lh-brand{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-decoration:none;color:inherit;pointer-events:auto;opacity:1}
.motion .lh-brand{opacity:0}
.lh-brand--academy{order:1;height:96px}
.lh-brand--main{order:2;height:96px}
.lh-brand--ai{order:3;height:96px}
.lh-brand--main{height:124px;gap:2px}
.lh-brand--main .lh-brand__lock{height:72px;width:72px}
.lh-brand--main .lh-brand__mark,.lh-brand--main .lh-brand__img--shine{height:72px;width:72px}
.lh-brand__lock{position:relative;display:flex;align-items:center;justify-content:center;height:100%}
.lh-brand__lock--mark{height:auto;width:46px}
.lh-brand__mark{height:100%;width:auto;display:block}
.lh-brand--main .lh-brand__mark{filter:none}
.lh-brand__lock--mark .lh-brand__mark{height:auto;width:100%}
/* Zlatý odlesk: kopie loga pod maskou, která se posouvá přes obraz. */
.lh-brand__img--shine{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;filter:sepia(.85) saturate(2.6) hue-rotate(3deg) brightness(1.05);-webkit-mask-image:linear-gradient(100deg,transparent 46%,#000 50%,transparent 54%);mask-image:linear-gradient(100deg,transparent 46%,#000 50%,transparent 54%);-webkit-mask-size:250% 100%;mask-size:250% 100%;-webkit-mask-position:150% 0;mask-position:150% 0}
.lh-brand__stem{width:1px;height:22px;background:linear-gradient(180deg,rgba(201,163,85,0),var(--site-accent,#C9A355))}
.lh-brand__name{font-weight:200;font-size:clamp(16px,1.4vw,26px);letter-spacing:.3em;padding-left:.3em;white-space:nowrap;--lh-shim-base:var(--lh-ink,#1E281C)}
.lh-brand__sub{color:#8A6520!important;display:flex;align-items:center;gap:10px;font-weight:300;font-size:clamp(10px,.95vw,14px);letter-spacing:.44em;padding-left:.44em;color:var(--site-accent,#C9A355);white-space:nowrap;--lh-shim-base:var(--site-accent,#C9A355)}
.motion .lh-brand__name,.motion .lh-brand__sub{background:none!important;-webkit-text-fill-color:#EFE5C7!important;color:#EFE5C7!important;text-shadow:0 1px 12px rgba(14,20,13,.28)}
.motion .lh-brand__sub{color:#D8C598!important;-webkit-text-fill-color:#D8C598!important}
.motion .lh-brand__mark{filter:brightness(0) invert(.92) sepia(.12) saturate(.75)!important}
.lh-brand__sub i{width:20px;height:1px;background:currentColor}
.lh-shimmer-text--gold{--lh-shim-base:var(--site-accent,#C9A355)}
/* Odlesk textu: barva zůstává, přes ni přejede úzký zlatý pruh. */
.motion .lh-shimmer-text,.motion .lh-cat{background-image:linear-gradient(100deg,var(--lh-shim-base,#1E281C) 0 46%,#D8C598 48%,#F3E3B0 50%,var(--lh-shim-base,#1E281C) 52% 100%);background-size:250% 100%;background-position:150% 0;-webkit-background-clip:text;background-clip:text;color:transparent}
.motion .lh-cat{--lh-shim-base:var(--lh-ink,#1E281C)}
.motion .lh-cat{background:none!important;-webkit-text-fill-color:#313C2B!important;color:#313C2B!important;text-shadow:0 1px 14px rgba(245,242,232,.92),0 0 4px rgba(245,242,232,.85)!important}
/* Úvod bez log, jen nápis a tlačítko Vstúpte (Lucky 23. 10.). */
.lh-intro__brands{display:none!important}
@media (max-width:699.98px){
  .lh-intro__brands{top:clamp(16px,2.6svh,34px);gap:12px 22px}
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
.lh-say--one{left:var(--lh-gut,16px);bottom:14svh;max-width:min(92vw,1100px);display:none}
.motion .lh-say--one{display:block;opacity:0}
.lh-say--two{left:6vw;right:auto;top:auto;bottom:14svh;text-align:left;max-width:560px}
.lh-say--two .lh-eyebrow{margin:0 0 14px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#E6D3A3}
.lh-say--two .lh-display{font-size:clamp(28px,2.6vw,44px);line-height:1.22;max-width:560px;font-weight:300}
.lh-say--two .lh-cta{margin-top:26px}
@media (prefers-reduced-motion:reduce){.lh-say--two{display:none}}
.motion .lh-say{opacity:0}
.motion .lh-say--one,.motion .lh-say--two{opacity:0}
.lh-vid-btn{position:absolute;right:auto;left:calc(var(--lh-gut,16px) + 8px);bottom:24px;width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.7);background:rgba(255,255,255,.4);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:#1E281C;font:inherit;font-size:13px;cursor:pointer;opacity:0;display:grid;place-items:center;transition:opacity .5s;pointer-events:auto}
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
.lh-top__menu{display:inline-flex;align-items:center;gap:12px;min-height:44px;height:50px;padding:0 22px;border-radius:80px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.09);color:inherit;font-family:inherit;font-size:15px;letter-spacing:0;text-transform:none;cursor:pointer;backdrop-filter:blur(14px) saturate(140%);-webkit-backdrop-filter:blur(14px) saturate(140%);transition:background .3s,border-color .3s}
.lh-top__menu:hover{background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.32)}
.lh-top__burger{display:flex;flex-direction:column;gap:4px}
.lh-top__burger i{width:20px;height:1px;background:currentColor}
/* Hlavička je vidět na všech stránkách. Skrytá je jen na úvodu webu (preloader),
   kde se s chromem objeví až za úvodem. */
.lh-intro-page:not(.lh-chrome-in) .lh-top__brand{opacity:0;visibility:hidden}
.lh-chrome-in .lh-top{opacity:1;transform:none;pointer-events:auto}
/* Počas úvodu (preloader) nie je hlavička vidieť vôbec; plynulo príde až s bočnou lištou po zoskrolovaní úvodu. */
.lh-intro-page .lh-top{transition:opacity .5s var(--ana-ease-soft),transform .5s var(--ana-ease-soft)}
.lh-intro-page:not(.lh-chrome-in) .lh-top{opacity:0;transform:translateY(-10px);pointer-events:none}
/* Úvod je od prvního vykreslení v režimu preloaderu (třídy na <html> z buildu), obsah bez odsazení lišty. */
.lh-intro-page:not(.lh-chrome-in) .dc-root{padding-left:0!important}
/* Boční lišta se na začátku úvodu schová a vrátí se po preloaderu. */
.lh-intro-page #ana-rail{opacity:0;transform:translateX(-14px);pointer-events:none;transition:opacity .4s var(--ana-ease-soft),transform .4s var(--ana-ease-soft)}
.lh-intro-page.lh-chrome-in #ana-rail{opacity:1;transform:none;pointer-events:auto}
/* r17/5: jedno Menu – v hlavičke kým bočná lišta nie je vidieť, potom už len v lište. */
@media (min-width:761px) and (pointer:fine){
  .lh-intro-page .lh-top__menu{transition:opacity .4s var(--ana-ease-soft)}
  .lh-intro-page.lh-chrome-in .lh-top__menu{opacity:0;pointer-events:none}
  .lh-intro-page .dc-root{transition:padding-left .4s var(--ana-ease-soft)}
}
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
.lh-cat{text-shadow:0 1px 14px rgba(245,242,232,.92),0 0 4px rgba(245,242,232,.85);position:absolute;pointer-events:auto;font-weight:300;font-size:clamp(26px,3.4vw,54px);line-height:1.1;letter-spacing:-.03em;color:#313C2B;opacity:0;text-decoration:none;white-space:nowrap}
.lh-cat--1{top:16svh;left:9%}
.lh-cat--2{bottom:22svh;right:11%}
.lh-cat--3{top:30svh;right:13%}
.lh-cat--4{bottom:15svh;left:12%}
/* r17/3: rotujúca kategória je pod slovom ANASTASIA, centrovaná, plná farba. */
@media (min-width:761px) and (pointer:fine){.lh-cat--1,.lh-cat--2,.lh-cat--3,.lh-cat--4{top:calc(50% + min((100vw - 2*var(--lh-gut,16px))*.135,15svh*1.35) + 12px);left:0;right:0;text-align:center;color:#313C2B;background-image:none!important;-webkit-text-fill-color:#313C2B}}
@media (max-width:760px){
  /* r12/1: na mobilu logo vľavo, košík a Menu vpravo, hlavička fixná. */
  .lh-top{grid-template-columns:auto minmax(0,1fr) auto;gap:12px;padding:9px 14px}
  .lh-top__side--right{grid-column:3;justify-self:end}
  .lh-top__brand{justify-self:center}
  .lh-top>nav:first-child>a{display:none}
  .lh-top>nav:first-child .lh-top__menu{display:inline-flex!important;flex:0 0 auto}
  .lh-top__brand{align-items:flex-start;gap:0}
  .lh-top__brand span{display:none}
  .lh-top__brand img{width:30px;height:30px}
  .lh-top__side--right{gap:10px;font-size:11px}
  .lh-top__side--right>a:not([aria-label="Košík"]){display:none}
  /* r21/2: košík má rovnakú pilulku ako „Menu“ (jeden štýl, žiadny zdvojený obrys). */
  .lh-top__side--right>a[aria-label="Košík"]{display:inline-flex;align-items:center;gap:8px;min-height:44px;height:44px;padding:0 16px;border-radius:80px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.09);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);color:inherit;text-decoration:none;white-space:nowrap}
  .lh-top__side--right .lh-top__menu{display:none}
  .lh-top__menu{height:44px;min-height:44px;padding:0 16px;gap:8px;font-size:11px;letter-spacing:1.2px}
  .lh-intro-page:not(.lh-chrome-in) .lh-top__brand{display:none}
  .lh-intro__brands{top:62px;gap:0 14px;flex-wrap:nowrap;justify-content:center}
  .lh-brand--main,.lh-brand--academy,.lh-brand--ai{height:58px;flex:0 0 auto}
  .lh-brand--main{gap:2px}
  .lh-brand--main .lh-brand__lock{height:30px}
  .lh-brand--main .lh-brand__mark{height:30px;width:30px}
  .lh-brand--main .lh-brand__img--shine{height:30px;width:30px}
  .lh-brand--main .lh-brand__name{font-size:10px}
  .lh-brand--main .lh-brand__sub{font-size:8px}
  .lh-brand__lock--mark{width:26px}
  .lh-brand__name{font-size:11px;letter-spacing:.18em;padding-left:.18em}
  .lh-brand__sub{font-size:8px;letter-spacing:.22em;padding-left:.22em;gap:5px}
  .lh-brand__sub i{width:9px}
  .lh-brand__stem{height:10px}
  .lh-intro__cats{position:absolute;left:0;right:0;top:auto;bottom:20svh;height:0;display:block}
  .lh-cat{position:absolute;left:0;right:0;top:auto;bottom:0;width:100%;font-size:21px;white-space:normal;text-align:center;line-height:1.2}
  .lh-intro__meta .k{font-size:10px;letter-spacing:.22em}
}

/* --- Výzva ke skrolování: tlačítko, ne text, který vypadá jako odkaz ------ */
.lh-enter-wrap{position:absolute;bottom:26px;left:50%;transform:translateX(-50%);z-index:4;display:flex;flex-direction:column;align-items:center;gap:12px}
/* Tlačidlo „Vstúpte“ musí byť kliknuteľné: .lh-intro__meta má pointer-events:none
   (aby nechytal kliky mimo tlačidla), preto sa pointer-events vracia priamo na tlačidle. */
.lh-enter{display:inline-flex;align-items:center;gap:16px;height:54px;padding:0 26px;border-radius:27px;background:rgba(255,255,255,.42);border:1px solid rgba(255,255,255,.78);box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 2px 6px rgba(40,48,32,.06);backdrop-filter:blur(14px) saturate(140%);-webkit-backdrop-filter:blur(14px) saturate(140%);color:var(--lh-ink,#1E281C);font-family:inherit;font-size:13px;letter-spacing:.2em;text-transform:uppercase;cursor:pointer;pointer-events:auto;transition:background .35s,border-color .35s,transform .35s}
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
html.lh-mobile-intro .lh-or{display:none!important}
@media (max-width:768px),(pointer:coarse){
  .lh-or{display:none!important}
  .lh-enter{height:64px;padding:0 34px;font-size:15px;letter-spacing:.22em}
  .lh-enter-wrap{bottom:34px}
}
/* r12/2b: ak maska nejde vykresliť, ostane čitateľný tmavý nápis. */
.lh-intro__fallback{display:none;position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;font-family:'Fraunces',Georgia,serif;font-style:italic;font-weight:300;font-size:clamp(38px,11vw,72px);letter-spacing:.04em;color:#283020}
@supports (mask:url(#lhWord)){.lh-intro__fallback{display:none!important}}

.lh-intro__sound{position:absolute;right:calc(var(--lh-gut,16px) + 8px);bottom:24px;z-index:4;width:44px;height:44px;border-radius:22px;display:grid;place-items:center;background:rgba(255,255,255,.4);border:1px solid rgba(255,255,255,.7);color:var(--lh-ink,#1E281C);cursor:pointer;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);transition:opacity .5s;pointer-events:auto}
.lh-post-entry{position:absolute;z-index:3;left:0;right:0;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;text-align:center;color:#fff;text-shadow:0 2px 18px #201e2c;opacity:0;pointer-events:none;transition:opacity .8s;padding:24px;background:linear-gradient(90deg,transparent,#211f2c66 18%,#211f2c66 82%,transparent)}
html.lh-entered .lh-post-entry{opacity:1}
.lh-post-entry img{width:62px;height:62px;max-width:62px;object-fit:contain;flex:none;filter:brightness(0) invert(1);margin-bottom:12px}
.lh-post-entry__brand{font-size:clamp(22px,3vw,34px);letter-spacing:.28em;margin:0;padding-left:.28em}
.lh-post-entry__tag{font-size:11px;letter-spacing:.3em;text-transform:uppercase;margin:5px 0 24px}
.lh-post-entry__claim{font:300 clamp(21px,3vw,36px)/1.2 Fraunces,serif;margin:0 0 24px;max-width:25ch}
.lh-post-entry nav{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
.lh-post-entry nav a{display:inline-flex;align-items:center;min-height:46px;padding:0 24px;border:1px solid #d8d5ef;border-radius:30px;background:#73729c;color:white;text-decoration:none;text-shadow:none;letter-spacing:.12em;pointer-events:auto}
.lh-post-entry nav a:nth-child(2){min-height:0;padding:0 0 5px;border:0;border-bottom:1px solid rgba(255,255,255,.8);border-radius:0;background:transparent;color:#fff}
html.lh-mobile-intro .lh-intro__stage{background:#e9e9f2}
html.lh-mobile-intro .lh-intro__mask svg{inset:0;width:100%}
html.lh-mobile-intro #lh-paper{opacity:.88}
html.lh-mobile-intro .lh-intro__meta .k{color:#403f62;text-shadow:0 1px 0 white}
html.lh-mobile-intro .lh-cat{color:#403f62!important;-webkit-text-fill-color:#403f62!important;text-shadow:0 1px 0 #fff,0 0 3px #fff!important}
html.lh-mobile-intro .lh-enter,html.lh-mobile-intro .lh-vid-btn,html.lh-mobile-intro .lh-intro__sound{background:#73729c!important;border-color:#a7a5cf!important;color:#fff!important}
.lh-intro__sound .lh-sound-on{display:none}
.lh-intro__sound.is-on{background:var(--site-accent-light,#D8C598)!important;border-color:var(--site-accent,#C9A355)!important;color:#1E281C!important}
.lh-intro__sound.is-on .lh-sound-on{display:block}
.lh-intro__sound.is-on .lh-sound-off{display:none}
.lh-intro__sound .media-label{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.lh-chrome-in .lh-intro__sound{opacity:0;pointer-events:none}
html.lh-entered .lh-intro__sound{opacity:1;pointer-events:auto}

/* Homepage rebuilt from Lucia's text and the live Store API catalog. */
.lh-about,.lh-benefits,.lh-worlds,.lh-featured,.lh-program,.lh-nic,.lh-pharmacy,.lh-consult,.lh-register,.lh-manifest,.lh-contact{color:#42424b;background:#fff}
.lh-about h2,.lh-benefits h2,.lh-worlds h2,.lh-featured h2,.lh-program h2,.lh-nic h2,.lh-pharmacy h2,.lh-consult h2,.lh-register h2,.lh-manifest h2,.lh-contact h2{font:300 clamp(38px,5.2vw,76px)/1.04 'Fraunces',Georgia,serif;letter-spacing:-.025em;margin:16px 0 22px;color:#42424b}
.lh-about p,.lh-benefits p,.lh-worlds p,.lh-featured p,.lh-program p,.lh-nic p,.lh-pharmacy p,.lh-consult p,.lh-register p,.lh-manifest p,.lh-contact p{font-size:16px;line-height:1.75;max-width:56ch}
.lh-about{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(320px,.8fr);align-items:center;gap:clamp(36px,7vw,120px);padding:clamp(72px,10vw,150px) 0}
.lh-about__photo{height:min(74vw,820px);margin-left:-4vw;overflow:hidden}.lh-about__photo img{width:100%;height:100%;object-fit:cover;object-position:center 38%}
.lh-about__text{max-width:570px;padding:36px 32px 36px 0}.lh-about__text h2{font-size:clamp(38px,4.6vw,66px)}.lh-about__text .lh-signature{font:italic 400 42px 'Fraunces',Georgia,serif;color:#73729c;margin:14px 0 28px}
.lh-benefits{background:#e9e9f2;padding:clamp(76px,9vw,128px) max(24px,calc((100vw - 1320px)/2));text-align:center}.lh-benefits h2{max-width:800px;margin-inline:auto}.lh-benefits__sub{margin:0 auto 36px}.lh-benefits__row{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid #a7a5cf;border-bottom:1px solid #a7a5cf;margin:0 auto 34px;max-width:1240px}.lh-benefits__row span{padding:24px 18px;font-size:14px;line-height:1.45}.lh-benefits__row span+span{border-left:1px solid #a7a5cf}
.lh-worlds{display:grid;grid-template-columns:minmax(220px,.6fr) 1.4fr;gap:clamp(36px,7vw,100px);padding:clamp(84px,11vw,160px) max(24px,calc((100vw - 1320px)/2))}.lh-worlds__intro{align-self:center}.lh-worlds__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px 32px}.lh-world{position:relative;min-height:320px;color:#42424b;overflow:visible;background:none;display:flex;flex-direction:column;text-decoration:none}.lh-world img{position:static;width:100%;height:100%;min-height:220px;max-height:380px;aspect-ratio:4/3;object-fit:contain;background:#f5f3f8;transition:transform .7s}.lh-world:hover img{transform:scale(1.015)}.lh-world:after{display:none}.lh-world__n{position:absolute;z-index:1;top:12px;left:12px;color:#73729c;font:300 14px 'Fraunces',serif}.lh-world__copy{position:static;display:grid;gap:6px;padding:14px 0}.lh-world__copy small{letter-spacing:.16em;text-transform:uppercase;color:#73729c}.lh-world__copy strong{font:300 30px 'Fraunces',Georgia,serif}.lh-world__copy>span{font-size:14px;color:#73729c}
.lh-featured{background:#f7f6fa;padding:clamp(76px,10vw,140px) max(24px,calc((100vw - 1320px)/2))}.lh-featured__head{display:grid;grid-template-columns:1fr auto;align-items:end;gap:4px 28px;margin-bottom:46px}.lh-featured__head>*{margin:0}.lh-featured__head .lh-eyebrow,.lh-featured__head h2,.lh-featured__head p{grid-column:1}.lh-featured__head .lh-cta{grid-column:2;grid-row:2/4}.lh-featured__items{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:26px}.lh-product img{width:100%;height:clamp(220px,27vw,360px);object-fit:cover;background:#e9e9f2}.lh-product a{color:inherit;text-decoration:none}.lh-product h3{font:300 23px/1.2 'Fraunces',Georgia,serif;margin:13px 0 4px}.lh-product p{margin:0 0 14px}.lh-product__n{font-size:11px;letter-spacing:.16em;color:#73729c}
.lh-program{display:grid;grid-template-columns:1.15fr .85fr;min-height:620px;background:#e9e9f2}.lh-program>img{width:100%;height:100%;min-height:620px;object-fit:cover}.lh-program>div{align-self:center;padding:clamp(40px,7vw,100px)}.lh-program--reset h2{font-size:clamp(52px,7vw,96px)}.lh-program__price{font:300 32px 'Fraunces',Georgia,serif;color:#73729c}.lh-nic{display:grid;grid-template-columns:.7fr 1.3fr auto;align-items:center;gap:24px;background:#f7f6fa;padding:64px max(24px,calc((100vw - 1320px)/2))}.lh-nic h2{margin:0}.lh-nic p{margin:0}.lh-nic .lh-eyebrow{grid-column:1/-1}
.lh-pharmacy{display:grid;grid-template-columns:1.1fr .8fr;align-items:center;gap:clamp(40px,8vw,120px);padding:clamp(80px,10vw,145px) max(24px,calc((100vw - 1320px)/2));background:#fff}.lh-pharmacy__collage{display:grid;grid-template-columns:1.2fr .8fr;grid-template-rows:repeat(2,240px);gap:12px;margin-left:-5vw}.lh-pharmacy__collage img{width:100%;height:100%;object-fit:cover}.lh-pharmacy__collage img:first-child{grid-row:span 2}.lh-consult{display:grid;grid-template-columns:1fr .7fr;align-items:center;gap:60px;padding:clamp(76px,10vw,140px) max(24px,calc((100vw - 1120px)/2));background:#e9e9f2}.lh-consult>img{width:100%;max-height:520px;object-fit:cover;object-position:center 30%}.lh-register{display:grid;grid-template-columns:1fr 1fr;gap:12px 40px;padding:84px max(24px,calc((100vw - 1120px)/2));background:#f7f6fa}.lh-register>*{margin:0}.lh-register .lh-eyebrow,.lh-register h2,.lh-register>p{grid-column:1}.lh-register>a{grid-column:1;justify-self:start}.lh-register form{grid-column:2;grid-row:1/4;align-self:center;display:grid;gap:12px}.lh-register input:not([type=checkbox]){height:52px;padding:0 14px;border:1px solid #a7a5cf;background:#fff;color:#42424b}.lh-newsletter-consent{display:flex;align-items:flex-start;gap:10px;line-height:1.5}.lh-newsletter-consent input{width:18px;height:18px;flex:0 0 18px;margin:2px 0 0;accent-color:#73729c}.lh-manifest{padding:clamp(84px,12vw,170px) 24px;text-align:center;background:#fff}.lh-manifest h2,.lh-manifest p{margin-inline:auto}.lh-manifest h2{max-width:900px}.lh-contact{padding:100px 24px;text-align:center}.lh-contact>*{margin-inline:auto}
.lh-cta{background:#73729c;border-color:#73729c;color:#fff}.lh-cta:hover{background:#5d5c88;border-color:#5d5c88;color:#fff}
html.lh-mobile-intro .lh-post-entry nav a{background:#73729c;color:#fff}.lh-post-entry__claim{color:#fff}
@media(max-width:760px){.lh-about,.lh-worlds,.lh-program,.lh-pharmacy,.lh-consult,.lh-register,.lh-nic{grid-template-columns:1fr}.lh-about{padding-top:0;gap:18px}.lh-about__photo{height:112vw;margin:0}.lh-about__text{padding:28px 24px 48px}.lh-benefits__row{grid-template-columns:1fr 1fr}.lh-benefits__row span:nth-child(3){border-left:0}.lh-benefits__row span:nth-child(n+3){border-top:1px solid #a7a5cf}.lh-worlds__grid{gap:12px}.lh-world{min-height:240px}.lh-world__copy strong{font-size:23px}.lh-featured__head{grid-template-columns:1fr}.lh-featured__head .lh-cta{grid-column:1;grid-row:auto;justify-self:start;margin-top:18px}.lh-featured__items{grid-template-columns:repeat(2,minmax(0,1fr));gap:22px 14px}.lh-program>img{min-height:320px;max-height:440px}.lh-program>div{padding:42px 24px 60px}.lh-nic{padding:52px 24px}.lh-nic .lh-eyebrow{grid-column:auto}.lh-pharmacy__collage{grid-template-rows:repeat(2,32vw);margin:0}.lh-register>*{grid-column:1!important;grid-row:auto!important}.lh-register form{margin-top:22px}}


.lh-scroll-cue__wheel{width:20px;height:32px;border:1px solid currentColor;border-radius:12px;display:grid;place-items:start center;padding-top:6px}
.lh-scroll-cue__wheel i{width:3px;height:6px;border-radius:2px;background:currentColor;animation:lh-wheel 1.8s ease-in-out infinite}
@keyframes lh-wheel{0%{transform:translateY(0);opacity:0}30%{opacity:1}70%{opacity:1}100%{transform:translateY(10px);opacity:0}}
@media (prefers-reduced-motion:reduce){.lh-scroll-cue__wheel i{animation:none;opacity:1}}

/* --- Split sekce ---------------------------------------------------------- */
.lh-split{position:relative;display:grid;grid-template-columns:1fr 1fr;min-height:min(86svh,860px);background:var(--site-main,#283020);color:var(--site-cream,#EFE5C7);overflow:hidden}
/* Každá sekce má jiný poměr – mřížka není pravidelná jako na referenci. */
.lh-split--wide-text{grid-template-columns:minmax(0,58%) minmax(0,42%)}
.lh-split--wide-media{grid-template-columns:minmax(0,42%) minmax(0,58%)}
.lh-split--narrow-text{grid-template-columns:minmax(0,36%) minmax(0,64%)}
.lh-split--tall{min-height:min(96svh,980px)}
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
  .lh-say--two{top:auto;bottom:14svh;left:var(--lh-gut,16px);text-align:left}
  .lh-say--two p:last-child{margin-left:0}
}
@media(max-width:600px){
  .lh-intro{height:100svh;min-height:560px}
  .lh-intro__meta ul{justify-content:center;font-size:11px}
  .lh-card{height:auto;min-height:0;position:relative;padding:clamp(80px,20vw,120px) 0}
  .lh-card__bg{position:absolute;inset:0}
  .lh-card__shade{background:linear-gradient(180deg,rgba(14,18,14,.12) 18%,rgba(14,18,14,.84) 78%)}
  .lh-stack__items{display:flex;flex-direction:column}
  .lh-reset__head{flex-direction:column;align-items:flex-start}
}
/* Editorial homepage details: distinct image and text rhythms, no composite photos. */
.lh-intro__fallback{display:none!important}
html.lh-mobile-intro .lh-intro__stage{background:#F4F1EB}
html.lh-mobile-intro #lh-paper{opacity:.86}
.lh-post-entry{background:none;padding:24px 22px;text-shadow:none}
.lh-post-entry img{width:46px;height:46px;margin-bottom:14px}
.lh-post-entry__brand{font-size:12px;letter-spacing:.34em;padding-left:.34em;color:#fff}
.lh-post-entry__claim{max-width:none;margin:12px 0 28px;font:300 clamp(40px,7vw,82px)/1.05 Fraunces,Georgia,serif;letter-spacing:-.025em;color:#fff}
.lh-post-entry nav{align-items:center;gap:24px}
.lh-post-entry nav a:first-child{min-height:48px;border-color:#73729c;border-radius:0;background:#73729c;color:#fff;padding:0 24px;font-size:13px;letter-spacing:.12em}
.lh-post-entry nav a:last-child{min-height:44px;border:0;border-radius:0;background:transparent;color:#fff;padding:0;text-decoration:underline;text-underline-offset:5px;font-size:14px;letter-spacing:.08em}
.lh-benefits{position:relative;text-align:left;padding-inline:max(24px,calc((100vw - 1320px)/2));background:#e9e9f2}
.lh-benefits h2{margin-inline:0;max-width:740px}
.lh-benefits__sub{margin:0 0 34px}
.lh-benefits__row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:0;margin:0 0 34px;gap:18px}
.lh-benefits__row span{display:grid;grid-template-columns:48px 1fr;align-items:center;gap:13px;padding:0;font-size:14px}
.lh-benefits__row span+span{border:0}
.lh-benefits__row i{width:46px;height:46px;border:1px solid #73729c;border-radius:50%;display:grid;place-items:center;color:#73729c}
.lh-benefits__row svg{width:25px;height:25px;fill:none;stroke:currentColor;stroke-width:1.25;stroke-linecap:round;stroke-linejoin:round}
.lh-worlds{grid-template-columns:minmax(230px,.55fr) 1.45fr}
.lh-worlds__grid{grid-template-columns:1.15fr .85fr;grid-template-rows:repeat(2,minmax(220px,1fr));gap:14px 18px}
.lh-world:first-child{grid-row:span 2;min-height:520px}.lh-world:first-child img{max-height:500px}
.lh-world{min-height:250px}
.lh-world__copy{background:#fff;left:0;right:0;bottom:0;padding:14px 0 18px}
.lh-world__copy strong{font-size:clamp(22px,2.3vw,34px)}
.lh-about__photo{height:auto}.lh-about__photo img{display:block;width:100%;height:auto;object-fit:contain;object-position:center;background:#e9e9f2}
.lh-about__role{color:#73729c;letter-spacing:.12em;text-transform:uppercase;font-size:12px!important}
.lh-about__text .lh-signature{font-family:'Segoe Script','Bradley Hand',cursive;font-style:normal;font-weight:400}
.lh-featured__items{grid-template-columns:repeat(4,minmax(0,1fr));align-items:start}
.lh-product:nth-child(even){margin-top:42px}
.lh-product img{object-fit:contain;padding:8px;background:#fff}
.lh-world__copy>span{color:#403f62;font-weight:500}
.lh-product__price{color:#403f62}
.lh-product img:not([src]),.lh-product img[src=""]{display:none}
.lh-program{min-height:0;grid-template-columns:1fr .8fr}
.lh-program>img{min-height:0;max-height:720px;object-fit:contain;background:#f8f7fb}
.lh-program>div{padding:clamp(36px,6vw,84px)}
.lh-pharmacy{grid-template-columns:minmax(0,1.2fr) minmax(280px,.7fr);gap:28px 7vw}
.lh-pharmacy__main img{display:block;width:100%;height:auto;max-height:680px;object-fit:contain}
.lh-pharmacy__room{margin:50px 0 0;grid-row:auto;grid-column:1/-1;max-width:100%}
.lh-pharmacy__room img{display:block;width:100%;height:auto;max-height:600px;object-fit:contain}
.lh-pharmacy__room:nth-of-type(4){max-width:76%;margin-left:auto}
.lh-pharmacy__room figcaption{padding:12px 0;color:#73729c;font-size:12px;letter-spacing:.12em;text-transform:uppercase}
.lh-consult{grid-template-columns:minmax(260px,.55fr) minmax(0,1.2fr);gap:clamp(42px,8vw,120px)}
.lh-consult>img{grid-column:1;grid-row:1}.lh-consult>div{grid-column:2;grid-row:1;max-width:680px}
.lh-consult>img{height:auto;max-height:620px;object-fit:contain}
.lh-contact h2{font-size:clamp(44px,7vw,82px)}.lh-contact__details{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin:20px 0;color:#403f62}.lh-contact__details a{color:inherit;text-decoration:none}
@media(max-width:760px){
 .lh-post-entry__claim{font-size:clamp(36px,11vw,52px);margin:10px 0 20px}
 .lh-post-entry nav{gap:18px}
 .lh-post-entry nav a:first-child{min-height:46px}
 .lh-benefits__row{grid-template-columns:1fr 1fr;gap:22px 14px}
 .lh-benefits__row span{grid-template-columns:42px 1fr;font-size:13px}
 .lh-benefits__row i{width:40px;height:40px}
 .lh-worlds__grid{grid-template-columns:1fr 1fr;grid-template-rows:auto}
 .lh-world:first-child{grid-row:auto;min-height:0}.lh-world__copy strong{font-size:22px}
 .lh-world{min-height:220px}
 .lh-product:nth-child(even){margin-top:0}
 .lh-pharmacy__room{grid-column:1;grid-row:auto;margin:18px 0 0}
 .lh-pharmacy__room:nth-of-type(4){max-width:100%;margin-left:0}
 .lh-program{grid-template-columns:1fr}
 .lh-program>img{max-height:72svh}
 .lh-consult>img{grid-column:1;grid-row:1;max-width:76%;margin:0 auto}
 .lh-consult>div{grid-column:1;grid-row:2}
}
@media(max-width:760px){
 .lh-worlds{grid-template-columns:minmax(0,1fr);gap:26px;padding-inline:24px}
 .lh-worlds__grid{grid-template-columns:minmax(0,1fr);gap:22px}
 .lh-world{display:grid;grid-template-columns:minmax(108px,.78fr) 1fr;align-items:center;min-height:0;gap:0 16px}
 .lh-world img{grid-column:1;grid-row:1/3;min-height:0;max-height:none;aspect-ratio:1}
 .lh-world__n{top:8px;left:8px}
 .lh-world__copy{grid-column:2;gap:5px;padding:8px 0}
 .lh-world__copy strong{font-size:23px;overflow-wrap:anywhere}
 .lh-featured__items{grid-template-columns:minmax(0,1fr);gap:24px}
 .lh-product{display:grid;grid-template-columns:minmax(108px,.72fr) 1fr;align-items:center;gap:0 16px;min-width:0}
 .lh-product>a{display:contents}
 .lh-product img{grid-column:1;grid-row:1/5;width:100%;height:auto;aspect-ratio:1;object-fit:contain}
 .lh-product__n,.lh-product h3,.lh-product p,.lh-product .lh-cta{grid-column:2;min-width:0;overflow-wrap:anywhere}
 .lh-product:nth-child(even){margin-top:0}
 .lh-product .lh-cta{justify-self:start;max-width:100%;white-space:normal}
}
html.lh-mobile-intro .lh-post-entry nav a:last-child{min-height:0!important;padding:0 0 5px!important;border:0!important;border-bottom:1px solid rgba(255,255,255,.85)!important;border-radius:0!important;background:transparent!important;color:#fff!important}
@media(prefers-reduced-motion:reduce){.lh-world img,.lh-product img{transition:none!important}}

/* Three independent rooms: fixed-height editorial frames on desktop, native snap rail on phones. */
.lh-pharmacy__gallery{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin-top:14px}
.lh-pharmacy__room{min-width:0;margin:0;overflow:hidden;border-radius:24px;background:#fff}
.lh-pharmacy__room-frame{height:clamp(260px,31vw,430px);overflow:hidden;border-radius:24px;background:#e9e9f2}
.lh-pharmacy__room-frame img{display:block;width:100%;height:124%;object-fit:cover;will-change:transform}
.lh-pharmacy__room:nth-child(1) img{object-position:center 44%}.lh-pharmacy__room:nth-child(2) img{object-position:center 52%}.lh-pharmacy__room:nth-child(3) img{object-position:center 48%}
.lh-pharmacy__room figcaption{padding:14px 4px 0;color:#73729c;font-size:11px;letter-spacing:.12em;text-transform:uppercase}
.dc-root .lh-pharmacy__gallery{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin-top:14px}
.dc-root .lh-pharmacy__room{grid-column:auto;grid-row:auto;min-width:0;max-width:none;margin:0;overflow:hidden;border-radius:24px;background:#fff}
.dc-root .lh-pharmacy__main{min-width:0}
.dc-root .lh-pharmacy__main img{display:block;width:100%;height:auto;max-height:680px;object-fit:contain}
.dc-root .lh-pharmacy__room-frame{height:clamp(260px,31vw,430px);overflow:hidden;border-radius:24px;background:#e9e9f2}
.dc-root .lh-pharmacy__room-frame img{display:block;width:100%;height:124%;object-fit:cover;will-change:transform}
.dc-root .lh-pharmacy__room figcaption{padding:14px 4px 0;color:#73729c;font-size:11px;letter-spacing:.12em;text-transform:uppercase}
.dc-root .lh-pharmacy{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(280px,.7fr);align-items:center;gap:28px 7vw;padding:clamp(64px,10vw,145px) max(24px,calc((100vw - 1320px)/2));background:#fff}
.dc-root .lh-pharmacy__main{width:100%;min-width:0}
.dc-root .lh-pharmacy__main img{display:block;width:100%;height:auto;max-height:680px;object-fit:contain}
@media(max-width:760px){.lh-pharmacy__gallery{grid-column:1/-1;display:flex;gap:18px;margin:16px -24px 0;padding:0 24px 16px;overflow-x:auto;overscroll-behavior-inline:contain;scroll-snap-type:x mandatory;scroll-padding-inline:24px;-webkit-overflow-scrolling:touch;scrollbar-width:thin}.lh-pharmacy__room{flex:0 0 min(82vw,340px);scroll-snap-align:start}.lh-pharmacy__room-frame{height:clamp(300px,105vw,420px)}}
@media(max-width:760px){.dc-root .lh-pharmacy{grid-template-columns:minmax(0,1fr);gap:24px;padding:48px 24px}.dc-root .lh-pharmacy__gallery{grid-column:1/-1;display:flex;gap:18px;margin:16px -24px 0;padding:0 24px 16px;overflow-x:auto;overscroll-behavior-inline:contain;scroll-snap-type:x mandatory;scroll-padding-inline:24px;-webkit-overflow-scrolling:touch;scrollbar-width:thin}.dc-root .lh-pharmacy__room{flex:0 0 min(82vw,340px);scroll-snap-align:start}.dc-root .lh-pharmacy__room-frame{height:clamp(300px,105vw,420px)}}
@media(prefers-reduced-motion:reduce){.lh-pharmacy__room-frame img{transform:none!important;will-change:auto}}

/* Hero po vstupe: veľký claim vľavo dole, vpravo sklenený číslovaný rozcestník. */
.dc-root .lh-intro .lh-hx{inset:0;top:0;transform:none;display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,400px);align-items:end;gap:40px;padding:0 clamp(28px,4vw,64px) clamp(96px,11svh,120px) calc(var(--rail-pad,0px) + clamp(28px,4vw,64px));text-align:left;align-content:end;background:linear-gradient(0deg,rgba(18,20,26,.62) 0%,rgba(18,20,26,.18) 45%,rgba(18,20,26,0) 70%);text-shadow:none}
.dc-root .lh-intro .lh-hx__brand{display:flex;align-items:center;gap:14px;margin:0 0 22px;padding-top:20px;border-top:1px solid rgba(216,197,152,.7);width:min(100%,340px)}
.dc-root .lh-intro .lh-hx__brand img{width:34px;height:34px;max-width:34px;margin:0;filter:brightness(0) invert(1)}
.dc-root .lh-intro .lh-hx .lh-post-entry__brand{font-size:12px;letter-spacing:.42em;padding:0;color:#fff}
.dc-root .lh-intro .lh-hx__claim{margin:0;max-width:none;font:300 clamp(58px,8.4vw,140px)/.92 Fraunces,Georgia,serif;letter-spacing:-.035em;color:#fff}
.dc-root .lh-intro .lh-hx__claim span{display:block}
.dc-root .lh-intro .lh-hx__claim em{display:block;font-style:italic;font-weight:300;padding-left:clamp(40px,8vw,150px);color:#f3e9d2}
.dc-root .lh-intro .lh-hx .lh-hx__index{display:flex;flex-direction:column;align-items:stretch!important;justify-content:flex-start;flex-wrap:nowrap;gap:0!important;padding:10px 26px;border-radius:24px 24px 24px 90px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.28);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);pointer-events:auto}
.dc-root .lh-intro .lh-hx .lh-hx__index a{display:grid!important;grid-template-columns:34px 1fr auto;align-items:center;width:100%;text-align:left;min-height:58px!important;padding:0!important;border:0!important;border-bottom:1px solid rgba(255,255,255,.22)!important;border-radius:0!important;background:none!important;color:#fff!important;text-decoration:none!important;letter-spacing:0!important;font:300 clamp(18px,1.4vw,21px)/1.2 Fraunces,Georgia,serif!important;transition:padding .35s}
.dc-root .lh-intro .lh-hx .lh-hx__index a:last-child{border-bottom:0!important}
.dc-root .lh-intro .lh-hx__index small{font:400 11px Figtree,sans-serif;letter-spacing:.16em;color:#d8c598}
.dc-root .lh-intro .lh-hx__index i{font-style:normal;opacity:.7;transition:transform .35s,opacity .35s}
.dc-root .lh-intro .lh-hx .lh-hx__index a:hover{padding-left:6px!important}
.dc-root .lh-intro .lh-hx .lh-hx__index a:hover i{transform:translateX(6px);opacity:1}
@media(min-width:1000px){.lh-vid-btn{left:calc(var(--rail-pad,0px) + 24px)!important}}
@media(max-width:999.98px){
  .dc-root .lh-intro .lh-hx{grid-template-columns:1fr;gap:26px;padding:0 20px 96px}
  .dc-root .lh-intro .lh-hx__claim{font-size:clamp(50px,14.5vw,76px)}
  .dc-root .lh-intro .lh-hx__claim em{padding-left:44px}
  .dc-root .lh-intro .lh-hx__brand{margin-bottom:16px;padding-top:14px}
  .dc-root .lh-intro .lh-hx__index{padding:4px 20px;border-radius:20px 20px 20px 60px}
  .dc-root .lh-intro .lh-hx .lh-hx__index a{min-height:48px!important;font-size:18px!important}
}

/* Preloader podľa Luckyho predlohy: krémový papier, nad slovom meno a rotujúce slovo vpravo,
   biele sklenené Vstúpte a pod ním „alebo posuňte“. */
.lh-intro__kicker{position:absolute;z-index:3;left:0;right:0;top:20svh;margin:0;text-align:center;font:400 12px/1 Figtree,sans-serif;letter-spacing:.38em;text-transform:uppercase;color:#5f6158;transition:opacity .6s;pointer-events:none}
html.lh-entered .lh-intro__kicker,html.lh-hero-mode .lh-intro__kicker{opacity:0}
@media (min-width:761px){
  html .lh-intro .lh-intro__cats .lh-cat{top:auto!important;bottom:calc(50% + min((100vw - 2*var(--lh-gut,16px))*.075,9svh) + 44px)!important;left:auto!important;right:12%!important;text-align:right!important;font:300 clamp(34px,3.6vw,58px)/1.1 Figtree,sans-serif!important;letter-spacing:-.02em!important;color:#262822!important;-webkit-text-fill-color:#262822!important;text-shadow:none!important}
}
html .lh-intro .lh-enter-wrap .lh-enter{background:rgba(255,255,255,.55)!important;border:1px solid rgba(255,255,255,.95)!important;color:#313C2B!important;box-shadow:inset 0 1px 0 #fff,0 6px 24px rgba(40,48,32,.08)!important;backdrop-filter:blur(14px)!important;-webkit-backdrop-filter:blur(14px)!important}
html .lh-intro .lh-enter-wrap .lh-or{display:flex!important;color:#6E7468}
html.lh-entered .lh-intro .lh-enter-wrap .lh-or{display:none!important}
@media (max-width:760px){.lh-intro__kicker{top:13svh;font-size:10px;letter-spacing:.3em;padding:0 20px;line-height:1.6}}
html.lh-mobile-intro .lh-intro .lh-cat{color:#262822!important;-webkit-text-fill-color:#262822!important}
html.lh-mobile-intro .lh-intro :is(.lh-vid-btn,.lh-intro__sound){background:rgba(255,255,255,.45)!important;border:1px solid rgba(255,255,255,.9)!important;color:#313C2B!important;backdrop-filter:blur(14px)!important;-webkit-backdrop-filter:blur(14px)!important}

/* --- Lanserhof / SHA: celoplošné sekcie, text v krémovom paneli, fotka do kraja,
   bez medzier, bez zaoblených kariet. Nadpis: kurzíva nad veľkým verzálkovým titulkom. --- */
.lh-flow{--fl-ink:#3d3c5c;--fl-text:#5b5a6e;--fl-gold:#a8884f;--fl-lav:#a7a5cf;--fl-lav-band:#eeecf5;--fl-sage-band:#e9eee4;--fl-cream:#f6f2ea;--fl-line:rgba(61,60,92,.16);position:relative;background:#fff;color:var(--fl-text)}
.dc-root .lh-flow>section{margin:0!important;border-radius:0!important;box-shadow:none!important;width:auto!important;max-width:none!important;background:transparent;color:var(--fl-text)}
.dc-root .lh-flow .lh-eyebrow{display:block;font:italic 300 clamp(21px,1.9vw,30px)/1.2 'Fraunces',Georgia,serif;letter-spacing:0;text-transform:none;color:var(--fl-ink);margin:0 0 6px}
.dc-root .lh-flow .lh-eyebrow:before{display:none}
.dc-root .lh-flow h2{font:300 clamp(32px,3.5vw,56px)/1.04 'Fraunces',Georgia,serif;letter-spacing:.02em;text-transform:uppercase;color:var(--fl-ink);margin:0 0 26px;max-width:16ch}
.dc-root .lh-flow p{font-size:16px;line-height:1.7;color:var(--fl-text);max-width:52ch}
.dc-root .lh-flow .lh-cta{height:52px;padding:0 6px 0 24px;gap:16px;border-radius:40px;background:transparent;border:1px solid var(--fl-ink);color:var(--fl-ink);align-self:flex-start;font-size:13px;letter-spacing:.06em;text-transform:uppercase}
.dc-root .lh-flow .lh-cta .arrow{width:40px;height:40px;padding:10px;border-radius:50%;background:var(--fl-ink);color:#fff;box-sizing:border-box}
.dc-root .lh-flow .lh-cta:hover{background:var(--fl-ink);color:#fff}
.lh-flow .lh-frame{display:block;position:relative;overflow:hidden;border-radius:0!important}
.lh-panel,.dc-root .lh-flow .lh-about__text,.dc-root .lh-flow .lh-program>div,.dc-root .lh-flow .lh-pharmacy__copy{background:linear-gradient(160deg,#f3eee5 0%,#fbf9f5 70%)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;border:0!important;box-shadow:none!important;border-radius:0!important;margin:0!important;max-width:none!important;display:flex;flex-direction:column;justify-content:center;padding:clamp(48px,6vw,112px) clamp(28px,5vw,96px)!important}
.lh-flow .lh-fill{position:relative;overflow:hidden;margin:0;min-height:100%}
.lh-flow .lh-fill>img,.dc-root .lh-flow .lh-about__photo img,.dc-root .lh-flow .lh-benefits__photo img,.dc-root .lh-flow .lh-program>.lh-frame img,.dc-root .lh-flow .lh-pharmacy__main img{position:absolute!important;left:0;top:-8%!important;width:100%!important;height:116%!important;max-height:none!important;object-fit:cover!important}

/* 1 Kto je Lucia: text vľavo, portrét vpravo cez celú výšku. */
.dc-root .lh-flow .lh-about{display:grid!important;grid-template-columns:5fr 7fr;min-height:100svh;padding:0!important;gap:0!important;align-items:stretch}
.dc-root .lh-flow .lh-about__text{order:1}
.dc-root .lh-flow .lh-about__photo{order:2;position:relative;overflow:hidden;height:auto!important;min-height:100svh;margin:0!important;border-radius:0!important}
.dc-root .lh-flow .lh-about__photo img{object-position:center 25%!important}
.dc-root .lh-flow .lh-about__text h2{text-transform:uppercase;font-size:clamp(30px,3vw,48px)}
.dc-root .lh-flow .lh-about__role{font-size:12px!important;letter-spacing:.2em;text-transform:uppercase;color:var(--fl-gold)!important;margin:-12px 0 22px}
.dc-root .lh-flow .lh-signature{font:italic 300 44px 'Fraunces',Georgia,serif;color:var(--fl-ink)!important;margin:6px 0 26px}

/* 2 Čo vzniká z rozhovoru: fotka vľavo, text vpravo, zoznam tenkými linkami. */
.dc-root .lh-flow .lh-benefits{display:grid!important;grid-template-columns:7fr 5fr;grid-auto-rows:auto;align-content:center;column-gap:0;min-height:100svh;padding:0!important;background:linear-gradient(160deg,#f3eee5 0%,#fbf9f5 70%)!important;text-align:left;border-radius:0!important}
.dc-root .lh-flow .lh-benefits>*{grid-column:2;margin-left:clamp(28px,5vw,96px);margin-right:clamp(24px,4vw,80px)}
.dc-root .lh-flow .lh-benefits>.lh-eyebrow{margin-top:clamp(48px,6vw,110px)}
.dc-root .lh-flow .lh-benefits>.lh-cta{margin-bottom:clamp(48px,6vw,110px);justify-self:start}
.dc-root .lh-flow .lh-benefits__photo{grid-column:1!important;grid-row:1/span 6;margin:0!important;min-height:100svh;height:auto;position:relative;overflow:hidden;border-radius:0!important}
.dc-root .lh-flow .lh-benefits__row{display:block!important;margin-top:18px;margin-bottom:36px;border-top:1px solid var(--fl-line)!important}
.dc-root .lh-flow .lh-benefits__row span{display:flex!important;flex-direction:row!important;align-items:center;gap:18px!important;min-height:0!important;padding:18px 0!important;border:0!important;border-bottom:1px solid var(--fl-line)!important;border-radius:0!important;background:none!important;transform:none!important;font:300 clamp(18px,1.4vw,22px)/1.3 'Fraunces',Georgia,serif;color:var(--fl-ink)}
.dc-root .lh-flow .lh-benefits__row i{flex:none;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:none;border:1px solid var(--fl-lav);color:var(--fl-ink)}
.dc-root .lh-flow .lh-benefits__row svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.4}

/* 3 Oblasti: hlavička v riadku, potom štyri stĺpce fotiek cez celú šírku. */
.dc-root .lh-flow .lh-worlds{display:block!important;padding:clamp(80px,9vw,140px) 0 0!important;background:#fff;overflow:visible}
.dc-root .lh-flow .lh-worlds__intro{display:grid;grid-template-columns:1fr 1fr;column-gap:clamp(28px,6vw,120px);align-items:end;padding:0 clamp(24px,5vw,96px) clamp(40px,5vw,72px)}
.dc-root .lh-flow .lh-worlds__intro>.lh-eyebrow,.dc-root .lh-flow .lh-worlds__intro>h2{grid-column:1}
.dc-root .lh-flow .lh-worlds__intro>p:not(.lh-eyebrow),.dc-root .lh-flow .lh-worlds__intro>.lh-cta{grid-column:2}
.dc-root .lh-flow .lh-worlds__intro>p:not(.lh-eyebrow){grid-row:1/span 2;align-self:end;margin:0 0 28px}
.dc-root .lh-flow .lh-worlds__intro>.lh-cta{grid-row:3;margin-top:-10px}
.dc-root .lh-flow .lh-worlds__grid{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:2px;padding:0!important;overflow:visible}
.dc-root .lh-flow .lh-world{display:block!important;position:relative;height:min(78svh,760px)!important;margin:0!important;border-radius:0!important;overflow:hidden;flex:none}
.dc-root .lh-flow .lh-worlds__grid{grid-template-rows:none!important}
.dc-root .lh-flow .lh-world:first-child{grid-row:auto!important}
.dc-root .lh-flow .lh-world>.lh-frame{position:absolute!important;inset:0;margin:0!important;height:100%!important;border-radius:0!important}
.dc-root .lh-flow .lh-world img{position:absolute;inset:0;width:100%!important;height:100%!important;max-height:none!important;object-fit:cover;transition:transform 1.2s cubic-bezier(.16,1,.3,1)}
.dc-root .lh-flow .lh-world__copy{position:absolute;z-index:2;background:none!important;color:#fff;padding:0!important;right:clamp(20px,2vw,32px)!important}
.dc-root .lh-flow .lh-world__copy small,.dc-root .lh-flow .lh-world__copy>span,.dc-root .lh-flow .lh-world__copy strong{color:#fff!important}
.dc-root .lh-flow .lh-world:after{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(180deg,rgba(30,28,50,0) 50%,rgba(30,28,50,.78))!important}
.dc-root .lh-flow .lh-world__copy strong{overflow-wrap:anywhere;font-size:clamp(22px,1.8vw,30px)!important}
.dc-root .lh-flow .lh-world__n{position:absolute;z-index:2;top:22px;left:22px;color:#fff}
.dc-root .lh-flow .lh-world:hover img{transform:scale(1.04)}
.dc-root .lh-flow .lh-world:after{background:linear-gradient(180deg,rgba(30,28,50,0) 45%,rgba(30,28,50,.62))}
.dc-root .lh-flow .lh-world__copy strong{font:italic 300 clamp(24px,2.1vw,34px)/1.1 'Fraunces',Georgia,serif}
.dc-root .lh-flow .lh-world__copy{left:clamp(20px,2vw,32px);bottom:clamp(22px,2.4vw,36px)}

/* 4 Produkty: čistý biely rad, fotky 3:4, bez rytmických posunov. */
.dc-root .lh-flow .lh-featured{background:#fff!important;padding:clamp(80px,9vw,140px) clamp(24px,5vw,96px)!important;border-radius:0!important;margin:0!important}
.dc-root .lh-flow .lh-featured__head{display:grid;grid-template-columns:1fr auto;align-items:end;margin-bottom:clamp(36px,4vw,60px)}
.dc-root .lh-flow .lh-featured__head>p:not(.lh-eyebrow){display:none}
.dc-root .lh-flow .lh-featured__items{grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:clamp(14px,1.6vw,26px)!important}
.dc-root .lh-flow .lh-product,.dc-root .lh-flow .lh-product:nth-child(n){margin-top:0!important}
.dc-root .lh-flow .lh-product .lh-frame,.dc-root .lh-flow .lh-product:nth-child(n) .lh-frame{height:auto!important;aspect-ratio:3/4;border-radius:0!important;background:#f3f0ea}
.dc-root .lh-flow .lh-product__n{display:none!important}
.dc-root .lh-flow .lh-product h3{font:300 clamp(18px,1.4vw,21px)/1.25 'Fraunces',Georgia,serif;color:var(--fl-ink);margin:16px 0 4px}
.dc-root .lh-flow .lh-product p{margin:0 0 14px;font-size:14px;letter-spacing:.04em}
.dc-root .lh-flow .lh-product .lh-cta{height:44px;font-size:11px}
.dc-root .lh-flow .lh-product .lh-cta .arrow{width:32px;height:32px;padding:8px}

/* 5 RESET 40+: fotka vľavo, levanduľový panel vpravo. */
.dc-root .lh-flow .lh-program{display:grid!important;grid-template-columns:7fr 5fr;min-height:100svh;padding:0!important;gap:0;align-items:stretch}
.dc-root .lh-flow .lh-program>.lh-frame{position:relative;overflow:hidden;margin:0!important;height:auto!important;min-height:100svh;border-radius:0!important}
.dc-root .lh-flow .lh-program>div{background:linear-gradient(160deg,#e9e6f3 0%,#f7f5fb 75%)!important}
.dc-root .lh-flow .lh-program h2{font-size:clamp(48px,5.6vw,92px)}
.dc-root .lh-flow .lh-program__price{font:300 32px 'Fraunces',Georgia,serif!important;color:var(--fl-ink)!important;margin:4px 0 26px}

/* 6 Nič nemusíš: pás cez celú šírku, v strede. */
.dc-root .lh-flow .lh-nic{display:flex!important;flex-direction:column;align-items:center;justify-content:center;text-align:center;min-height:72svh;width:auto!important;padding:clamp(70px,8vw,120px) 24px!important;border-radius:0!important;background:var(--fl-sage-band)!important}
.dc-root .lh-flow .lh-nic h2,.dc-root .lh-flow .lh-nic p{margin-left:auto;margin-right:auto}
.dc-root .lh-flow .lh-nic h2{max-width:none;font-size:clamp(44px,6vw,96px)}
.dc-root .lh-flow .lh-nic .lh-cta{align-self:center}

/* 7 Lekáreň: text vľavo, fotka vpravo, pod tým tri miestnosti cez celú šírku. */
.dc-root .lh-flow .lh-pharmacy{display:grid!important;grid-template-columns:5fr 7fr;padding:0!important;gap:0!important;align-items:stretch}
.dc-root .lh-flow .lh-pharmacy__copy{order:1;min-height:100svh}
.dc-root .lh-flow .lh-pharmacy__main{order:2;position:relative;overflow:hidden;height:auto!important;min-height:100svh;border-radius:0!important}
.dc-root .lh-flow .lh-pharmacy__gallery{order:3;grid-column:1/-1;display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:2px;margin:2px 0 0!important;padding:0!important;overflow:visible}
.dc-root .lh-flow .lh-pharmacy__room,.dc-root .lh-flow .lh-pharmacy__room:nth-child(n){margin:0!important;border-radius:0!important;flex:none}
.dc-root .lh-flow .lh-pharmacy__room-frame{height:min(72svh,680px)!important;border-radius:0!important}
.dc-root .lh-flow .lh-pharmacy__room figcaption{left:clamp(20px,2vw,32px);bottom:clamp(22px,2.4vw,36px)}

/* 8 Konzultácia: krémový pás v strede. 9 Registrácia: šalviový pás v dvoch stĺpcoch. */
.dc-root .lh-flow .lh-consult{display:flex!important;justify-content:center;text-align:center;width:auto!important;margin:0!important;padding:clamp(90px,10vw,160px) 24px!important;border-radius:0!important;background:linear-gradient(160deg,#f3eee5 0%,#fbf9f5 70%)!important}
.dc-root .lh-flow .lh-consult>div{display:flex;flex-direction:column;align-items:center;max-width:760px}
.dc-root .lh-flow .lh-consult h2{max-width:none}
.dc-root .lh-flow .lh-consult .lh-cta{align-self:center}
.dc-root .lh-flow .lh-register{display:grid!important;grid-template-columns:1fr 1fr;column-gap:clamp(32px,6vw,120px);align-items:start;width:auto!important;margin:0!important;padding:clamp(80px,9vw,140px) clamp(24px,5vw,96px)!important;border-radius:0!important;background:var(--fl-sage-band)!important}
.dc-root .lh-flow .lh-register>:not(form):not(.newsletter-status){grid-column:1}
.dc-root .lh-flow .lh-register>form{grid-column:2;grid-row:1/span 4;align-self:center;display:grid;gap:14px}
.dc-root .lh-flow .lh-register input[type=email]{border-radius:0;height:54px;background:#fff;border:0;border-bottom:1px solid var(--fl-ink)}
/* Registrácia na Home: krátke tlačidlo podľa textu a viditeľné políčko súhlasu */
.dc-root .lh-flow .lh-register>form .lh-cta{justify-self:start;width:auto!important}
.dc-root .lh-flow .lh-register .lh-newsletter-consent{display:flex;align-items:center;gap:10px;cursor:pointer}
.dc-root .lh-flow .lh-register .lh-newsletter-consent input{appearance:auto!important;-webkit-appearance:checkbox!important;position:static!important;opacity:1!important;width:18px!important;height:18px!important;margin:0!important;flex:none;accent-color:var(--site-accent,#716f9e)}
.dc-root .lh-flow .lh-contact{background:#fff!important;padding:clamp(100px,11vw,180px) 24px!important}
.dc-root .lh-flow .lh-contact .lh-display{text-transform:uppercase;color:var(--fl-ink);font-weight:300}

@media(max-width:999.98px){
  .dc-root .lh-flow .lh-about,.dc-root .lh-flow .lh-benefits,.dc-root .lh-flow .lh-program,.dc-root .lh-flow .lh-pharmacy,.dc-root .lh-flow .lh-register{grid-template-columns:1fr!important;min-height:0}
  .dc-root .lh-flow .lh-about__photo,.dc-root .lh-flow .lh-program>.lh-frame,.dc-root .lh-flow .lh-pharmacy__main,.dc-root .lh-flow .lh-benefits__photo{order:0!important;min-height:0!important;height:min(118vw,72svh)!important}
  .dc-root .lh-flow .lh-about__text,.dc-root .lh-flow .lh-program>div,.dc-root .lh-flow .lh-pharmacy__copy{order:1!important;min-height:0;padding:48px 24px 56px!important}
  .dc-root .lh-flow .lh-benefits>*{grid-column:1;margin-left:24px;margin-right:24px}
  .dc-root .lh-flow .lh-benefits__photo{grid-row:1!important;margin:0!important}
  .dc-root .lh-flow .lh-benefits>.lh-eyebrow{margin-top:48px}
  .dc-root .lh-flow .lh-benefits>.lh-cta{margin-bottom:56px}
  .dc-root .lh-flow .lh-worlds__intro{grid-template-columns:1fr;padding:0 24px 32px}
  .dc-root .lh-flow .lh-worlds__intro>*{grid-column:1!important;grid-row:auto!important}
  .dc-root .lh-flow .lh-worlds__intro>.lh-cta{margin-top:0}
  .dc-root .lh-flow .lh-worlds__grid{grid-template-columns:1fr 1fr!important}
  .dc-root .lh-flow .lh-world{height:min(96vw,520px)!important}
  .dc-root .lh-flow .lh-featured{padding:64px 24px!important}
  .dc-root .lh-flow .lh-featured__head{grid-template-columns:1fr}
  .dc-root .lh-flow .lh-featured__items{grid-template-columns:1fr 1fr!important;gap:28px 14px!important}
  .dc-root .lh-flow .lh-pharmacy__gallery{grid-template-columns:1fr!important}
  .dc-root .lh-flow .lh-pharmacy__room-frame{height:min(100vw,460px)!important}
  .dc-root .lh-flow .lh-register>form{grid-column:1;grid-row:auto;margin-top:28px}
  .dc-root .lh-flow .lh-nic{min-height:0}
}
@media(max-width:560px){.dc-root .lh-flow .lh-worlds__grid{grid-template-columns:1fr!important}}
`;
