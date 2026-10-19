// Aktuálne položky overené z uloženého výpisu starého obchodu ANASTASIA (14 produktov).
// Ilustračné obrázky sú len náhradou, pokiaľ príslušné originálne fotografie nie sú v deployi.
// Skutočné obrázky a ceny v HTTP režime poskytuje backend; demo ceny zodpovedajú starému výpisu.
export const SHOP_CATEGORIES=Object.freeze(['Kozmetika','Bylinky a výživa','Programy a služby']);
export const FEATURED_SLUGS=Object.freeze(['osviezit-plet','pletova-voda','chripka-prasok','online-zdravotna-konzultacia']);
export const SHOP_CATALOG=Object.freeze([
  {slug:"reset-40-plus",name:"AI ANASTASIA RESET 40+",category:"Programy a služby",priceLabel:"168,00 €",art:"sun",image:"/assets/lucia-longevity.png"},
  {slug:"astrologia-zdravie-predispozicia",name:"Astrologický profil zdravia a osobných predispozícií",category:"Programy a služby",priceLabel:"59,00 €",art:"sun",image:"/assets/night-sky.jpg"},
  {slug:"chripka-prasok",name:"CHRÍPKOVÝ PRÁŠOK",category:"Bylinky a výživa",priceLabel:"9,00 €",art:"jar",image:"/assets/product-jar.svg"},
  {slug:"antibioticky-prasok",name:"JANČOVA antibiotická zmes",category:"Bylinky a výživa",priceLabel:"9,00 €",art:"jar",image:"/assets/product-jar.svg"},
  {slug:"Mineralny-ochranny-krem-pre-citlivu-pokozku",name:"MINERAL PROTECT 200ml",category:"Kozmetika",priceLabel:"38,00 €",art:"bottle",image:"/assets/product-bottle.svg"},
  {slug:"nic-nemusis",name:"Nič nemusíš",category:"Programy a služby",priceLabel:"38,00 €",art:"sun",image:"/assets/zdravy-svet-luka.jpg"},
  {slug:"online-zdravotna-konzultacia",name:"Online zdravotná konzultácia",category:"Programy a služby",priceLabel:"69,00 €",art:"sun",image:"/assets/lucia-portrait.jpg"},
  {slug:"personalizovany-zdravotny-protokol-pro",name:"Personifikovaný zdravotný protokol",category:"Programy a služby",priceLabel:"59,00 €",art:"sun",image:"/assets/lucia-logo.png"},
  {slug:"supervizia",name:"Supervízia",category:"Programy a služby",priceLabel:"69,00 €",art:"sun",image:"/assets/lucia-portrait.jpg"},
  {slug:"bio-plet-krem",name:"Tvoj pleťový krém",category:"Kozmetika",priceLabel:"77,00 €",art:"jar",image:"/assets/product-jar.svg"},
  {slug:"bio-sprchovy-gel",name:"Tvoj sprcháč",category:"Kozmetika",priceLabel:"11,00 €",art:"bottle",image:"/assets/p-gel.png"},
  {slug:"pletova-voda",name:"Tvoja pleťová voda",category:"Kozmetika",priceLabel:"11,00 €",art:"bottle",image:"/assets/p-maslo.png"},
  {slug:"osviezit-plet",name:"Tvoja pleťová voda osviežujúca",category:"Kozmetika",priceLabel:"11,00 €",art:"bottle",image:"/assets/p-gel.png"},
  {slug:"vyuka-vedomeho-vnimania",name:"Výuka vedomého vnímania",category:"Programy a služby",priceLabel:"2 600,00 €",art:"sun",image:"/assets/zdravy-svet-luka.jpg"},
].map((p,i)=>Object.freeze({...p,code:p.slug,description:'Podrobnosti a podmienky nájdete v detaile produktu.',availability:'Informácie v detaile',isNew:false,isBestseller:false})));
export const SHOP_HANDLES=new Set(SHOP_CATALOG.map(p=>p.slug));
export const SHOP_BY_HANDLE=new Map(SHOP_CATALOG.map(p=>[p.slug,p]));
