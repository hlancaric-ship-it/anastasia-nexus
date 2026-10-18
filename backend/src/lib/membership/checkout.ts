import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'
import type { MedusaRequest } from '@medusajs/framework/http'
import type { ILockingModule } from '@medusajs/framework/types'
import { repriceCart } from '../../api/store/nexus-cart/route'
import { MEMBERSHIP_MODULE } from '../../modules/membership'
import type MembershipModuleService from '../../modules/membership/service'
import { membershipIdValid, type CheckoutContract } from './checkout-policy'
import { euroMinor,isOneNativeUnit,loadNativeMembershipReceipt } from './native-receipt'
import {saveMembershipMandate} from './billing-mandate'
import { validateTerms } from './policy'
import { reconcileMembershipAccess } from './access'
type Scope=MedusaRequest['scope']
export type MembershipApproval={version:string;amount_minor:number;auto_renew:boolean}
const reject=(code:string):never=>{throw new Error(code)}
/** Read-only offer: caller refreshes prices through existing nexus-cart first. */
export async function membershipOffer(scope:Scope,cartId:string,actorId:string){
 if(!membershipIdValid(cartId)||!membershipIdValid(actorId))return reject('INVALID_MEMBERSHIP_CHECKOUT')
 const cart=await (scope.resolve(Modules.CART) as any).retrieveCart(cartId,{select:['id','customer_id','currency_code','completed_at','total'],relations:['items']})
 if(cart.id!==cartId||cart.customer_id!==actorId)return reject('MEMBERSHIP_CHECKOUT_NOT_FOUND')
 if(cart.completed_at||cart.currency_code!=='eur'||!Array.isArray(cart.items)||cart.items.length!==1||!isOneNativeUnit(cart.items[0].quantity))return reject('MEMBERSHIP_CART_NOT_ELIGIBLE')
 const priced=await repriceCart(cartId,scope,false,undefined,actorId)
 if(priced.pricesChanged)return reject('MEMBERSHIP_APPROVAL_CHANGED')
 const item=cart.items[0],product=await (scope.resolve(Modules.PRODUCT) as any).retrieveProduct(item.product_id,{select:['id','title','status','metadata']})
 const config=product.metadata?.membership
 if(product.id!==item.product_id||product.status!=='published'||!config)return reject('MEMBERSHIP_PRODUCT_NOT_CONFIGURED')
 const terms={customer_id:actorId,product_id:item.product_id,variant_id:item.variant_id,version:config.version,period_days:config.period_days,amount_minor:euroMinor(cart.total),currency:'eur' as const}
 validateTerms(terms)
 return {cart_id:cartId,product_id:terms.product_id,variant_id:terms.variant_id,title:product.title,version:terms.version,period_days:terms.period_days,amount_minor:terms.amount_minor,currency:'eur',amount_label:new Intl.NumberFormat('sk-SK',{style:'currency',currency:'EUR'}).format(terms.amount_minor/100)}
}
/** Actor comes from authenticated server context. Approval is a confirmation, never a source of prices.
 * Before creating any payment session; shares the installed completeCartWorkflow's cart lock key.
 * This prepares a contract, not a payment, checkout or recurring-method mandate. */
