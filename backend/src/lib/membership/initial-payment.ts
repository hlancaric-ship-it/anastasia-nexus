import type {MedusaRequest} from '@medusajs/framework/http'
import type {ILockingModule} from '@medusajs/framework/types'
import {ContainerRegistrationKeys,Modules} from '@medusajs/framework/utils'
import {createPaymentCollectionForCartWorkflow,createPaymentSessionsWorkflow} from '@medusajs/medusa/core-flows'
import {MEMBERSHIP_MODULE} from '../../modules/membership'
import type MembershipModuleService from '../../modules/membership/service'
import {MEMBERSHIP_PROVIDER} from './checkout-guard'
import {euroMinor,isOneNativeUnit} from './native-receipt'
import {assertCartConsent} from '../legal/checkout'
import {repriceCart} from '../../api/store/nexus-cart/route'
/** One durable fence before any provider request. Unknown outcomes reconcile; never recreate blindly. */
export async function createMembershipInitialPayment(scope:MedusaRequest['scope'],checkoutId:string,actorId:string){
 const service=scope.resolve<MembershipModuleService>(MEMBERSHIP_MODULE) as any
 return scope.resolve<ILockingModule>(Modules.LOCKING).execute(`membership-payment:${checkoutId}`,async()=>{
  const checkout=await service.checkoutForCustomer(checkoutId,actorId)
  if(!checkout||checkout.status!=='prepared')throw new Error('MEMBERSHIP_CHECKOUT_NOT_FOUND')
  const c=checkout.contract,t=c.terms
  const cart=await (scope.resolve(Modules.CART) as any).retrieveCart(c.cart_id,{select:['id','customer_id','currency_code','completed_at','total'],relations:['items']})
  if(cart.customer_id!==actorId||cart.completed_at||cart.currency_code!=='eur'||cart.items?.length!==1||!isOneNativeUnit(cart.items[0].quantity)||cart.items[0].product_id!==t.product_id||cart.items[0].variant_id!==t.variant_id||euroMinor(cart.total)!==t.amount_minor)throw new Error('MEMBERSHIP_CART_CHANGED')
  await assertCartConsent(scope,cart)
  if((await repriceCart(c.cart_id,scope,false,undefined,actorId)).pricesChanged)throw new Error('MEMBERSHIP_APPROVAL_CHANGED')
  const query=scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const readCollection=async()=>{
   const {data}=await query.graph({entity:'cart',fields:['id','payment_collection.id','payment_collection.amount','payment_collection.currency_code','payment_collection.payment_sessions.*'],filters:{id:c.cart_id}})
   if(data?.length!==1||data[0].id!==c.cart_id)throw new Error('MEMBERSHIP_CHECKOUT_NOT_FOUND')
   return data[0].payment_collection
  }
  let collection=await readCollection()
  if(!collection){await createPaymentCollectionForCartWorkflow(scope).run({input:{cart_id:c.cart_id}});collection=await readCollection()}
  if(!collection||collection.currency_code!=='eur'||euroMinor(collection.amount)!==t.amount_minor)throw new Error('MEMBERSHIP_CART_CHANGED')
  const reservation=await service.reserveInitialPayment(checkoutId,actorId,collection.id)
  const validSession=(s:any)=>s?.provider_id===MEMBERSHIP_PROVIDER&&s.currency_code==='eur'&&euroMinor(s.amount)===t.amount_minor&&s.data?.capture_method==='manual'&&!s.data?.membership_renewal&&(!c.consent.auto_renew||s.data?.setup_future_usage==='off_session')
  let session:any
  if(reservation.action==='CREATE'){
   if(collection.payment_sessions?.length){await service.unknownInitialPayment(checkoutId,actorId);throw new Error('MEMBERSHIP_PAYMENT_RECONCILIATION_REQUIRED')}
   try{
    const {result}=await createPaymentSessionsWorkflow(scope).run({input:{payment_collection_id:collection.id,provider_id:MEMBERSHIP_PROVIDER,customer_id:actorId,context:{idempotency_key:reservation.key},data:{capture_method:'manual',payment_method_types:['card'],...(c.consent.auto_renew?{setup_future_usage:'off_session'}:{})}}})
    session=result
    if(!validSession(session))throw new Error('MEMBERSHIP_PAYMENT_SESSION_INVALID')
    await service.completeInitialPayment(checkoutId,actorId,session.id)
   }catch{await service.unknownInitialPayment(checkoutId,actorId);throw new Error('MEMBERSHIP_PAYMENT_RECONCILIATION_REQUIRED')}
  }else{
   // If the response was lost after persistence, recover that exact native session only.
   const sessions=collection.payment_sessions??[]
   if(reservation.payment.session_id)session=sessions.find((s:any)=>s.id===reservation.payment.session_id)
   else{
    const candidates:any[]=[]
    for(const s of sessions){
     const native=await (scope.resolve(Modules.PAYMENT) as any).retrievePaymentSession(s.id)
     if(native.context?.idempotency_key===reservation.key)candidates.push(native)
    }
    if(candidates.length===1)session=candidates[0]
   }
   if(!session||!validSession(session))throw new Error('MEMBERSHIP_PAYMENT_RECONCILIATION_REQUIRED')
   await service.completeInitialPayment(checkoutId,actorId,session.id)
  }
  if(typeof session.data?.client_secret!=='string'||!session.data.client_secret)throw new Error('MEMBERSHIP_PAYMENT_RECONCILIATION_REQUIRED')
  return {payment_session:{id:session.id,provider_id:session.provider_id,client_secret:session.data.client_secret},checkout_id:checkoutId,cart_id:c.cart_id}
 },{timeout:30})
}
