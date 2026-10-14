const PHOTOS={'DEMO-GEL':'/assets/p-gel.png','DEMO-KAVA':'/assets/p-kava.png','DEMO-MASLO':'/assets/p-maslo.png','DEMO-SVIECKY':'/assets/p-svieca.png'};
const products = [
  ['bio-sprchovy-gel','Bio sprchový gél','Kozmetika','DEMO-GEL','18,00 €','bottle','Jemný každodenný rituál. Priestor pre zloženie a overený popis produktu.'],
  ['kava-zdrava','Káva zdravá','Výživa','DEMO-KAVA','24,00 €','coffee','Chvíľa pre seba. Priestor pre pôvod, zloženie a spôsob prípravy.'],
  ['telove-maslo','Telové maslo','Kozmetika','DEMO-MASLO','26,00 €','jar','Starostlivosť o pokožku. Priestor pre zloženie a odporúčané použitie.'],
  ['ritualne-sviecky-voskove','Rituálne sviečky','Domov','DEMO-SVIECKY','22,00 €','candle','Svetlo pre pokojné večery. Priestor pre materiál a bezpečné používanie.'],
  ['pletova-voda','Pleťová voda','Kozmetika','DEMO-VODA','16,00 €','bottle','Priestor pre popis pleťovej vody a jej zloženia.'],
  ['lanova-sukna','Ľanová sukňa','Ľan','DEMO-SUKNA','68,00 €','linen','Priestor pre materiál, miery a starostlivosť o ľan.'],
  ['saty-lanove','Ľanové šaty','Ľan','DEMO-SATY','98,00 €','linen','Priestor pre strih, veľkosti a starostlivosť.'],
  ['astrologia','Astrológia','Služby','DEMO-ASTRO','Cena sa doplní','sun','Priestor pre rozsah služby, podklady a spôsob doručenia.'],
  ['supervizia','Supervízia','Služby','DEMO-SUPER','Cena sa doplní','sun','Priestor pre odborný rozsah supervízie a podmienky.'],
  ['reset-40','RESET 40+','Programy','DEMO-RESET','168,00 €','sun','16 tematických týždňov. Jednorazový program s vlastnou knižnicou.'],
  ['astrologia-zdravie-predispozicia','Astrológia — zdravie a predispozícia','Služby','DEMO-PROFIL','Cena sa doplní','sun','Priestor pre schválený obsah astrologického profilu.'],
  ['vydymovanie-zmes','Vydymovanie — zmes','Domov','DEMO-ZMES','Cena sa doplní','jar','Priestor pre zloženie a návod.'],
  ['vyuka-vedomeho-vnimania','Výuka vedomého vnímania','Programy','DEMO-VYUKA','Cena sa doplní','sun','Priestor pre osnovu a podmienky vzdelávania.'],
  ['antibioticky-prasok','Antibiotický prášok','Výživa','DEMO-PRASOK','Cena sa doplní','jar','Historický názov. Zloženie a schválený produktový text sa doplnia.'],
  ['chripka-prasok','Chrípka — prášok','Výživa','DEMO-CHRIPKA','Cena sa doplní','jar','Historický názov. Zloženie a schválený produktový text sa doplnia.'],
  ['bio-plet-krem','Bio pleťový krém','Kozmetika','DEMO-KREM','Cena sa doplní','jar','Priestor pre zloženie a schválený produktový text.'],
].map(([slug,name,category,code,priceLabel,art,description], index) => ({ slug,name,category,code,priceLabel,art,description,availability:'Ukážkový produkt',isNew:index<3,isBestseller:index<4,image:PHOTOS[code]||`/assets/product-${art}.svg` }));

