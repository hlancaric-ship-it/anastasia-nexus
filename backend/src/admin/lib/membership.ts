export type MembershipItem={id:string;customer_id?:string;customer_label?:string;product_id?:string;status:string;access_status?:string;period_end?:string;period_elapsed?:boolean;renew?:boolean;last_order_id?:string;order_id?:string|null;cart_id?:string;membership_id?:string|null;title?:string;configuration_invalid?:boolean;configuration?:{version:string;period_days:number}|null;version?:string;period_days?:number}
export type MembershipTab='memberships'|'checkouts'|'products'|'billing'
export type MembershipList={items:MembershipItem[];count:number;offset:number;limit:number}
export const membershipLabels:Record<string,string>={active:'Obdobie je evidované',renewing:'Obnova prebieha',unknown:'Platbu treba dohľadať',needs_review:'Vyžaduje kontrolu',prepared:'Nákup čaká na dokončenie',settled:'Nákup bol spracovaný',published:'Zverejnený',draft:'Koncept',proposed:'Na schválenie',rejected:'Neschválený',requires_action:'Zákazníčka musí potvrdiť platbu',failed:'Platba zlyhala',planned:'Čaká na spracovanie',cart_requested:'Pripravuje sa objednávka',cart_ready:'Objednávka je pripravená',payment_requested:'Pripravuje sa platba',payment_ready:'Platba je pripravená',completing:'Overuje sa dokončenie',needs_action:'Zákazníčka musí potvrdiť platbu',review:'Vyžaduje ručnú kontrolu'}
export function membershipLabel(status:string){return membershipLabels[status]??'Stav treba preveriť'}
export function configDraft(version:string,days:string){
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(version))throw new Error('Verzia: použite najviac 100 písmen, číslic, pomlčku alebo podčiarkovník.')
 if(!/^[1-9]\d{0,3}$/.test(days)||Number(days)>3650)throw new Error('Dĺžka: zadajte celé číslo od 1 do 3650 dní.')
 return {version,period_days:Number(days)}
}
export async function membershipRequest<T>(path:string,body?:unknown,signal?:AbortSignal):Promise<T>{
 let response:Response
 try{response=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'include',cache:'no-store',redirect:'error',signal,headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})})}
 catch(e){if(signal?.aborted)throw e;throw new Error(body===undefined?'Údaje sa nepodarilo načítať. Skúste obnoviť.':'Výsledok zmeny nepoznáme. Najprv obnovte údaje; platbu neopakujte.')}
 if(!response.ok){const text:Record<number,string>={400:'Skontrolujte vyplnené údaje. Pri zmene dĺžky použite novú verziu.',401:'Prihláste sa do administrácie znova.',403:'Na túto zmenu nemáte oprávnenie.',404:'Záznam sa nenašiel.',409:'Údaje sa medzičasom zmenili. Najprv ich obnovte.',429:'Chvíľu počkajte a skúste znova.'};throw new Error(text[response.status]??'Údaje treba overiť. Obnovte ich pred ďalším pokusom.')}
 return response.json()
}
