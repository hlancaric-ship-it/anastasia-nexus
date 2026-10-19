import {escape as e} from './components.mjs';

const icons={
  'Kozmetika':'<path d="M7 14h10v7H7zM10 14V8h4v6M10 8V4h4v4M19 5c0 3-3 4-3 4s-3-1-3-4"/>',
  'Bylinky a výživa':'<path d="M12 22V3M12 8C7 8 5 5 5 3c5 0 7 3 7 5Zm0 6c-5 0-7-3-7-5 5 0 7 3 7 5Zm0-6c5 0 7-3 7-5-5 0-7 3-7 5Zm0 6c5 0 7-3 7-5-5 0-7 3-7 5Z"/>',
  'Domov':'<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>',
  'Ľan':'<path d="m4 6 8-3 8 3v14H4ZM4 6l8 3 8-3M12 9v11M8 11v6M16 11v6"/>',
  'Programy a služby':'<path d="M3 17h4l3 3h5l6-6a2 2 0 0 0-3-2l-4 3M7 17v-5h6a2 2 0 0 1 0 4h-3M12 8c-4 0-6-2-6-5 4 0 6 2 6 5Zm0 0c4 0 6-2 6-5-4 0-6 2-6 5ZM12 8v3"/>',
  'Programy':'<path d="M12 5v16M12 6c-3-3-7-3-10-2v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-1-10 2Z"/>',
};
const artwork={'Kozmetika':'product-bottle.svg','Bylinky a výživa':'product-coffee.svg','Domov':'product-candle.svg','Ľan':'product-linen.svg','Programy a služby':'night-sky.jpg','Programy':'hero-forest.jpg'};
const fallback='<circle cx="7" cy="7" r="3"/><circle cx="17" cy="7" r="3"/><circle cx="7" cy="17" r="3"/><circle cx="17" cy="17" r="3"/>';

export function catalogNavigation(categories,current=''){
  return `<nav class="catalog-navigation" aria-label="Vybrať kategóriu">${categories.map(category=>`<a class="catalog-nav-tile" href="/eshop?category=${encodeURIComponent(category)}" data-catalog-category="${e(category)}" ${category===current?'aria-current="page"':''}><img class="catalog-nav-art" src="/assets/${artwork[category]||'hero-forest.jpg'}" alt="" width="400" height="400"><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${icons[category]||fallback}</svg><span>${e(category)}</span></a>`).join('')}</nav>`;
}
