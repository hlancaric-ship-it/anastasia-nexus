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

  // Autorská kompozícia: sklenená karta s asymetrickým zaoblením, fotka v organickej maske prelínajúca sa do krému, číslo ako zlatý vodoznak.
  const items = consults.map((p, i) => {
    const info = CONSULTATION_HANDLES[p.slug] || {};
    const detail = info.page || `/konzultacie/rezervacia?typ=${encodeURIComponent(p.slug)}`;
    const own = /^Podrobnosti a podmienky nájdete/.test(p.description || '') ? '' : (p.description || '');
    const desc = own ? own.slice(0, 200) + (own.length > 200 ? '…' : '') : consultLead(p.slug);
    const img = info.kind === 'astrologia-zdravie-predispozicia' ? '/media/night-sky.jpg' : (info.img || p.image);
    const name = info.name || p.name;
    return `<article class="cv3-item${i % 2 ? ' cv3-item--flip' : ''}">
        <span class="cv3-num" aria-hidden="true">0${i + 1}</span>
        <a href="${e(detail)}" class="cv3-visual" tabindex="-1" aria-hidden="true"><img src="${e(img)}" alt="" width="900" height="900" loading="eager" decoding="async"></a>
        <div class="cv3-body">
          <p class="cv3-kicker">Konzultácia</p>
          <h2><a href="${e(detail)}">${e(name)}</a></h2>
          <p class="cv3-meta">${consultMeta(info.kind || p.slug) || `<span>${e(p.priceLabel)}</span>`}</p>
          ${desc ? `<p class="cv3-desc">${e(desc)}</p>` : ''}
          <div class="cv3-actions">${button(detail, 'Vybrať termín')}</div>
        </div>
      </article>`;
  }).join('');

  return `<section class="section consult-page cv3"><header class="cv3-intro">${pageIntro('KONZULTÁCIE', 'Vyberte si termín.', 'Online konzultácie, supervízia, astrologický profil a personifikované protokoly. Voľné termíny vidíte priamo v kalendári.')}</header><div class="cv3-list">${items}</div></section>`;
};

const pageIntro = (eyebrow, title, description) => `<div class="page-intro"><p class="eyebrow" data-content="konzultacie__konzultacie-1__0-text">${e(sentenceCase(eyebrow))}</p><h1>${e(title)}</h1><p class="lead">${e(description)}</p></div>`;
