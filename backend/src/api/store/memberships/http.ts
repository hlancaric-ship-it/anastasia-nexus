import type {AuthenticatedMedusaRequest,MedusaResponse} from '@medusajs/framework/http'
export function actor(req:AuthenticatedMedusaRequest):string|null{return req.auth_context?.actor_type==='customer'?req.auth_context.actor_id:null}
export function errorResponse(res:MedusaResponse,error:unknown){
 const code=error instanceof Error?error.message:''
 const notFound=['MEMBERSHIP_CHECKOUT_NOT_FOUND','MEMBERSHIP_NOT_FOUND'].includes(code)
 const invalid=code.startsWith('INVALID_')||code==='MEMBERSHIP_CART_NOT_ELIGIBLE'||code==='MEMBERSHIP_PRODUCT_NOT_CONFIGURED'
 const unavailable=code.endsWith('_UNAVAILABLE')||code.endsWith('_NOT_CONFIGURED')
 const status=notFound?404:unavailable?503:invalid?422:code.startsWith('MEMBERSHIP_')?409:503
 return res.status(status).json({ok:false,error:status===503?'MEMBERSHIP_UNAVAILABLE':code,message:notFound?'Členstvo alebo nákup sa nenašli.':status===422?'Skontrolujte vybraný produkt a údaje nákupu.':status===409?'Nákup treba znovu overiť. Obnovte údaje; platbu neopakujte naslepo.':'Členstvo sa teraz nedá overiť. Skúste to neskôr.'})
}
export const secure=(res:MedusaResponse)=>res.setHeader('Cache-Control','no-store')