const pages = [
  ['/o-lucii','O Lucii','Človek za príbehom.','Priestor pre osobný príbeh, odborné skúsenosti a prístup Lucie.','about'],
  ['/zdravy-svet','Zdravý svet','Všímať si. Rozumieť. Žiť.','Priestor pre články, poznanie a každodenné inšpirácie.','journal'],
  ['/konzultacie','Konzultácie','Priestor pre vaše otázky.','Osobný rozhovor, pozorné počúvanie a individuálny prístup. Rozsah služieb sa doplní podľa schváleného obsahu.','services'],
  ['/konzultacie/astrologicky-profil-zdravia-a-vitality','Astrologický profil zdravia a vitality','Spoznávať vlastné súvislosti.','Priestor pre odborný popis služby, potrebné podklady, priebeh a spôsob odovzdania profilu.','service'],
  ['/konzultacie/online-zdravotna-konzultacia','Online zdravotná konzultácia','Rozhovor, nech ste kdekoľvek.','Priestor pre rozsah konzultácie, prípravu a podmienky. Konkrétny termín sa v tejto ukážke nerezervuje.','service'],
  ['/konzultacie/astrologia','Astrológia','Nový pohľad na súvislosti.','Priestor pre odborný obsah astrologickej konzultácie.','service'],
  ['/konzultacie/supervizia','Supervízia','Odborný priestor pre reflexiu.','Priestor pre ciele supervízie, jej priebeh a odborné zameranie.','service'],
  ['/astrologia','Astrológia','Vlastná cesta. Širší pohľad.','Priestor pre odborné texty, prístup a informácie k astrologickému profilu.','service'],
  ['/programy','Programy','Zmena má svoj vlastný rytmus.','Vzdelávanie a priestor pre osobnú cestu.','programs'],
  ['/programy/pre-firmy','Pre firmy','Spoločný priestor pre rozvoj.','Priestor pre schválenú ponuku firemných programov.','service'],
  ['/programy/individualne','Individuálne programy','Vaše tempo. Vaša cesta.','Priestor pre schválenú ponuku individuálnych programov.','service'],
  ['/pre-odbornikov','Pre odborníkov','Poznanie, ktoré sa zdieľa.','Priestor pre odborný obsah a ponuku supervízie.','service'],
  ['/vyuka','Výuka','Učiť sa vnímať.','Priestor pre vzdelávací obsah pôvodného webu.','programs'],
  ['/blog/zdrava-lekaren-aktuality','Zdravá lekáreň — aktuality','Poznanie pre každý deň.','Priestor pre pôvodné články a redakčne schválený obsah.','journal'],
  ['/ai-anastasia/recenzie-farmaceutickych-produktov','Recenzie farmaceutických produktov','Priestor pre odborný pohľad.','Archívna obsahová adresa. Texty recenzií sa doplnia po schválení.','journal'],
  ['/ai-anastasia','AI ANASTASIA','Nová kapitola. Už čoskoro.','Asistent sa pripravuje vo fáze 2. V tejto ukážke ešte nie je dostupný.','future'],
].map(([path,title,headline,intro,kind])=>({path,title,headline,intro,kind}));

const aliases = {
  '/online-zdravotna-konzultacia':'/konzultacie/online-zdravotna-konzultacia',
  '/eshop/produkt/ritualne-sviecky':'/eshop/produkt/ritualne-sviecky-voskove',
};
const clone = value => structuredClone(value);
const memoryStorage = () => { const values = new Map(); return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}; };
const KEY='anastasia.skeleton.v1';
const canonical = path => { const normalized=path.replace(/\/+$/,'')||'/'; return aliases[normalized]||normalized; };

