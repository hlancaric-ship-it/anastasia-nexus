import {SHOP_CATALOG,SHOP_CATEGORIES} from './catalog.mjs';
const products=SHOP_CATALOG.map(p=>({...p}));
// Metriky Zrkadielka: zoznam aj poradie stĺpcov berie klient z API (predvolené tri z backendu).
const RESET_METRICS=[{key:'energia',label:'Energia',min:1,max:10,order:10},{key:'spanok',label:'Spánok',min:1,max:10,order:20},{key:'stres',label:'Stres',min:1,max:10,order:30}];

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
  ['/ai-anastasia/recenzie-zakaznikov','Recenzie zákazníkov','Skutočné skúsenosti zákazníkov.','Pôvodné recenzie zákazníkov zverejňuje AI ANASTASIA na www.aianastasia.com. Prehľad najdete v sekcii AI ANASTASIA.','journal'],
  ['/ai-anastasia','AI ANASTASIA','Nová kapitola. Už čoskoro.','Pripravuje sa...','future'],
].map(([path,title,headline,intro,kind])=>({path,title,headline,intro,kind}));

const aliases = {
  '/online-zdravotna-konzultacia':'/konzultacie/online-zdravotna-konzultacia',
  '/eshop/produkt/astrologia':'/eshop/produkt/astrologia-zdravie-predispozicia',
};
const clone = value => structuredClone(value);
// Synthetic API responses; views never define denominations or calculate credit.
const voucherVariants = [
  {id:'gv-50',title:'50,00 €'}, {id:'gv-100',title:'100,00 €'}, {id:'gv-200',title:'200,00 €'},
];
const voucherProducts=voucherVariants.map(v=>({slug:v.id,code:v.id,name:'Darčekový poukaz',priceLabel:v.title,image:'/assets/brand-mark.svg',giftVoucher:true}));
const cartProducts=[...products,...voucherProducts];
const memoryStorage = () => { const values = new Map(); return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}; };
const KEY='anastasia.skeleton.v1';
const canonical = path => { const normalized=path.replace(/\/+$/,'')||'/'; return aliases[normalized]||normalized; };

