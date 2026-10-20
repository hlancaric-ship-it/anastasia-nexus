// ANASTASIA — homepage v layoutu podle referenčního webu (split sekce 50/50,
// typografický mix italic serif + uppercase sans, světlý papír a tmavá tlačítka).
// Obsah zůstává slovenský a značkový; mění se kompozice a typografie.
//
// Značka se nezmění: barvy jdou přes --site-* proměnné, takže motiv, který Lucia
// vybere v adminu, platí i tady.

import {escape as e, arrow} from './components.mjs';

const CREAM = '#EFE5C7';
const PAPER = '#F5F2E8';
const INK = '#283020';
const GOLD = '#C9A355';
const MUTED = '#69705E';

// Fotky, které máme v repu. Žádné cizí assety — jen to, co už existuje.
const IMG = {
  hero: '/assets/hero-forest.jpg',
  sky: '/assets/night-sky.jpg',
  lucia: '/assets/lucia-portrait.jpg',
  program: '/assets/tree.jpg',
};

const consults = [
  {n: '01', title: 'Online zdravotná konzultácia', sub: 'Osobne aj na diaľku', href: '/konzultacie/online-zdravotna-konzultacia'},
  {n: '02', title: 'Supervízia', sub: 'Pre odborníkov a tímy', href: '/konzultacie/supervizia'},
  {n: '03', title: 'Astrologický profil', sub: 'Zdravie a predispozície', href: '/konzultacie/astrologicky-profil-zdravia-a-vitality'},
];

const categories = [
  {title: 'Kozmetika', note: 'Prírodná starostlivosť o pleť a telo.', href: '/eshop/kategoria/bio-kozmetika-bez-chemie', img: '/assets/product-bottle.svg'},
  {title: 'Bylinky a výživa', note: 'Rastlinné prípravky a zdravá výživa.', href: '/eshop/kategoria/bylinky-a-vyziva', img: '/assets/product-jar.svg'},
  {title: 'Programy a služby', note: 'RESET 40+ a sprevádzanie na mieru.', href: '/eshop/kategoria/programy-a-sluzby', img: '/assets/product-sun.svg'},
  {title: 'Domov', note: 'Rituály, ktoré sprevádzajú dňa.', href: '/eshop', img: '/assets/product-candle.svg'},
];

// Dvojí typografie: italic serif + uppercase sans. Stejně jako reference.
const duo = (italic, caps) => `<span class="lh-display">${italic}</span><span class="lh-caps">${caps}</span>`;

const media = (src, alt, cls = '') => `<div class="lh-split__media ${cls}"><img src="${src}" alt="${e(alt)}" loading="lazy"></div>`;

const splitText = (eyebrow, italic, caps, body, cta) => `
  <div class="lh-split__text">
    <p class="lh-eyebrow">${e(eyebrow)}</p>
    ${duo(italic, caps)}
    <p class="lh-lead">${body}</p>
    ${cta ? `<a class="lh-cta" href="${cta.href}">${e(cta.label)} ${arrow}</a>` : ''}
  </div>`;

const listRow = (n, title, sub, href) => `
  <a class="lh-row" href="${href}">
    <span class="lh-row__n">${n}</span>
    <span class="lh-row__body"><strong>${e(title)}</strong><small>${e(sub)}</small></span>
    <span class="lh-row__arrow">↗</span>
  </a>`;

