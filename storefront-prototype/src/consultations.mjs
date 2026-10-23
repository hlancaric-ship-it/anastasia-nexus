import {api} from './lib/api/index.mjs';
import {escape as e, arrow, button, card} from './components.mjs';

const CONSULTATION_HANDLES = {
  'online-zdravotna-konzultacia': {name: 'Online zdravotná konzultácia', kind: 'online-zdravotna-konzultacia'},
  'supervizia': {name: 'Supervízia', kind: 'supervizia'},
  'astrologia-zdravie-predispozicia': {name: 'Astrologický profil zdravia a vitality', kind: 'astrologia-zdravie-predispozicia'},
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

  const items = consults.map(p => {
    const info = CONSULTATION_HANDLES[p.slug] || {};
    return `
      <article class="consultation-card">
        <a href="/eshop/produkt/${e(p.slug)}" class="consultation-image">
          <img src="${p.image}" alt="${e(p.name)}" width="600" height="740" loading="lazy">
        </a>
        <div class="consultation-content">
          <h3>${e(info.name || p.name)}</h3>
          <p class="consultation-price">${e(p.priceLabel)}</p>
          <p class="consultation-desc">${e(p.description?.slice(0, 150) + (p.description && p.description.length > 150 ? '…' : ''))}</p>
          <a href="/eshop/produkt/${e(p.slug)}" class="text-link">Zobraziť detail ${arrow}</a>
        </div>
      </article>
    `;
  }).join('');

  return `
    <section class="section narrow-wide">
      ${pageIntro('KONZULTÁCIE', 'Vyberte si termín.', 'Online konzultácie, supervízia, astrologický profil a personifikované protokoly.')}
      <div class="consultation-grid">${items}</div>
    </section>
  `;
};

const pageIntro = (eyebrow, title, description) => `<div class="page-intro"><p class="eyebrow" data-content="konzultacie__konzultacie-1__0-text">${e(eyebrow)}</p><h1>${e(title)}</h1><p class="lead">${e(description)}</p></div>`;
