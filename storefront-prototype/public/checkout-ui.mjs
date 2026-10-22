// Pokladňa: poradie spôsobov platby a stav tlačidla „Pokračovať“.
//
// Čisté funkcie bez DOM – testovateľné cez `node --test`. server je jediný
// zdroj pravdy: zoznam platieb aj ich cenu posiela backend, klient iba
// vyberá predvolenú voľbu a nesmie si nič vymýšľať.

// Kód platby kartou („Kartou online“) – predvolená voľba v pokladni.
export const CARD_PAYMENT_CODE='card';

// Len dostupné spôsoby platby. „Kartou online“ ide prvá, ak je dostupná;
// poradie ostatných ostáva také, ako ho poslal server.
export function availablePaymentMethods(list=[]){
  const items=(Array.isArray(list)?list:[]).filter(p=>p&&p.code&&p.available!==false);
  const card=items.find(p=>p.code===CARD_PAYMENT_CODE);
  return card?[card,...items.filter(p=>p!==card)]:items;
}

// Kód predvolene zvolenej platby (null, keď nie je dostupný žiadny spôsob).
export function defaultPaymentMethod(list=[]){
  return availablePaymentMethods(list)[0]?.code??null;
}

// Tlačidlá „Pokračovať“ sú aktívne až po načítaní košíka a možností platby.
// Kým sa načítavajú, tlačidlo je neaktívne a stránka ukazuje stav – klik sa
// nikdy neignoruje potichu.
export const CHECKOUT_LOADING_CART='Načítavam košík…';
export const CHECKOUT_LOADING_OPTIONS='Načítavam dopravu a platbu…';
export function nextButtonState({cartReady=false,optionsReady=false}={}){
  if(!cartReady)return{disabled:true,loading:CHECKOUT_LOADING_CART};
  if(!optionsReady)return{disabled:true,loading:CHECKOUT_LOADING_OPTIONS};
  return{disabled:false,loading:''};
}
