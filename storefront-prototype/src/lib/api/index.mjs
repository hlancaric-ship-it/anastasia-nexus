// Runtime vždy používá skutečný backend. Testy mohou předat explicitní adapter.
import {createMockApi} from './mock.mjs';
import {createHttpApi} from './http.mjs';
export { api, createMockApi } from './mock.mjs';

export function createApi(storage, adapter) {
  if (!adapter) {
    const config=globalThis.__ANASTASIA_CONFIG__;
    if(!config?.apiBaseUrl||!config?.publishableKey||!config?.regionId)throw new Error('Chýba pripojenie k obchodu.');
    adapter=createHttpApi(storage,config);
  }
  let writes=Promise.resolve();
  const mutations=new Set(['addToCart','setQuantity','applyCoupon','removeCoupon','importQr','sendChatMessage','setChatPreview','addGiftVoucher','applyGiftVoucher','removeGiftVoucher','checkout','getCheckoutOptions','prepareCheckout','acceptCheckoutTerms','prepareMembership','startMembershipCheckout','completeMembership','stopMembership','reconcileMembership','reserveBooking','sendContractWithdrawal','signOut']);
  return Object.fromEntries(Object.entries(adapter).map(([name,value])=>{
    if(typeof value!=='function')return[name,value];
    return[name,(...args)=>{
      if(!mutations.has(name))return writes.then(()=>value(...args));
      const result=writes.then(()=>value(...args));
      writes=result.catch(()=>{});
      return result;
    }];
  }));
}
