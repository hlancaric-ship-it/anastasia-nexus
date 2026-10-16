// Datová hranice pro statický renderer (build) i prohlížeč (runtime).
// Build používá statický `api` = mock (generuje stránky bez běžícího backendu).
// Prohlížeč přes createApi volá reálný http adaptér; mock se použije jen s ?mock=1
// nebo když chybí runtime konfigurace (globalThis.__ANASTASIA_CONFIG__ z /config.mjs).
import {createMockApi} from './mock.mjs';
import {createHttpApi} from './http.mjs';
export { api, createMockApi } from './mock.mjs';

export function createApi(storage, adapter) {
  if (!adapter) {
    let config = null, useMock = false;
    try { config = globalThis.__ANASTASIA_CONFIG__ || null; } catch { config = null; }
    try { useMock = new URLSearchParams(location.search).get('mock') === '1'; } catch { useMock = false; }
    if (config && config.useMock) useMock = true;
    adapter = (useMock || !config) ? createMockApi(storage) : createHttpApi(storage, config);
  }
  let writes=Promise.resolve();
  const mutations=new Set(['addToCart','setQuantity','applyCoupon','removeCoupon','importQr','sendChatMessage','setChatPreview','addGiftVoucher','applyGiftVoucher','removeGiftVoucher','checkout','createPaymentSession']);
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
