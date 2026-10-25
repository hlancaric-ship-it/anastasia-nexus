// Aktuálne položky overené z uloženého výpisu starého obchodu ANASTASIA (14 produktov).
// Ilustračné obrázky sú len náhradou, pokiaľ príslušné originálne fotografie nie sú v deployi.
// Skutočné obrázky a ceny v HTTP režime poskytuje backend; demo ceny zodpovedajú starému výpisu.
// Kategorie podle starého webu (Medusa): AI ANASTASIA ACADEMY (sebarozvoj),
// BIOKOZMETIKA a Zdravé doplnky výživy. filter v URL používá handle.
// Štítky NOVINKA, kódy a poradie přebraté 1:1 ze starého webu (audit/AUDIT-1to1.md).
const NEW_HANDLES=new Set(['vyuka-vedomeho-vnimania','nic-nemusis','online-zdravotna-konzultacia','personalizovany-zdravotny-protokol-pro','Mineralny-ochranny-krem-pre-citlivu-pokozku','astrologia-zdravie-predispozicia']);
const SKUS={
  'supervizia':'KONZ.01','astrologia-zdravie-predispozicia':'NR.01','online-zdravotna-konzultacia':'L005',
  'vyuka-vedomeho-vnimania':'VVV.001','bio-plet-krem':'KO.001','pletova-voda':'KO.002','chripka-prasok':'DO.002',
  'nic-nemusis':'EP.001','bio-sprchovy-gel':'KO.003','antibioticky-prasok':'DO.003','osviezit-plet':'KO.004',
  'personalizovany-zdravotny-protokol-pro':'L004','Mineralny-ochranny-krem-pre-citlivu-pokozku':'K05','reset-40-plus':'EP.002',
};
const LEGACY_RANK={
  'vyuka-vedomeho-vnimania':1,'bio-plet-krem':2,'pletova-voda':3,'chripka-prasok':4,'nic-nemusis':5,
  'bio-sprchovy-gel':6,'antibioticky-prasok':7,'online-zdravotna-konzultacia':8,'osviezit-plet':9,
  'personalizovany-zdravotny-protokol-pro':10,'Mineralny-ochranny-krem-pre-citlivu-pokozku':11,
  'reset-40-plus':12,'supervizia':13,'astrologia-zdravie-predispozicia':14,
};
const BEST_HANDLES=new Set(['vyuka-vedomeho-vnimania','bio-plet-krem','reset-40-plus','supervizia','chripka-prasok']);
export const SHOP_CATEGORIES=Object.freeze(['AI ANASTASIA ACADEMY','BIOKOZMETIKA','Zdravé doplnky výživy','Konzultácie']);
export const SHOP_CATEGORY_HANDLES=Object.freeze({
  'AI ANASTASIA ACADEMY':'sebarozvoj',
  'BIOKOZMETIKA':'bio-kozmetika-bez-chemie',
  'Zdravé doplnky výživy':'zdrave-doplnky-vyzivy',
  'Konzultácie':'konzultacie',
  'Darčekové poukazy':'darcekove-poukazy',
});
// Darčekový poukaz je v jadre jeden produkt s hodnotami. V obchode je každá hodnota samostatný produkt.
export const VOUCHER_CATEGORY='Darčekové poukazy';
export const VOUCHER_CATEGORY_HANDLE='darcekove-poukazy';
export const VOUCHER_SLUG_PREFIX='darcekovy-poukaz-';
export const voucherAmountFromSlug=slug=>{const m=/^darcekovy-poukaz-(\d{1,5})$/.exec(String(slug||''));return m?Number(m[1]):null;};
export const voucherSlug=amount=>VOUCHER_SLUG_PREFIX+Math.round(Number(amount));
export const VOUCHER_IMAGE='/img/eshop/vouchery.webp';
export const FEATURED_SLUGS=Object.freeze(['osviezit-plet','pletova-voda','chripka-prasok','online-zdravotna-konzultacia']);
export const SHOP_CATALOG=Object.freeze([
  {slug:"reset-40-plus",name:"AI ANASTASIA RESET 40+",category:"AI ANASTASIA ACADEMY",categoryHandle:"sebarozvoj",priceLabel:"168,00 €",art:"sun",image:"/assets/lucia-longevity.png"},
  {slug:"astrologia-zdravie-predispozicia",name:"Astrologický profil zdravia a osobných predispozícií",category:"AI ANASTASIA ACADEMY",categoryHandle:"sebarozvoj",priceLabel:"59,00 €",art:"sun",image:"/assets/night-sky.jpg"},
  {slug:"chripka-prasok",name:"CHRÍPKOVÝ PRÁŠOK",category:"Zdravé doplnky výživy",categoryHandle:"zdrave-doplnky-vyzivy",priceLabel:"9,00 €",art:"jar",image:"/assets/product-placeholder.svg"},
  {slug:"antibioticky-prasok",name:"JANČOVA antibiotická zmes",category:"Zdravé doplnky výživy",categoryHandle:"zdrave-doplnky-vyzivy",priceLabel:"9,00 €",art:"jar",image:"/assets/product-placeholder.svg"},
  {slug:"Mineralny-ochranny-krem-pre-citlivu-pokozku",name:"MINERAL PROTECT 200ml",category:"BIOKOZMETIKA",categoryHandle:"bio-kozmetika-bez-chemie",priceLabel:"38,00 €",art:"bottle",image:"/assets/product-placeholder.svg"},
  {slug:"nic-nemusis",name:"Nič nemusíš",category:"AI ANASTASIA ACADEMY",categoryHandle:"sebarozvoj",priceLabel:"38,00 €",art:"sun",image:"/assets/zdravy-svet-luka.jpg"},
  {slug:"online-zdravotna-konzultacia",name:"Online zdravotná konzultácia",category:"AI ANASTASIA ACADEMY",categoryHandle:"sebarozvoj",priceLabel:"69,00 €",art:"sun",image:"/assets/lucia-portrait.jpg"},
  {slug:"personalizovany-zdravotny-protokol-pro",name:"Personifikovaný zdravotný protokol",category:"AI ANASTASIA ACADEMY",categoryHandle:"sebarozvoj",priceLabel:"59,00 €",art:"sun",image:"/assets/brand-seal.svg"},
  {slug:"supervizia",name:"Supervízia",category:"AI ANASTASIA ACADEMY",categoryHandle:"sebarozvoj",priceLabel:"69,00 €",art:"sun",image:"/assets/lucia-portrait.jpg"},
  {slug:"bio-plet-krem",name:"Tvoj pleťový krém",category:"BIOKOZMETIKA",categoryHandle:"bio-kozmetika-bez-chemie",priceLabel:"77,00 €",art:"jar",image:"/assets/product-placeholder.svg"},
  {slug:"bio-sprchovy-gel",name:"Tvoj sprcháč",category:"BIOKOZMETIKA",categoryHandle:"bio-kozmetika-bez-chemie",priceLabel:"11,00 €",art:"bottle",image:"/assets/p-gel.png"},
  {slug:"pletova-voda",name:"Tvoja pleťová voda",category:"BIOKOZMETIKA",categoryHandle:"bio-kozmetika-bez-chemie",priceLabel:"11,00 €",art:"bottle",image:"/assets/p-maslo.png"},
  {slug:"osviezit-plet",name:"Tvoja pleťová voda osviežujúca",category:"BIOKOZMETIKA",categoryHandle:"bio-kozmetika-bez-chemie",priceLabel:"11,00 €",art:"bottle",image:"/assets/p-gel.png"},
  {slug:"vyuka-vedomeho-vnimania",name:"Výuka vedomého vnímania",category:"AI ANASTASIA ACADEMY",categoryHandle:"sebarozvoj",priceLabel:"2 600,00 €",art:"sun",image:"/assets/zdravy-svet-luka.jpg"},
].map((p,i)=>Object.freeze({...p,code:p.slug,sku:SKUS[p.slug]||p.slug,description:'Podrobnosti a podmienky nájdete v detaile produktu.',availability:'Skladom',isNew:NEW_HANDLES.has(p.slug),isBestseller:BEST_HANDLES.has(p.slug),legacyRank:LEGACY_RANK[p.slug]||99})).sort((a,b)=>a.legacyRank-b.legacyRank));
export const SHOP_HANDLES=new Set(SHOP_CATALOG.map(p=>p.slug));
export const SHOP_BY_HANDLE=new Map(SHOP_CATALOG.map(p=>[p.slug,p]));