export function createMockApi(storage=memoryStorage()) {
  let state={lines:[],coupon:'',qrKeys:[]};
  try { const stored=JSON.parse(storage.getItem(KEY)); if(stored && Array.isArray(stored.lines)) state={lines:stored.lines.filter(l=>products.some(p=>p.slug===l.slug)&&Number.isInteger(l.quantity)&&l.quantity>0&&l.quantity<=99),coupon:stored.coupon==='DEMO10'?'DEMO10':'',qrKeys:Array.isArray(stored.qrKeys)?stored.qrKeys.filter(v=>typeof v==='string').slice(-50):[]}; } catch { /* An unavailable storage must not break the preview. */ }
  const persist=()=>{try{storage.setItem(KEY,JSON.stringify(state));}catch{/* In-memory preview still works. */}};
  const productByCode=code=>products.find(p=>p.code===code||p.slug===code);
  const cart=()=>({mode:'mock',lines:state.lines.map(line=>({...clone(products.find(p=>p.slug===line.slug)),quantity:line.quantity})),coupon:state.coupon,subtotalLabel:'Ukážka — bez vyúčtovania',discountLabel:state.coupon?'DEMO10 prijatý v ukážke':'Kupón nezadaný',totalLabel:'Platba nie je aktívna'});
  const add=(code,quantity=1)=>{
    const product=productByCode(code);
    if(!product)return {ok:false,message:'Kód produktu sa v ukážkovom katalógu nenašiel. Pôvodný odkaz je zachovaný; produkt vyžaduje mapovanie pri napojení.'};
    if(!Number.isInteger(quantity)||quantity<1||quantity>99)return{ok:false,message:'Zadajte celé množstvo od 1 do 99.'};
    const line=state.lines.find(l=>l.slug===product.slug);
    if(line && line.quantity+quantity>99)return{ok:false,message:'Najviac 99 kusov jednej položky v ukážke.'};
    if(line)line.quantity+=quantity;else state.lines.push({slug:product.slug,quantity});
    persist();return{ok:true,message:'Produkt pridaný do ukážkového košíka.',cart:cart()};
  };
  const coupon=code=>{const valid=code.trim().toUpperCase()==='DEMO10';if(valid){state.coupon='DEMO10';persist();}return{ok:valid,message:valid?'Ukážkový kupón prijatý. Skutočnú zľavu určí server po napojení.':'Kupón nie je v ukážke dostupný. Na otestovanie použite DEMO10.'};};
  return {
    mode:'mock', canonical,
    getProducts:({category='',search='',filter=''}={})=>clone(products.filter(p=>(!category||p.category===category)&&(!search||p.name.toLocaleLowerCase('sk').includes(search.toLocaleLowerCase('sk')))&&(!filter||(filter==='novinky'?p.isNew:filter==='bestsellery'?p.isBestseller:true)))),
    getProduct:slug=>clone(products.find(p=>p.slug===slug)||null),
    getCategories:()=>[...new Set(products.map(p=>p.category))],
    getPages:()=>clone(pages),getPage:path=>clone(pages.find(p=>p.path===canonical(path))||null),getAliases:()=>clone(aliases),
    getCart:cart,addToCart:add,
    setQuantity:(slug,quantity)=>{if(!Number.isInteger(quantity)||quantity<0||quantity>99)return{ok:false,message:'Množstvo musí byť celé číslo od 0 do 99.'};state.lines=quantity===0?state.lines.filter(l=>l.slug!==slug):state.lines.map(l=>l.slug===slug?{...l,quantity}:l);persist();return{ok:true,cart:cart()};},
    applyCoupon:coupon,removeCoupon:()=>{state.coupon='';persist();return cart();},
    importQr:params=>{
      const code=params.get('produkt');if(!code)return{ok:false,message:'V odkaze chýba kód produktu.'};
      const qty=params.get('ks')??'1',couponCode=params.get('kupon')??'';
      if(!/^[1-9]\d?$/.test(qty))return{ok:false,message:'QR odkaz obsahuje neplatné množstvo (1–99).'};
      const key=JSON.stringify([code,qty,couponCode]);
      if(state.qrKeys.includes(key))return{ok:true,message:'Tento QR odkaz už bol v ukážke použitý. Košík sa nezdvojil.'};
      const result=add(code,Number(qty));if(!result.ok)return result;
      state.qrKeys.push(key);state.qrKeys=state.qrKeys.slice(-50);persist();
      const couponResult=couponCode?coupon(couponCode):null;
      return{ok:true,message:result.message+(couponResult?' '+couponResult.message:'')};
    },
    requestMagicLink:()=>({ok:true,message:'Ak účet existuje, po napojení vám pošleme odkaz. Toto je ukážka; e-mail sa neodoslal.'}),
    confirmMagicLink:()=>({ok:false,message:'Ukážkový režim: odkaz sa neoveruje a neprihlasuje vás. Môžete si otvoriť náhľad účtu.'}),
    getAccount:()=>({name:'Ukážková zákazníčka',orders:[{number:'DEMO-001',date:'12. 10. 2026',product:'RESET 40+',status:'Ukážka histórie',totalLabel:'168,00 €'}]}),
    getEntitlements:({preview='locked'}={})=>({mode:'mock',active:preview==='unlocked',weeks:Array.from({length:16},(_,i)=>({number:i+1,title:`Tematický týždeň ${String(i+1).padStart(2,'0')}`,description:'Priestor pre schválený obsah programu.'}))}),
    checkout:({scenario='ALLOW'}={})=>({mode:'mock',status:scenario,messages:{ALLOW:'Ukážka prijatej objednávky. Platba sa neuskutočnila a e-mail sa neodoslal.',REVIEW:'Objednávku ešte overujeme. Po napojení vás budeme informovať o ďalšom postupe.',BLOCK:'Objednávku teraz nemožno dokončiť. Kontaktujte nás a pomôžeme vám s ďalším postupom.',ERROR:'Služba je dočasne nedostupná. Skúste to znova o chvíľu.'}[scenario]||'Neznámy ukážkový stav.'}),
    sendContact:()=>({ok:true,message:'Náhľad formulára bol úspešne skontrolovaný. Správa sa v ukážke neodosiela.'}),
  };
}
export const api=createMockApi();
