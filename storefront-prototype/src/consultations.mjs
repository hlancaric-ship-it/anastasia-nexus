import {api} from './lib/api/index.mjs';
import {escape as e, arrow, button, splitHero, sentenceCase} from './components.mjs';

const CONSULTATION_HANDLES = {
  'online-zdravotna-konzultacia': {name: 'Online zdravotná konzultácia', kind: 'online-zdravotna-konzultacia', page: '/konzultacie/online-zdravotna-konzultacia', img: '/img/lucia/lucia-portret-1600.webp'},
  'supervizia': {name: 'Supervízia', kind: 'supervizia', page: '/konzultacie/supervizia', img: '/img/lucia/stacionar-kresla-1600.webp'},
  'astrologia-zdravie-predispozicia': {name: 'Astrologický profil zdravia a vitality', kind: 'astrologia-zdravie-predispozicia', page: '/konzultacie/astrologicky-profil-zdravia-a-vitality'},
  'personalizovany-zdravotny-protokol-pro': {name: 'Personifikovaný zdravotný protokol', kind: 'personalizovany-zdravotny-protokol-pro', img: '/img/lucia/lekaren-1600.webp'},
};

// Vrstva shopv2 je deklarovaná pred legacy (tokens.css), preto jej !important prebije pastelové štýly riadkov.
const SKY_CSS = `<style>@layer shopv2{
.legacy-main .lan-row.lan-row--sky{position:relative!important;isolation:isolate;overflow:hidden;background:#0b0d1c!important}
.lan-row--sky .lan-row__sky{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-1;pointer-events:none}
.legacy-main .lan-row--sky .lan-row__photo{background:transparent!important}
.legacy-main .lan-row--sky .lan-row__text{background:rgba(11,13,28,.6)!important;-webkit-backdrop-filter:none;backdrop-filter:none}
.legacy-main .lan-row--sky .lan-row__text h2{color:#f4f1fb!important}
.legacy-main .lan-row--sky .lan-row__index{color:#d8c08a!important}
.legacy-main .lan-row--sky .lan-row__price{color:#cfcbe8!important}
.legacy-main .lan-row--sky .lan-row__desc{color:#e4e1f3!important}
.legacy-main .lan-row--sky .lan-row__actions .button:not(.outline){background:#f4f1fb!important;color:#2f2e4a!important;border-color:#f4f1fb!important}
.legacy-main .lan-row--sky .lan-row__actions .button.outline{color:#f4f1fb!important;border-color:rgba(244,241,251,.6)!important;background:transparent!important}
@media (prefers-reduced-motion:reduce){.lan-row--sky .lan-row__sky{display:none}.legacy-main .lan-row.lan-row--sky{background:#0b0d1c url(/media/night-sky.jpg) center/cover!important}}
}</style>`;

export const consultations = () => {
  const products = api.getProducts();
  const consults = products.filter(p => {
    const handle = p.slug;
    // Konzultácie sú v kategórii AI ANASTASIA ACADEMY a majú špecifické slugy
    return CONSULTATION_HANDLES[handle];
  });

  if (!consults.length) {
    return `<section class="section"><h2>Konzultácie</h2><p>Načítavam ponuku konzultácií…</p></section>`;
  }

  // Každá konzultácia je celoplošný pás: fotka od okraja po okraj + textový panel, smer sa strieda.
  const tones = ['cream', 'lavender', 'sage', 'cream'];
  const items = consults.map((p, i) => {
    const info = CONSULTATION_HANDLES[p.slug] || {};
    const detail = info.page || `/eshop/produkt/${p.slug}`;
    const desc = p.description ? p.description.slice(0, 220) + (p.description.length > 220 ? '…' : '') : '';
    // Astrológia: nočná obloha ide cez celý pás, na strane fotky naplno, pod textom cez tmavý závoj (~40 %).
    const sky = info.kind === 'astrologia-zdravie-predispozicia';
    return `<article class="lan-row lan-row--${tones[i % tones.length]}${i % 2 ? ' lan-row--flip' : ''}${sky ? ' lan-row--sky' : ''}">
        ${sky ? '<video class="lan-row__sky" autoplay muted loop playsinline preload="metadata" poster="/media/night-sky.jpg" aria-hidden="true"><source src="/media/night-sky.mp4" type="video/mp4"></video>' : ''}
        <a href="${e(detail)}" class="lan-row__photo" tabindex="-1" aria-hidden="true">${sky ? '' : `<img src="${e(info.img || p.image)}" alt="" width="900" height="1000" loading="lazy">`}</a>
        <div class="lan-row__text">
          <p class="lan-row__index">0${i + 1}</p>
          <h2>${e(info.name || p.name)}</h2>
          <p class="lan-row__price">${e(p.priceLabel)}</p>
          ${desc ? `<p class="lan-row__desc">${e(desc)}</p>` : ''}
          <div class="lan-row__actions">${button(`/konzultacie/rezervacia?typ=${encodeURIComponent(info.kind || p.slug)}`, 'Rezervovať termín')}${button(detail, 'Viac o konzultácii', 'outline')}</div>
        </div>
      </article>`;
  }).join('');

  return `<section class="section lan-page consult-page">${SKY_CSS}${splitHero(pageIntro('KONZULTÁCIE', 'Vyberte si termín.', 'Online konzultácie, supervízia, astrologický profil a personifikované protokoly.'), '/img/lucia/stacionar-poradna-1600.webp', 'Poradňa ANASTASIA', {tone: 'lavender'})}<div class="lan-rows">${items}</div></section>`;
};

const pageIntro = (eyebrow, title, description) => `<div class="page-intro"><p class="eyebrow" data-content="konzultacie__konzultacie-1__0-text">${e(sentenceCase(eyebrow))}</p><h1>${e(title)}</h1><p class="lead">${e(description)}</p></div>`;
