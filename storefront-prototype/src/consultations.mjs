import {api} from './lib/api/index.mjs';
import {escape as e, arrow, button, splitHero} from './components.mjs';

const CONSULTATION_HANDLES = {
  'online-zdravotna-konzultacia': {name: 'Online zdravotná konzultácia', kind: 'online-zdravotna-konzultacia', page: '/konzultacie/online-zdravotna-konzultacia'},
  'supervizia': {name: 'Supervízia', kind: 'supervizia', page: '/konzultacie/supervizia', img: '/img/legacy-f10de1aed763.webp'},
  'astrologia-zdravie-predispozicia': {name: 'Astrologický profil zdravia a vitality', kind: 'astrologia-zdravie-predispozicia', page: '/konzultacie/astrologicky-profil-zdravia-a-vitality'},
  'personalizovany-zdravotny-protokol-pro': {name: 'Personifikovaný zdravotný protokol', kind: 'personalizovany-zdravotny-protokol-pro'},
};

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
    return `<article class="lan-row lan-row--${tones[i % tones.length]}${i % 2 ? ' lan-row--flip' : ''}">
        <a href="${e(detail)}" class="lan-row__photo" tabindex="-1" aria-hidden="true"><img src="${e(info.img || p.image)}" alt="" width="900" height="1000" loading="lazy"></a>
        <div class="lan-row__text">
          <p class="lan-row__index">0${i + 1}</p>
          <h2>${e(info.name || p.name)}</h2>
          <p class="lan-row__price">${e(p.priceLabel)}</p>
          ${desc ? `<p class="lan-row__desc">${e(desc)}</p>` : ''}
          <div class="lan-row__actions">${button(`/konzultacie/rezervacia?typ=${encodeURIComponent(info.kind || p.slug)}`, 'Rezervovať termín')}${button(detail, 'Viac o konzultácii', 'outline')}</div>
        </div>
      </article>`;
  }).join('');

  return `<section class="section lan-page consult-page">${splitHero(pageIntro('KONZULTÁCIE', 'Vyberte si termín.', 'Online konzultácie, supervízia, astrologický profil a personifikované protokoly.'), '/img/lucia/stacionar-poradna-1600.webp', 'Poradňa ANASTASIA', {tone: 'lavender'})}<div class="lan-rows">${items}</div></section>`;
};

const pageIntro = (eyebrow, title, description) => `<div class="page-intro"><p class="eyebrow" data-content="konzultacie__konzultacie-1__0-text">${e(eyebrow)}</p><h1>${e(title)}</h1><p class="lead">${e(description)}</p></div>`;