export function homeSections(products = []) {
  const items = products.map((p, i) => ({...p, n: `N° ${String(i + 1).padStart(2, '0')}`}));

  const hero = `
<section class="lh-hero" data-screen-label="01 Hero">
  <div class="lh-hero__media" aria-hidden="true" style="background-image:url(${IMG.hero})"></div>
  <div class="lh-hero__scrim" aria-hidden="true"></div>
  <div class="lh-hero__ghost" aria-hidden="true">ANASTASIA</div>
  <div class="lh-hero__inner">
    ${duo('V rovnováhe so sebou.', 'S PRÍRODOU.')}
    <p class="lh-hero__lead">Návrat k tomu podstatnému. Prírodná kozmetika, programy a sprevádzanie pre tých, ktorí chcú žiť pomalšie a vedomejšie.</p>
    <div class="lh-hero__actions">
      <a class="lh-cta" href="/eshop">Objavte svet ANASTASIA ${arrow}</a>
      <a class="lh-cta lh-cta--ghost" href="#kolekcia">Kolekcia ↓</a>
    </div>
  </div>
  <a class="lh-hero__scroll" href="#manifest" aria-label="Prejsť na obsah">↓</a>
</section>`;

  const manifesto = `
<section class="lh-split lh-split--paper" id="manifest" data-screen-label="02 Manifest">
  ${splitText('Vitajte', 'Nie ako ponuka riešení.', 'ALE AKO PRIESTOR',
    'Kde veci nemusia byť urýchľované, vysvetľované ani riadené. Priestor pre zdravie, poznanie a vedomý život — bez tlaku a bez zbytočného ruchu.',
    {href: '/zdravy-svet', label: 'Zdravý svet'})}
  ${media(IMG.sky, 'Nočná obloha nadhorskou oblohou')}
</section>`;

  const collection = `
<section class="lh-split lh-split--flip" id="kolekcia" data-screen-label="03 Kolekcia">
  ${media(IMG.program, 'Rieka v lese')}
  <div class="lh-split__text">
    <p class="lh-eyebrow">Kolekcia</p>
    ${duo('Vybrané', 'PRE VÁS.')}
    <div class="lh-list">${items.map(p => listRow(p.n, p.name, p.priceLabel, `/eshop/produkt/${p.slug}`)).join('')}</div>
    <a class="lh-cta" href="/eshop">Celý obchod ${arrow}</a>
  </div>
</section>`;

  const programme = `
<section class="lh-split lh-split--paper" id="program" data-screen-label="04 Program">
  ${splitText('Program RESET 40+', 'Nová kapitola', 'SA ZAČÍNA VAMI.',
    'Šestnásť tematických týždňov. Jednorazový vzdelávací program vo vlastnom tempe — bez zbytočného zhonu a bez strachu, že niečo zmeškáte.',
    {href: '/eshop/produkt/reset-40-plus', label: 'Objaviť RESET 40+'})}
  ${media(IMG.hero, 'Světlo v lese')}
  <div class="lh-stats">
    <div><strong>16</strong><span>týždňov</span></div>
    <div><strong>∞</strong><span>vlastné tempo</span></div>
    <div><strong>1×</strong><span>jednorazový prístup</span></div>
  </div>
</section>`;

  const consultations = `
<section class="lh-split lh-split--flip" id="konzultacie" data-screen-label="05 Konzultácie">
  ${media(IMG.lucia, 'Mgr. Lucia Rogožanová, zakladateľka ANASTASIA')}
  <div class="lh-split__text">
    <p class="lh-eyebrow">Sprevádzanie</p>
    ${duo('Čo vám', 'VIEME PONÚKNUŤ.')}
    <div class="lh-list">${consults.map(c => listRow(c.n, c.title, c.sub, c.href)).join('')}</div>
    <a class="lh-cta" href="/konzultacie">Všetky konzultácie ${arrow}</a>
  </div>
</section>`;

  const grid = `
<section class="lh-grid" id="kategorie" data-screen-label="06 Kategórie">
  <div class="lh-grid__head">
    <p class="lh-eyebrow">Kategórie</p>
    ${duo('Svet', 'ANASTASIA.')}
  </div>
  <div class="lh-grid__items">${categories.map(c => `
    <a class="lh-tile" href="${c.href}">
      <span class="lh-tile__media"><img src="${c.img}" alt="" loading="lazy"></span>
      <span class="lh-tile__body"><strong>${e(c.title)}</strong><small>${e(c.note)}</small></span>
    </a>`).join('')}</div>
</section>`;

  const cta = `
<section class="lh-contact" data-screen-label="07 Kontakt">
  <p class="lh-eyebrow">Kontakt</p>
  ${duo('Potrebujete', 'POMOC?')}
  <p class="lh-lead lh-lead--center">Či už viete, čo hľadáte, alebo práve neviete, odkiaľ začať — napíšte nám. Ozveme sa osobne.</p>
  <a class="lh-cta" href="/kontakt">Napíšte nám ${arrow}</a>
</section>`;

  return [hero, manifesto, collection, programme, consultations, grid, cta].join('\n');
}

