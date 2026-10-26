import {SHOP_CATEGORIES, SHOP_CATEGORY_HANDLES} from './api/catalog.mjs';
// Jeden seznam pro horní i boční menu. Kategorie odpovídají současnému katalogu.
export const menuGroups = [
  {title:'Obchod', href:'/eshop', links:[...SHOP_CATEGORIES.filter(name=>name!=='Konzultácie').map(name=>[name,'/eshop?category='+encodeURIComponent(SHOP_CATEGORY_HANDLES[name]||name)]), ['Darčekové poukazy','/eshop?category=darcekove-poukazy']]},
  {title:'Služby a miesta', href:'/konzultacie', links:[['Konzultácie','/konzultacie'], ['Zdravá lekáreň','/zdrava-lekaren'], ['Denný stacionár Vyšná Slaná','/denny-stacionar-vysna-slana']]},
  {title:'Svet ANASTASIA', href:'/zdravy-svet', links:[['Zdravý svet','/zdravy-svet'], ['O Lucii','/o-lucii'], ['Recenzie zákazníkov','/ai-anastasia/recenzie-zakaznikov'], ['AI ANASTASIA','https://www.aianastasia.com/'], ['ANASTASIA Academy','https://www.anastasia.academy/']]},
];
