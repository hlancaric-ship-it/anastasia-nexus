import {ContainerRegistrationKeys} from '@medusajs/framework/utils'
import type {MedusaContainer} from '@medusajs/framework/types'
import {MEMBERSHIP_MODULE} from '../../modules/membership'
import type MembershipModuleService from '../../modules/membership/service'
import {euroMinor,isOneNativeUnit} from './native-receipt'
import {assertMembershipCustomerAvailable} from './customer-guard'
import {assertMembershipRenewalCart} from './billing-guard'
import {assertCheckoutContract} from './checkout-policy'
export const MEMBERSHIP_PROVIDER='pp_membership_stripe_membership'
/** Called from the ONE existing native completion validation hook, before authorization.
 * Native cart snapshot is authoritative; never mutate it or accept request metadata as consent. */
export async function assertMembershipCheckoutCart(scope:MedusaContainer,cart:any):Promise<void>{
 const ids=[...new Set<string>((cart.items??[]).map((i:any)=>i.product_id).filter(Boolean))]
 const sessions=cart.payment_collection?.payment_sessions??[]
 const {data:products}=ids.length?await scope.resolve(ContainerRegistrationKeys.QUERY).graph({entity:'product',fields:['id','metadata'],filters:{id:ids}}):{data:[]}
 const configured=products.filter((p:any)=>p.metadata?.membership)
 const registered=scope.hasRegistration?.(MEMBERSHIP_MODULE)===true
 const service=registered?scope.resolve<MembershipModuleService>(MEMBERSHIP_MODULE):null
 const checkouts=service?await service.listMembershipCheckouts({cart_id:cart.id},{take:2}):[]
 const usesProvider=sessions.some((s:any)=>s.provider_id===MEMBERSHIP_PROVIDER)
 if(!configured.length&&!checkouts.length&&!usesProvider)return
 if(!service)throw new Error('MEMBERSHIP_NOT_CONFIGURED')
 await assertMembershipCustomerAvailable(scope,cart.customer_id)
 if(checkouts.length!==1){
  // Billing implementation supplies the trusted durable renewal-cart guard.
  if(await assertMembershipRenewalCart(scope,cart))return
  throw new Error('MEMBERSHIP_CONSENT_REQUIRED')
 }
 const row=checkouts[0],checkout=await service.checkoutForCustomer(row.id,cart.customer_id)
 if(!checkout)throw new Error('MEMBERSHIP_CONSENT_REQUIRED')
 const c=checkout.contract,t=c.terms
 assertCheckoutContract(c)
 const item=cart.items?.[0]
 if(checkout.status!=='prepared'||c.cart_id!==cart.id||t.customer_id!==cart.customer_id||cart.currency_code!==t.currency||cart.items.length!==1||!item||!isOneNativeUnit(item.quantity)||item.product_id!==t.product_id||item.variant_id!==t.variant_id||euroMinor(cart.total)!==t.amount_minor)throw new Error('MEMBERSHIP_CART_CHANGED')
 const product:any=products.find((p:any)=>p.id===t.product_id),config=product?.metadata?.membership
 if(!config||config.version!==t.version||config.period_days!==t.period_days)throw new Error('MEMBERSHIP_TERMS_CHANGED')
 if(sessions.length!==1||sessions[0].provider_id!==MEMBERSHIP_PROVIDER||sessions[0].data?.membership_renewal||sessions[0].data?.capture_method!=='manual'||(c.consent.auto_renew&&sessions[0].data?.setup_future_usage!=='off_session'))throw new Error('MEMBERSHIP_PAYMENT_SESSION_INVALID')
 // Fence is persisted before native session creation; arbitrary Store session data cannot stand in for it.
 const [payment]=await (service as any).listMembershipInitialPayments({checkout_id:checkout.id},{take:2})
 if(!payment||payment.status!=='ready'||payment.session_id!==sessions[0].id||payment.collection_id!==cart.payment_collection.id)throw new Error('MEMBERSHIP_PAYMENT_BINDING_REQUIRED')
}