export function createMockApi(storage=memoryStorage()) {
  let chatPreview='open', conversations=[{id:'demo-chat',subject:'Otázka k programu',status:'open'}];
  const messages=[{conversation_id:'demo-chat',id:'welcome',author:'lucia',body:'Dobrý deň, tu je priestor pre vaše otázky.',created_at:'2026-10-14T08:00:00Z'}];
  let sent=0, credit=null, signedOut=false;
  const chatStatus=()=>({eligible:chatPreview!=='ineligible',blocked:chatPreview==='blocked',can_write:!['ineligible','blocked','daily','limit'].includes(chatPreview)&&sent<3,reason:chatPreview==='ineligible'?'chat_not_eligible':chatPreview==='blocked'?'chat_blocked':chatPreview==='daily'?'chat_daily_limit':chatPreview==='limit'||sent>=3?'chat_consecutive_limit':null,remaining:{today:5-sent,in_row:Math.max(0,3-sent),now:Math.max(0,3-sent)},limits:{per_day:5,in_row:3,max_length:2000}});
  let state={lines:[],coupon:'',qrKeys:[]};
  try { const stored=JSON.parse(storage.getItem(KEY)); if(stored && Array.isArray(stored.lines)) state={lines:stored.lines.filter(l=>cartProducts.some(p=>p.slug===l.slug)&&Number.isInteger(l.quantity)&&l.quantity>0&&l.quantity<=99),coupon:stored.coupon==='DEMO10'?'DEMO10':'',qrKeys:Array.isArray(stored.qrKeys)?stored.qrKeys.filter(v=>typeof v==='string').slice(-50):[]}; } catch { /* An unavailable storage must not break the preview. */ }
  const persist=()=>{try{storage.setItem(KEY,JSON.stringify(state));}catch{/* In-memory preview still works. */}};
  // Odhlásenie v náhľade: vymaže stav košíka a údaje zákazníka, účet zostane odhlásený.
  const CUSTOMER_KEYS=['anastasia.jwt','anastasia.cart','anastasia.coupon','anastasia.qrkeys','anastasia.gift','anastasia.booking','anastasia.membership.cart','anastasia.membership.checkout','anastasia.membership.offer','anastasia.return'];
  const forget=key=>{try{storage.removeItem?.(key);}catch{/* prehliadač bez zápisu */}};
  const productByCode=code=>cartProducts.find(p=>p.code===code||p.slug===code);
  const cart=()=>({mode:'mock',lines:state.lines.map(line=>({...clone(cartProducts.find(p=>p.slug===line.slug)),quantity:line.quantity})),gift_voucher:clone(credit),coupon:state.coupon,subtotalLabel:'Bez vyúčtovania',discountLabel:state.coupon?'Kupón prijatý':'Kupón nezadaný',totalLabel:credit?'0,00 €':'Platba nie je aktívna'});
  const add=(code,quantity=1)=>{
    const product=productByCode(code);
    if(!product)return {ok:false,message:'Kód produktu sa v katalógu nenašiel. Pôvodný odkaz je zachovaný; produkt vyžaduje mapovanie pri napojení.'};
    if(!Number.isInteger(quantity)||quantity<1||quantity>99)return{ok:false,message:'Zadajte celé množstvo od 1 do 99.'};
    const line=state.lines.find(l=>l.slug===product.slug);
    if(line && line.quantity+quantity>99)return{ok:false,message:'Najviac 99 kusov jednej položky.'};
    if(line)line.quantity+=quantity;else state.lines.push({slug:product.slug,quantity});
    credit=null;persist();return{ok:true,message:'Produkt pridaný do košíka.',cart:cart()};
  };
  const coupon=code=>{const valid=code.trim().toUpperCase()==='DEMO10';if(valid){state.coupon='DEMO10';credit=null;persist();}return{ok:valid,message:valid?'Kupón prijatý.':'Kupón nie je dostupný.'};};
  return {
    mode:'mock', canonical,isLoggedIn:()=>!signedOut,
    setChatPreview:value=>{chatPreview=value;},
    getChatStatus:chatStatus,
    getChatConversations:()=>({conversations:clone(conversations)}),
    getChatConversation:id=>({conversation:clone(conversations.find(c=>c.id===id)),messages:clone(messages.filter(m=>m.conversation_id===id))}),
    markChatRead:()=>({ok:true}),
    sendChatMessage:({conversation_id,body})=>{
      const s=chatStatus();if(!s.can_write)return{ok:false,status:s.eligible&&!s.blocked?429:403,type:s.reason};
      const conversation=conversations.find(c=>c.id===conversation_id);
      if(conversation_id&&!conversation)return{ok:false,status:404,type:'not_found'};
      if(conversation&&(conversation.status==='closed'||chatPreview==='closed'))return{ok:false,status:409,type:'conversation_closed'};
      body=String(body??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,'').trim();
      if(!body||Array.from(body).length>2000)return{ok:false,status:400,type:body?'message_too_long':'message_empty'};
      const target=conversation||{id:`demo-chat-${conversations.length+1}`,subject:'Nová konverzácia',status:'open'};
      if(!conversation)conversations.unshift(target);
      const message={id:`message-${++sent}`,author:'customer',body,conversation_id:target.id,created_at:new Date().toISOString()};messages.push(message);
      return{ok:true,status:201,conversation:clone(target),message:clone(message)};
    },
    getGiftVoucherProduct:()=>({id:'demo-gift-voucher',handle:'darkovy-poukaz',variants:clone(voucherVariants)}),
    addGiftVoucher:({variant_id,recipient})=>{
      if(!voucherVariants.some(v=>v.id===variant_id))return{ok:false,message:'Vybraná hodnota poukazu už nie je dostupná.'};
      if(!recipient?.name?.trim()||!/^\S+@\S+\.\S+$/.test(recipient?.email||'')||Array.from(recipient.message||'').length>300)return{ok:false,message:'Skontrolujte meno, e-mail a odkaz (najviac 300 znakov).'};
      const result=add(variant_id);
      return {...result,recipients:result.ok?{[variant_id]:[clone(recipient)]}:undefined};
    },
    applyGiftVoucher:code=>{
      if(String(code).trim().toUpperCase()!=='DEMO-GIFT')return{ok:false,status:400,error:'GIFT_VOUCHER_INVALID',message:'Poukaz nie je platný alebo už nie je dostupný.'};
      if(!state.lines.some(l=>!productByCode(l.slug)?.giftVoucher))return{ok:false,status:400,error:'GIFT_VOUCHER_NOT_APPLICABLE',message:'Poukaz sa nedá použiť na nákup ďalšieho poukazu.'};
      credit={masked_code:'••••-GIFT',amountLabel:'18,00 €',balanceLabel:'50,00 €',amount:18,balance:50};
      return{ok:true,gift_voucher:clone(credit),cart:cart(),message:'Poukaz bol uplatnený.'};
    },
    removeGiftVoucher:()=>{credit=null;return cart();},
    getProducts:({category='',search='',filter=''}={})=>clone(products.filter(p=>(!category||p.category===category||p.categoryHandle===category)&&(!search||p.name.toLocaleLowerCase('sk').includes(search.toLocaleLowerCase('sk')))&&(!filter||(filter==='novinky'?p.isNew:filter==='bestsellery'?p.isBestseller:filter==='odporucame'?p.isRecommended:true)))),
    getProduct:slug=>clone(products.find(p=>p.slug===slug)||null),
    getCategories:()=>[...SHOP_CATEGORIES],
    getPages:()=>clone(pages),getPage:path=>clone(pages.find(p=>p.path===canonical(path))||null),getAliases:()=>clone(aliases),
    getCart:cart,addToCart:add,
    setQuantity:(slug,quantity)=>{if(!Number.isInteger(quantity)||quantity<0||quantity>99)return{ok:false,message:'Množstvo musí byť celé číslo od 0 do 99.'};state.lines=quantity===0?state.lines.filter(l=>l.slug!==slug):state.lines.map(l=>l.slug===slug?{...l,quantity}:l);credit=null;persist();return{ok:true,cart:cart()};},
    applyCoupon:coupon,removeCoupon:()=>{state.coupon='';credit=null;persist();return cart();},
    importQr:params=>{
      const code=params.get('produkt');if(!code)return{ok:false,message:'V odkaze chýba kód produktu.'};
      const qty=params.get('ks')??'1',couponCode=params.get('kupon')??'';
      if(!/^[1-9]\d?$/.test(qty))return{ok:false,message:'QR odkaz obsahuje neplatné množstvo (1–99).'};
      const key=JSON.stringify([code,qty,couponCode]);
      if(state.qrKeys.includes(key))return{ok:true,message:'Tento QR odkaz už bol použitý. Košík sa nezdvojil.'};
      const result=add(code,Number(qty));if(!result.ok)return result;
      state.qrKeys.push(key);state.qrKeys=state.qrKeys.slice(-50);persist();
      const couponResult=couponCode?coupon(couponCode):null;
      return{ok:true,message:result.message+(couponResult?' '+couponResult.message:'')};
    },
    requestMagicLink:()=>({ok:true,message:'Ak účet existuje, po napojení vám pošleme odkaz. Toto je ukážka; e-mail sa neodoslal.'}),
    confirmMagicLink:()=>({ok:false,message:'Ukážkový režim: odkaz sa neoveruje a neprihlasuje vás. Môžete si otvoriť náhľad účtu.'}),
    // Odhlásenie: v náhľade zmizne košík aj údaje zákazníka, účet ostáva odhlásený.
    signOut:()=>{state={lines:[],coupon:'',qrKeys:[]};credit=null;sent=0;signedOut=true;forget(KEY);for(const key of CUSTOMER_KEYS)forget(key);return{ok:true};},
    getVouchers:()=>({ok:true,vouchers:[]}),
    downloadVoucherPdf:()=>({ok:false}),
    getCustomerCenter:()=>({
      ok:true,bookingsOk:true,mode:'mock',bookings:[{id:'demo-consultation',day:'23',month:'Okt',title:'Online zdravotná konzultácia',date:'23. 10. 2026 · 18:00 – 19:00',status:'Potvrdený termín'}],
      materials:[{id:'demo-workbook',title:'Pracovný zošit · RESET 40+',category:'programy',type:'PDF'},{id:'demo-consultation-note',title:'Zápis z konzultácie',category:'konzultacie',type:'PDF'},{id:'demo-invoice',title:'Faktúra · 2026-0142',category:'faktury',type:'PDF'}],
      reorder:clone(products.slice(0,3)),profile:{name:'Zákazníka',email:'demo@example.test',phone:'',birthDate:'',birthTime:'',birthPlace:'',street:'',city:'',postalCode:''},
    }),
    saveCustomerProfile:()=>({ok:true,message:'Údaje boli skontrolované.'}),
    getAccount:()=>({ok:true,name:'Zákazníka',orders:[{number:'2026-0142',date:'12. 10. 2026',product:'RESET 40+',status:'Doručená',totalLabel:'168,00 €'}]}),
    getEntitlements:({preview='locked'}={})=>({mode:'mock',active:preview==='unlocked',weeks:Array.from({length:16},(_,i)=>({number:i+1,title:`Tematický týždeň ${String(i+1).padStart(2,'0')}`,description:'Priestor pre schválený obsah programu.'}))}),
    checkout:({scenario='ALLOW'}={})=>({mode:'mock',status:scenario,messages:{ALLOW:'Platba nie je aktívna. Objednávka sa neodoslala.',REVIEW:'Objednávku ešte overujeme. Po napojení vás budeme informovať o ďalšom postupe.',BLOCK:'Objednávku teraz nemožno dokončiť. Kontaktujte nás a pomôžeme vám s ďalším postupom.',ERROR:'Služba je dočasne nedostupná. Skúste to znova o chvíľu.'}[scenario]||'Neznámy stav.'}),
    sendContact:()=>({ok:true,message:'Formulár bol skontrolovaný. Správa sa zatiaľ neodosiela.'}),
    sendContractWithdrawal:()=>({ok:true,message:'Formulár bol skontrolovaný. Odstúpenie sa zatiaľ neodosiela.'}),
    // RESET 40+ (lokálny náhľad): žiadne demo dáta – prázdne Zrkadielko a kostra programu.
    getResetProgram:()=>({ok:true,program:'reset-40-plus',total_weeks:16,entry_questionnaire_url:'https://tally.so/r/440GBr',final_summary:{title:'Záverečné zhrnutie',materials:[]},weeks:Array.from({length:16},(_,i)=>({week:i+1,title:null,intro:null,materials:[],days:[2,3,4,5,6,7].map(day=>({day,label:`${day}. deň`,materials:[]}))})),content_ready:false,metrics:RESET_METRICS}),
    getResetJournal:()=>({ok:true,program:'reset-40-plus',metrics:RESET_METRICS,entries:[],count:0,limit:50,offset:0}),
    createResetJournalEntry:()=>({ok:true,entry:null,message:'Záznam bol skontrolovaný. V lokálnom náhľade sa neukladá.'}),
    updateResetJournalEntry:()=>({ok:true,entry:null,message:'Zmena bola skontrolovaná. V lokálnom náhľade sa neukladá.'}),
    deleteResetJournalEntry:()=>({ok:true,message:'Zmazanie bolo skontrolované. V lokálnom náhľade sa nevykoná.'}),
    subscribeNewsletter:()=>({ok:true,message:'Náhľad: prihlásenie k novinkám sa neukladá.'}),
    // Klub: bez backendu žiadne vymyslené ceny ani členstvá, len poctivý prázdny stav.
    getMembershipProducts:()=>[],
    getCustomerEmail:()=>'',
    prepareMembership:()=>({ok:false,message:'Členstvo zatiaľ nie je v ponuke.'}),
    startMembershipCheckout:()=>({ok:false,message:'Členstvo zatiaľ nie je v ponuke.'}),
    completeMembership:()=>({ok:false,status:'ERROR',message:'Členstvo zatiaľ nie je v ponuke.'}),
    listMemberships:()=>({ok:true,memberships:[],count:0,offset:0,limit:20}),
    stopMembership:()=>({ok:false,message:'Členstvo sa nenašlo.'}),
    getMembershipPayment:()=>({ok:false,message:'Členstvo sa nenašlo.'}),
    reconcileMembership:()=>({ok:false,message:'Členstvo sa nenašlo.'}),
    // Konzultácie: bez backendu žiadne vymyslené termíny.
    getBookingTypes:()=>({ok:true,types:[]}),
    getBookingSlots:()=>({ok:false,slots:[],message:'Termíny sa nepodarilo načítať.'}),
    reserveBooking:()=>({ok:false,message:'Rezervácia termínov zatiaľ nie je dostupná.'}),
    verifyCartBooking:()=>({ok:true}),
  };
}
export const api=createMockApi();