export async function prepareMembershipCheckout(scope:Scope,cartId:string,actorId:string,approval:MembershipApproval){
 if(!membershipIdValid(cartId)||!membershipIdValid(actorId))return reject('INVALID_MEMBERSHIP_CHECKOUT')
 if(!approval||typeof approval.auto_renew!=='boolean'||!Number.isSafeInteger(approval.amount_minor)||typeof approval.version!=='string')return reject('MEMBERSHIP_CONSENT_REQUIRED')
 return scope.resolve<ILockingModule>(Modules.LOCKING).execute(cartId,async()=>{
  const query=scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const read=async()=>{
   const cart=await (scope.resolve(Modules.CART) as any).retrieveCart(cartId,{select:['id','customer_id','currency_code','completed_at','total'],relations:['items','shipping_methods']})
   if(cart.id!==cartId||cart.customer_id!==actorId)return reject('MEMBERSHIP_CHECKOUT_NOT_FOUND')
   if(cart.completed_at||cart.currency_code!=='eur'||!Array.isArray(cart.items)||cart.items.length!==1||!isOneNativeUnit(cart.items[0].quantity))return reject('MEMBERSHIP_CART_NOT_ELIGIBLE')
   const {data:links}=await query.graph({entity:'order_cart',fields:['cart_id','order_id'],filters:{cart_id:cartId}})
   if(!Array.isArray(links)||links.length)return reject('MEMBERSHIP_CART_ALREADY_ORDERED')
   const {data:paymentCarts}=await query.graph({entity:'cart',fields:['id','payment_collection.id','payment_collection.payment_sessions.id','payment_collection.payments.id'],filters:{id:cartId}})
   if(!Array.isArray(paymentCarts)||paymentCarts.length!==1||paymentCarts[0].id!==cartId)return reject('MEMBERSHIP_CHECKOUT_NOT_FOUND')
   const pc=paymentCarts[0].payment_collection
   if(pc&&(!Array.isArray(pc.payment_sessions)||!Array.isArray(pc.payments)||pc.payment_sessions.length||pc.payments.length))return reject('MEMBERSHIP_PREPARE_BEFORE_PAYMENT_REQUIRED')
   return cart
  }
  await read()
  // Under the cart lock only VERIFY the NEXUS price: a write goes through updateLineItemInCartWorkflow,
  // which waits for this same lock key (2 s) and failed as 503. Pricing is persisted by /store/nexus-cart;
  // any drift since the offer is a changed approval (409, refresh via nexus-cart).
  if((await repriceCart(cartId,scope,false,undefined,actorId))?.pricesChanged)return reject('MEMBERSHIP_APPROVAL_CHANGED')
  const cart=await read(),item=cart.items[0]
  if(!membershipIdValid(item.product_id)||!membershipIdValid(item.variant_id))return reject('MEMBERSHIP_CART_NOT_ELIGIBLE')
  const product=await (scope.resolve(Modules.PRODUCT) as any).retrieveProduct(item.product_id,{select:['id','status','metadata']})
  if(product.id!==item.product_id||product.status!=='published')return reject('MEMBERSHIP_PRODUCT_NOT_ELIGIBLE')
  const config=product.metadata?.membership
  if(!config||typeof config!=='object')return reject('MEMBERSHIP_PRODUCT_NOT_CONFIGURED')
  if(cart.shipping_methods?.some((method:any)=>euroMinor(method.total??method.amount)>0))return reject('MEMBERSHIP_PHYSICAL_DELIVERY_NOT_SUPPORTED')
  // This contract sells digital member access; it cannot silently carry physical fulfillment.
  // (id, data) form: a lone object is a Medusa selector WITHOUT data and silently updates nothing.
  if(item.requires_shipping===true)await (scope.resolve(Modules.CART) as any).updateLineItems(item.id,{requires_shipping:false})
  const amount=euroMinor(cart.total)
  if(approval.version!==config.version||approval.amount_minor!==amount)return reject('MEMBERSHIP_APPROVAL_CHANGED')
  const contract:CheckoutContract={cart_id:cartId,terms:{customer_id:actorId,product_id:item.product_id,variant_id:item.variant_id,version:config.version,period_days:config.period_days,amount_minor:amount,currency:'eur'},consent:{version:approval.version,auto_renew:approval.auto_renew},accepted_at:new Date().toISOString()}
  return scope.resolve<MembershipModuleService>(MEMBERSHIP_MODULE).reserveCheckout(contract)
 },{timeout:10})
}
/** Reconciliation after the EXISTING nexus-checkout completes. Never creates/captures another payment.
 * Bound cart selects the native order; customer cannot submit an order, receipt or mutable terms. */
export async function settleMembershipCheckout(scope:Scope,id:string,actorId:string,now=new Date()){
 if(!membershipIdValid(id)||!membershipIdValid(actorId))return reject('INVALID_MEMBERSHIP_CHECKOUT')
 const service=scope.resolve<MembershipModuleService>(MEMBERSHIP_MODULE)
 const checkout=await service.checkoutForCustomer(id,actorId)
 if(!checkout)return reject('MEMBERSHIP_CHECKOUT_NOT_FOUND')
 const {data}=await (scope.resolve(ContainerRegistrationKeys.QUERY) as any).graph({entity:'order_cart',fields:['cart_id','order_id'],filters:{cart_id:checkout.contract.cart_id}})
 if(!Array.isArray(data)||data.length>1)return reject('MEMBERSHIP_NATIVE_ORDER_AMBIGUOUS')
 if(!data.length)return {status:'PENDING' as const}
 const link=data[0]
 if(link.cart_id!==checkout.contract.cart_id||!membershipIdValid(link.order_id))return reject('MEMBERSHIP_NATIVE_ORDER_AMBIGUOUS')
 const terms=checkout.contract.terms
 const receipt=await loadNativeMembershipReceipt(scope,link.order_id,{cart_id:checkout.contract.cart_id,customer_id:actorId,product_id:terms.product_id,variant_id:terms.variant_id,checkout_key:`initial:${link.order_id}`},now)
 const result=await service.settleCheckout(id,actorId,receipt,now.toISOString())
 let mandate:{status:string}={status:'NOT_REQUESTED'}
 if(checkout.contract.consent.auto_renew){
  try{mandate=await saveMembershipMandate(scope,result.state.id,id)}catch{mandate={status:'PENDING_VERIFICATION'}}
 }
 return {status:'SETTLED' as const,membership_id:result.state.id,access:await reconcileMembershipAccess(scope,result.state.id,now),mandate}
}
