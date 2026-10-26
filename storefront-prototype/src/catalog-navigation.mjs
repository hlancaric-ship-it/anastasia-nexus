import {escape as e} from './components.mjs';
import {SHOP_CATEGORY_HANDLES, shopCategoryName} from './lib/api/catalog.mjs';
const handleOf=c=>SHOP_CATEGORY_HANDLES[c]||c;

const icons={
  'Darčekové poukazy':'<path d="M3 9h18v12H3zM3 9V6h18v3M12 6v15M12 6c-2-3-6-3-6 0h6Zm0 0c2-3 6-3 6 0h-6Z"/>',
  'Biokozmetika':'<path d="M7 14h10v7H7zM10 14V8h4v6M10 8V4h4v4M19 5c0 3-3 4-3 4s-3-1-3-4"/>',
  'Programy a služby':'<path d="M12 5v16M12 6c-3-3-7-3-10-2v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-1-10 2Z"/>',
  'Zdravé doplnky výživy':'<path d="M12 22V3M12 8C7 8 5 5 5 3c5 0 7 3 7 5Zm0 6c-5 0-7-3-7-5 5 0 7 3 7 5Z"/>',
  'Kozmetika':'<path d="M7 14h10v7H7zM10 14V8h4v6M10 8V4h4v4M19 5c0 3-3 4-3 4s-3-1-3-4"/>',
  'Bylinky a výživa':'<path d="M12 22V3M12 8C7 8 5 5 5 3c5 0 7 3 7 5Zm0 6c-5 0-7-3-7-5 5 0 7 3 7 5Zm0-6c5 0 7-3 7-5-5 0-7 3-7 5Zm0 6c5 0 7-3 7-5-5 0-7 3-7 5Z"/>',
  'Domov':'<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>',
  'Ľan':'<path d="m4 6 8-3 8 3v14H4ZM4 6l8 3 8-3M12 9v11M8 11v6M16 11v6"/>',
  'Programy':'<path d="M12 5v16M12 6c-3-3-7-3-10-2v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-1-10 2Z"/>',
};
// r12/9: symboly dlaždíc príjdú z Figma návrhu ako SVG (public/assets/symbols/).
// Kým nie sú v repu, dlaždice ostane bez obrázka – len s názvom.
const iconPath=category=>icons[category]||icons[shopCategoryName(category)]||icons['Bylinky a výživa'];
export const symbolFor=category=>`<svg class="catalog-nav-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPath(category)}</svg>`;

const TILES=[['Programy a služby','Programy a služby','/eshop?category=sebarozvoj'],['Biokozmetika','Biokozmetika','/eshop?category=bio-kozmetika-bez-chemie'],['Zdravé doplnky výživy','Zdravé doplnky výživy','/eshop?category=zdrave-doplnky-vyzivy'],['Darčekové poukazy','Darčekové poukazy','/eshop?category=darcekove-poukazy']];

export function catalogNavigation(categories,current=''){
  const known=TILES.filter(([key])=>key==='Darčekové poukazy'||categories.includes(key));
  const rest=categories.filter(category=>!known.some(([key])=>key===category));
  const tile=([key,label,href])=>`<a class="catalog-nav-tile" href="${href}" data-catalog-category="${e(key)}" ${handleOf(key)===current?'aria-current="page"':''}>${symbolFor(key)}<span>${e(label)}</span></a>`;
  return `<nav class="catalog-navigation" id="catalog-navigation" aria-label="Vybrať kategóriu">${known.map(tile).join('')}${rest.map(category=>`<a class="catalog-nav-tile" href="/eshop?category=${encodeURIComponent(handleOf(category))}" data-catalog-category="${e(category)}" ${handleOf(category)===current?'aria-current="page"':''}><span>${e(category)}</span></a>`).join('')}</nav>`;
}
