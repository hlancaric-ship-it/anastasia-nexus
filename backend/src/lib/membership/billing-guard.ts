import { isDeepStrictEqual } from 'node:util'
import { Modules } from '@medusajs/framework/utils'
import { MEMBERSHIP_MODULE } from '../../modules/membership'
import type MembershipModuleService from '../../modules/membership/service'
import { euroMinor, isOneNativeUnit } from './native-receipt'
import { assertMembership, type Membership } from './policy'
import { assertCartConsent } from '../legal/checkout'
export const MEMBERSHIP_STRIPE_PROVIDER='pp_membership_stripe_membership'
export async function assertMembershipRenewalCart(scope:any,cart:any):Promise<boolean>{
 const service=scope.resolve(MEMBERSHIP_MODULE) as MembershipModuleService
 const rows=await service.listMembershipBillingAttempts({cart_id:cart.id},{take:2})
 if(!rows.length)return false
 if(rows.length!==1)throw new Error('MEMBERSHIP_RENEWAL_AMBIGUOUS')
 const attempt=rows[0],state=(await service.retrieveMembership(attempt.membership_id)).snapshot as unknown as Membership
 assertMembership(state)
 const terms=state.terms,snapshot=attempt.snapshot as any
 if(!['payment_ready','completing','unknown','needs_action'].includes(attempt.stage)||!['renewing','unknown'].includes(state.status)||!state.renew||state.renewal_key!==attempt.renewal_key||!isDeepStrictEqual(snapshot.terms,terms))throw new Error('MEMBERSHIP_RENEWAL_NOT_APPROVED')
 if(cart.customer_id!==terms.customer_id||cart.currency_code!==terms.currency||euroMinor(cart.total)!==terms.amount_minor||!Array.isArray(cart.items)||cart.items.length!==1||cart.items[0].product_id!==terms.product_id||cart.items[0].variant_id!==terms.variant_id||!isOneNativeUnit(cart.items[0].quantity))throw new Error('MEMBERSHIP_RENEWAL_CART_CHANGED')
 const product=await scope.resolve(Modules.PRODUCT).retrieveProduct(terms.product_id,{select:['id','status','metadata']})
 if(product.status!=='published'||product.metadata?.membership?.version!==terms.version||product.metadata.membership.period_days!==terms.period_days)throw new Error('MEMBERSHIP_RENEWAL_TERMS_CHANGED')
 const mandates=await service.listMembershipMandates({id:snapshot.mandate_id,membership_id:state.id,customer_id:terms.customer_id},{take:2})
 if(mandates.length!==1)throw new Error('MEMBERSHIP_MANDATE_REQUIRED')
 const mandate=mandates[0],collection=cart.payment_collection,sessions=collection?.payment_sessions
 if(!collection||collection.id!==attempt.collection_id||!Array.isArray(sessions)||sessions.length!==1)throw new Error('MEMBERSHIP_RENEWAL_PAYMENT_CHANGED')
 const session=sessions[0],data=session.data
 const methodId=typeof data?.payment_method==='string'?data.payment_method:data?.payment_method?.id
 if(session.id!==attempt.session_id||session.provider_id!==MEMBERSHIP_STRIPE_PROVIDER||session.provider_id!==mandate.provider_id||session.currency_code!=='eur'||euroMinor(session.amount)!==terms.amount_minor||data?.membership_renewal!==true||data.capture_method!=='manual'||data.confirm||data.off_session||methodId!==mandate.payment_method_id||data.customer!==mandate.provider_customer_id)throw new Error('MEMBERSHIP_RENEWAL_PAYMENT_CHANGED')
 await assertCartConsent(scope,cart)
 return true
}