// CSS homepage. Drží se v jednom bloku, aby se design dal přehledně měnit.
export const HOME_CSS = `
.lh-display{font-family:'EB Garamond',Georgia,'Times New Roman',serif;font-style:italic;font-weight:400;font-size:clamp(30px,3.6vw,56px);line-height:1.06;letter-spacing:-.01em;display:block;color:var(--site-cream,#EFE5C7)}
.lh-caps{font-family:Outfit,'Helvetica Neue',sans-serif;font-weight:300;font-size:clamp(34px,4.6vw,78px);line-height:.98;letter-spacing:.01em;text-transform:uppercase;display:block;margin-top:.12em;color:var(--site-cream,#EFE5C7)}
.lh-eyebrow{font-size:11px;font-weight:400;letter-spacing:.2em;text-transform:uppercase;color:var(--site-accent,#C9A355);margin:0}
.lh-lead{font-size:clamp(15px,1.15vw,17px);line-height:1.7;color:currentColor;opacity:.78;max-width:44ch;margin:0}
.lh-lead--center{margin-inline:auto;text-align:center}
.lh-cta{display:inline-flex;align-items:center;gap:22px;align-self:flex-start;height:54px;padding:0 26px;border-radius:27px;background:var(--site-main,#283020);color:var(--site-cream,#EFE5C7);font-size:14px;font-weight:400;border:1px solid var(--site-main,#283020);transition:background .3s,color .3s,border-color .3s}
.lh-cta:hover{background:var(--site-deep,#26321E);border-color:var(--site-deep,#26321E)}
.lh-cta .arrow{width:20px;height:20px}
.lh-cta--ghost{background:rgba(255,255,255,.09);border-color:rgba(255,255,255,.22);color:var(--site-cream,#EFE5C7);backdrop-filter:blur(14px) saturate(140%);-webkit-backdrop-filter:blur(14px) saturate(140%)}
.lh-cta--ghost:hover{background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.32)}

.lh-hero{position:relative;height:100svh;min-height:660px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;overflow:hidden;background:var(--site-deep,#26321E)}
.lh-hero__media{position:absolute;inset:0;background-size:cover;background-position:center 38%;will-change:transform}
.lh-hero__scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(16,24,15,.4) 0%,rgba(16,24,15,.18) 32%,rgba(16,24,15,.62) 72%,rgba(8,12,7,.9) 100%)}
.lh-hero__ghost{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);font-weight:100;font-size:clamp(110px,20vw,360px);letter-spacing:-.06em;line-height:.8;color:rgba(239,229,199,.07);white-space:nowrap;pointer-events:none;user-select:none}
.lh-hero__inner{position:relative;z-index:2;width:100%;max-width:1240px;padding:0 clamp(20px,4vw,64px) clamp(64px,10vh,120px);display:flex;flex-direction:column;align-items:center;text-align:center;gap:clamp(18px,2.4vh,30px)}
.lh-hero__lead{font-size:clamp(15px,1.1vw,17px);line-height:1.7;color:rgba(239,229,199,.82);max-width:56ch;margin:0}
.lh-hero__actions{display:flex;flex-wrap:wrap;gap:14px;justify-content:center;margin-top:6px}
.lh-hero__actions .lh-cta{align-self:auto}
.lh-hero__scroll{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);z-index:2;width:44px;height:44px;display:grid;place-items:center;color:rgba(239,229,199,.7);font-size:18px}

.lh-split{position:relative;display:grid;grid-template-columns:1fr 1fr;min-height:min(86vh,860px);background:var(--site-main,#283020);color:var(--site-cream,#EFE5C7)}
.lh-split--flip .lh-split__media{order:-1}
.lh-split--paper{background:var(--lh-paper,#F5F2E8);color:var(--lh-ink,#283020)}
.lh-split__text{display:flex;flex-direction:column;justify-content:center;gap:clamp(20px,2.4vw,34px);padding:clamp(56px,7vw,120px) clamp(28px,5vw,96px)}
.lh-split--paper .lh-display{color:var(--lh-ink,#283020)}
.lh-split--paper .lh-caps{color:var(--lh-ink,#283020)}
.lh-split__media{position:relative;overflow:hidden;min-height:380px;background:var(--site-deep,#26321E)}
.lh-split__media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.lh-split--paper .lh-cta{background:var(--lh-ink,#283020);border-color:var(--lh-ink,#283020);color:var(--lh-paper,#F5F2E8)}

.lh-list{display:flex;flex-direction:column;border-top:1px solid currentColor}
.lh-row{display:grid;grid-template-columns:44px minmax(0,1fr) auto;align-items:center;gap:16px;padding:20px 0;border-bottom:1px solid rgba(239,229,199,.18);transition:padding .35s var(--ana-ease-soft)}
.lh-split--paper .lh-row{border-bottom-color:rgba(40,48,32,.16)}
.lh-row:hover{padding-left:12px}
.lh-row__n{font-size:12px;letter-spacing:.12em;color:var(--site-accent-deep,#796236)}
.lh-row__body{display:flex;flex-direction:column;gap:4px;min-width:0}
.lh-row__body strong{font-weight:300;font-size:clamp(19px,1.7vw,26px);letter-spacing:-.02em;line-height:1.2}
.lh-row__body small{font-size:13px;color:currentColor;opacity:.7}
.lh-row__arrow{font-size:16px;opacity:.7}

.lh-stats{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:rgba(40,48,32,.14);border-top:1px solid rgba(40,48,32,.14)}
.lh-stats>div{background:var(--lh-paper,#F5F2E8);color:var(--lh-ink,#283020);padding:clamp(28px,4vw,52px) clamp(20px,3vw,44px);display:flex;flex-direction:column;gap:8px}
.lh-stats strong{font-weight:100;font-size:clamp(38px,4.6vw,68px);line-height:1;letter-spacing:-.04em}
.lh-stats span{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:currentColor;opacity:.7}

.lh-grid{background:var(--site-main,#283020);padding:clamp(72px,9vw,140px) clamp(20px,4vw,64px)}
.lh-grid__head{display:flex;flex-direction:column;gap:18px;align-items:center;text-align:center;margin-bottom:clamp(40px,5vw,72px)}
.lh-grid__items{display:grid;grid-template-columns:repeat(4,1fr);gap:clamp(14px,1.6vw,24px)}
.lh-tile{display:flex;flex-direction:column;gap:18px;transition:transform .4s var(--ana-ease-soft)}
.lh-tile:hover{transform:translateY(-6px)}
.lh-tile__media{display:block;aspect-ratio:3/4;overflow:hidden;border-radius:90px 0 0 0;background:var(--site-deep,#26321E)}
.lh-tile__media img{width:100%;height:100%;object-fit:cover;transition:transform .9s var(--ana-ease)}
.lh-tile:hover .lh-tile__media img{transform:scale(1.06)}
.lh-tile__body{display:flex;flex-direction:column;gap:8px}
.lh-tile__body strong{font-weight:300;font-size:clamp(20px,1.7vw,26px);letter-spacing:-.02em;color:var(--site-cream,#EFE5C7)}
.lh-tile__body small{font-size:14px;line-height:1.6;color:rgba(239,229,199,.7)}

.lh-contact{display:flex;flex-direction:column;align-items:center;text-align:center;gap:clamp(18px,2.2vw,30px);padding:clamp(88px,11vw,170px) clamp(20px,4vw,64px);background:var(--lh-paper,#F5F2E8);color:var(--lh-ink,#283020)}
.lh-contact .lh-display,.lh-contact .lh-caps{color:var(--lh-ink,#283020)}
.lh-contact .lh-cta{background:var(--lh-ink,#283020);border-color:var(--lh-ink,#283020);color:var(--lh-paper,#F5F2E8)}

@media(max-width:999.98px){
  .lh-split{grid-template-columns:1fr;min-height:0}
  .lh-split--flip .lh-split__media{order:0}
  .lh-split__media{min-height:58vw}
  .lh-split__text{padding:clamp(48px,9vw,72px) 24px}
  .lh-grid__items{grid-template-columns:repeat(2,1fr)}
  .lh-stats{grid-template-columns:1fr}
  .lh-tile__media{border-radius:56px 0 0 0}
}
@media(max-width:600px){
  .lh-hero{height:92svh;min-height:560px}
  .lh-hero__actions{flex-direction:column;align-items:stretch}
  .lh-hero__actions .lh-cta{justify-content:space-between}
  .lh-grid__items{grid-template-columns:1fr}
  .lh-row{grid-template-columns:36px minmax(0,1fr) auto;padding:16px 0}
}
`;
