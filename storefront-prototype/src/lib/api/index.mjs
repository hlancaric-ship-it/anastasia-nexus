// The only data boundary used by the static renderer and browser components.
// Replace this adapter after approval of the skeleton, never individual views.
import {createMockApi} from './mock.mjs';
export { api, createMockApi } from './mock.mjs';

// Browser contract is asynchronous from day one. The static renderer uses the
// same normalized snapshot; a future adapter can prefetch it at build time.
export function createApi(storage, adapter=createMockApi(storage)) {
  let writes=Promise.resolve();
  const mutations=new Set(['addToCart','setQuantity','applyCoupon','removeCoupon','importQr','sendChatMessage','setChatPreview','addGiftVoucher','applyGiftVoucher','removeGiftVoucher']);
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
