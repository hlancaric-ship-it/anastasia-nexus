import {api} from './lib/api/index.mjs';
import {escape as e, arrow, button, splitHero, sentenceCase} from './components.mjs';
import {consultMeta, consultLead} from './consult-info.mjs';

const CONSULTATION_HANDLES = {
  'online-zdravotna-konzultacia': {name: 'Online zdravotná konzultácia', kind: 'online-zdravotna-konzultacia', page: '/konzultacie/online-zdravotna-konzultacia', img: '/img/lucia/lucia-portret-1600.webp'},
  'supervizia': {name: 'Supervízia', kind: 'supervizia', page: '/konzultacie/supervizia', img: '/img/lucia/stacionar-kresla-1600.webp'},
  'astrologia-zdravie-predispozicia': {name: 'Astrologický profil zdravia a vitality', kind: 'astrologia-zdravie-predispozicia', page: '/konzultacie/astrologicky-profil-zdravia-a-vitality'},
  'personalizovany-zdravotny-protokol-pro': {name: 'Personifikovaný zdravotný protokol', kind: 'personalizovany-zdravotny-protokol-pro', img: '/img/lucia/lekaren-1600.webp'},
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

  // Sklenené karty na krémovom podklade, žiadne celoplošné pásy. Kalendár je na podstránke každej konzultácie.
  const items = consults.map((p, i) => {
    const info = CONSULTATION_HANDLES[p.slug] || {};
    const detail = info.page || `/konzultacie/rezervacia?typ=${encodeURIComponent(p.slug)}`;
    const own = /^Podrobnosti a podmienky nájdete/.test(p.description || '') ? '' : (p.description || '');
    const desc = own ? own.slice(0, 200) + (own.length > 200 ? '…' : '') : consultLead(p.slug);
    const img = info.kind === 'astrologia-zdravie-predispozicia' ? '/media/night-sky.jpg' : (info.img || p.image);
    return `<article class="cv2-card cv2-offer">
        <a href="${e(detail)}" class="cv2-offer__photo" tabindex="-1" aria-hidden="true"><img src="${e(img)}" alt="" width="900" height="600" loading="lazy" decoding="async"></a>
        <p class="eyebrow">0${i + 1} · Konzultácia</p>
        <h2>${e(info.name || p.name)}</h2>
        <div class="cv2-meta">${consultMeta(info.kind || p.slug) || `<span>${e(p.priceLabel)}</span>`}</div>
        ${desc ? `<p class="cv2-offer__desc">${e(desc)}</p>` : ''}
        <div class="cv2-offer__actions">${button(detail, 'Vybrať termín')}</div>
      </article>`;
  }).join('');

  return `<section class="section consult-page cv2 cv2-list"><div class="cv2-card cv2-intro cv2-intro--list">${pageIntro('KONZULTÁCIE', 'Vyberte si termín.', 'Online konzultácie, supervízia, astrologický profil a personifikované protokoly. Voľné termíny vidíte priamo v kalendári.')}</div><div class="cv2-offers">${items}</div></section>`;
};

const pageIntro = (eyebrow, title, description) => `<div class="page-intro"><p class="eyebrow" data-content="konzultacie__konzultacie-1__0-text">${e(sentenceCase(eyebrow))}</p><h1>${e(title)}</h1><p class="lead">${e(description)}</p></div>`;
