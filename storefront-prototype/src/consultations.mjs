import {api} from './lib/api/index.mjs';
import {escape as e, imageSrc} from './components.mjs';
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
    // Konzultácie sú v kategórii Programy a služby a majú špecifické slugy
    return CONSULTATION_HANDLES[handle];
  });

  if (!consults.length) {
    return `<section class="section"><h2>Konzultácie</h2><p>Načítavam ponuku konzultácií…</p></section>`;
  }

  // DNA úvodu 1:1: panely ako „Čo môžeme“ (zaoblenie 48/48/48/0, striedanie levanduľa · oliva · hmla · zlatá), fotka v oblúku 3:4 (Lucky 26. 10.).
  const items = consults.map((p, i) => {
    const info = CONSULTATION_HANDLES[p.slug] || {};
    const detail = info.page || `/konzultacie/rezervacia?typ=${encodeURIComponent(p.slug)}`;
    const own = /^Podrobnosti a podmienky nájdete/.test(p.description || '') ? '' : (p.description || '');
    const desc = own ? own.slice(0, 200) + (own.length > 200 ? '…' : '') : consultLead(p.slug);
    const img = info.kind === 'astrologia-zdravie-predispozicia' ? '/media/night-sky.jpg' : (info.img || p.image);
    const name = e(info.name || p.name);
    return `<article class="cs-panel cs-panel--${i % 4 + 1}" style="--i:${i}">
        <div class="cs-copy">
          <span class="cs-n">0${i + 1}</span>
          <h2 class="cs-name"><a href="${e(detail)}">${name}</a></h2>
          <p class="cs-meta">${consultMeta(info.kind || p.slug) || `<span>${e(p.priceLabel)}</span>`}</p>
          ${desc ? `<p class="cs-d">${e(desc)}</p>` : ''}
          <a class="cs-go" href="${e(detail)}">Vybrať termín <i aria-hidden="true">→</i></a>
        </div>
        <figure><img src="${imageSrc(img)}" alt="" width="900" height="1200" loading="eager" decoding="async"></figure>
      </article>`;
  }).join('');

  return `<section class="section consult-page cs"><header class="cs-head"><p data-content="konzultacie__konzultacie-1__0-text" hidden>Konzultácie</p><h1 class="cs-h">Vyberte si <em>termín.</em></h1><p class="cs-t">Online konzultácie, supervízia, astrologický profil a personifikované protokoly. Voľné termíny vidíte priamo v kalendári.</p></header><div class="cs-stack">${items}</div></section>`;
};
