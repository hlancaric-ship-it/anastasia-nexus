import {escape as e} from './components.mjs';
import {SHOP_CATEGORY_HANDLES} from './lib/api/catalog.mjs';
const handleOf=c=>SHOP_CATEGORY_HANDLES[c]||c;

const TILES=[['AI ANASTASIA ACADEMY','AI ANASTASIA Academy','/eshop?category=sebarozvoj'],['BIOKOZMETIKA','Biokozmetika','/eshop?category=bio-kozmetika-bez-chemie'],['Zdravé doplnky výživy','Zdravé doplnky výživy','/eshop?category=zdrave-doplnky-vyzivy'],['Darčekový poukaz','Darčekový poukaz','/darcekovy-poukaz']];

export function catalogNavigation(categories,current=''){
  const known=TILES.filter(([key])=>key==='Darčekový poukaz'||categories.includes(key));
  const rest=categories.filter(category=>!known.some(([key])=>key===category));
  const all=[...known.map(([key,label,href])=>({key,label,href})),...rest.map(category=>({key:category,label:category,href:`/eshop?category=${encodeURIComponent(handleOf(category))}`}))];
  const links=all.map(({key,label,href},index)=>`<a class="catalog-nav-tile" href="${href}" data-catalog-category="${e(key)}" ${handleOf(key)===current?'aria-current="page"':''}><span class="catalog-nav-index">0${index+1}</span><span class="catalog-nav-label">${e(label)}</span><span class="catalog-nav-arrow" aria-hidden="true">↗</span></a>`).join('');
  return `<div class="catalog-browse"><p class="eyebrow">OBJAVTE PODĽA KATEGÓRIE</p><nav class="catalog-navigation" aria-label="Vybrať kategóriu">${links}</nav></div>`;
}
