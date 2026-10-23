import {escape as e} from './components.mjs';
import {SHOP_CATEGORY_HANDLES} from './lib/api/catalog.mjs';
const handleOf=c=>SHOP_CATEGORY_HANDLES[c]||c;

const icons={
  'BIOKOZMETIKA':'<path d="M7 14h10v7H7zM10 14V8h4v6M10 8V4h4v4M19 5c0 3-3 4-3 4s-3-1-3-4"/>',
  'AI ANASTASIA ACADEMY':'<path d="M12 5v16M12 6c-3-3-7-3-10-2v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-1-10 2Z"/>',
  'Zdravé doplnky výživy':'<path d="M12 22V3M12 8C7 8 5 5 5 3c5 0 7 3 7 5Zm0 6c-5 0-7-3-7-5 5 0 7 3 7 5Z"/>',
  'Kozmetika':'<path d="M7 14h10v7H7zM10 14V8h4v6M10 8V4h4v4M19 5c0 3-3 4-3 4s-3-1-3-4"/>',
  'Bylinky a výživa':'<path d="M12 22V3M12 8C7 8 5 5 5 3c5 0 7 3 7 5Zm0 6c-5 0-7-3-7-5 5 0 7 3 7 5Zm0-6c5 0 7-3 7-5-5 0-7 3-7 5Zm0 6c5 0 7-3 7-5-5 0-7 3-7 5Z"/>',
  'Domov':'<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>',
  'Ľan':'<path d="m4 6 8-3 8 3v14H4ZM4 6l8 3 8-3M12 9v11M8 11v6M16 11v6"/>',
  'Programy a služby':'<path d="M3 17h4l3 3h5l6-6a2 2 0 0 0-3-2l-4 3M7 17v-5h6a2 2 0 0 1 0 4h-3M12 8c-4 0-6-2-6-5 4 0 6 2 6 5Zm0 0c4 0 6-2 6-5-4 0-6 2-6 5ZM12 8v3"/>',
  'Programy':'<path d="M12 5v16M12 6c-3-3-7-3-10-2v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-1-10 2Z"/>',
};
// r12/9: symboly dlaždíc príjdú z Figma návrhu ako SVG (public/assets/symbols/).
// Kým nie sú v repu, dlaždice ostane bez obrázka – len s názvom.
const iconPath=category=>icons[category]||icons[category.toUpperCase()]||icons[category==='Biokozmetika'?'BIOKOZMETIKA':'']||icons['Bylinky a výživa'];
export const symbolFor=category=>`<svg class="catalog-nav-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${iconPath(category)}"/></svg>`;

const TILES=[['AI ANASTASIA ACADEMY','Programy a služby','/eshop?category=sebarozvoj'],['BIOKOZMETIKA','Biokozmetika','/eshop?category=bio-kozmetika-bez-chemie'],['Zdravé doplnky výživy','Zdravé doplnky výživy','/eshop?category=zdrave-doplnky-vyzivy'],['Darčekový poukaz','Darčekový poukaz','/darcekovy-poukaz']];

export function catalogNavigation(categories,current=''){
  const known=TILES.filter(([key])=>key==='Darčekový poukaz'||categories.includes(key));
  const rest=categories.filter(category=>!known.some(([key])=>key===category));
  const tile=([key,label,href])=>`<a class="catalog-nav-tile" href="${href}" data-catalog-category="${e(key)}" ${handleOf(key)===current?'aria-current="page"':''}>${symbolFor(key)}<span>${e(label)}</span></a>`;
  return `<nav class="catalog-navigation" id="catalog-navigation" aria-label="Vybrať kategóriu">${known.map(tile).join('')}${rest.map(category=>`<a class="catalog-nav-tile" href="/eshop?category=${encodeURIComponent(handleOf(category))}" data-catalog-category="${e(category)}" ${handleOf(category)===current?'aria-current="page"':''}><span>${e(category)}</span></a>`).join('')}</nav>`;
}
