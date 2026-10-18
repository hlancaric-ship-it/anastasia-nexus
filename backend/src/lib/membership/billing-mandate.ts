import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'
import { MEMBERSHIP_MODULE } from '../../modules/membership'
import type MembershipModuleService from '../../modules/membership/service'
import { MEMBERSHIP_STRIPE_PROVIDER } from './billing-guard'
import { loadNativeMembershipReceipt } from './native-receipt'
/** Only opaque native references are stored. The server verifies consent, receipt and provider ownership. */
export async function saveMembershipMandate(scope:any,membershipId:string,checkoutId:string){
 const service=scope.resolve(MEMBERSHIP_MODULE) as MembershipModuleService
 const state=await service.retrieveMembership(membershipId),terms=(state.snapshot as any).terms
 const checkout=await service.checkoutForCustomer(checkoutId,terms.customer_id)
 if(!checkout||checkout.status!=='settled'||checkout.membership_id!==membershipId||!checkout.contract.consent.auto_renew)return {status:'NOT_REQUESTED' as const}
 await loadNativeMembershipReceipt(scope,checkout.order_id!,{cart_id:checkout.contract.cart_id,customer_id:terms.customer_id,product_id:terms.product_id,variant_id:terms.variant_id,checkout_key:`initial:${checkout.order_id}`})
 const query=scope.resolve(ContainerRegistrationKeys.QUERY)
 const {data:orders}=await query.graph({entity:'order',fields:['id','payment_collections.payments.id'],filters:{id:checkout.order_id}})
 const ids=orders[0]?.payment_collections?.flatMap((p:any)=>p.payments?.map((v:any)=>v.id)||[])||[]
 if(ids.length!==1)throw new Error('MEMBERSHIP_MANDATE_PAYMENT_AMBIGUOUS')
 const payment=await scope.resolve(Modules.PAYMENT).retrievePayment(ids[0],{relations:['payment_session']})
 const data=payment.data,session=payment.payment_session
 if(payment.provider_id!==MEMBERSHIP_STRIPE_PROVIDER||!payment.captured_at||payment.canceled_at||data?.status!=='succeeded'||data.setup_future_usage!=='off_session'||!session||session.id!==data.metadata?.session_id)throw new Error('MEMBERSHIP_NATIVE_MANDATE_REQUIRED')
 const initial=await service.listMembershipInitialPayments({checkout_id:checkoutId,status:'ready',session_id:session.id},{take:2})
 if(initial.length!==1||initial[0].collection_id!==payment.payment_collection_id)throw new Error('MEMBERSHIP_NATIVE_MANDATE_REQUIRED')
 const {data:customers}=await query.graph({entity:'customer',fields:['id','account_holders.*'],filters:{id:terms.customer_id}})
 const holders=customers[0]?.account_holders?.filter((h:any)=>h.provider_id===payment.provider_id&&h.data?.id===data.customer)||[]
 if(holders.length!==1)throw new Error('MEMBERSHIP_MANDATE_OWNER_MISMATCH')
 const holder=holders[0],methodId=typeof data.payment_method==='string'?data.payment_method:data.payment_method?.id
 if(typeof methodId!=='string'||!/^pm_[A-Za-z0-9]+$/.test(methodId))throw new Error('MEMBERSHIP_NATIVE_MANDATE_REQUIRED')
 const methods=await scope.resolve(Modules.PAYMENT).listPaymentMethods({provider_id:payment.provider_id,context:{account_holder:holder}})
 const match=methods.filter((m:any)=>m.id===methodId&&m.data?.customer===data.customer&&m.data?.type==='card')
 if(match.length!==1)throw new Error('MEMBERSHIP_MANDATE_METHOD_UNAVAILABLE')
 await service.saveMandate({membership_id:membershipId,customer_id:terms.customer_id,checkout_id:checkoutId,provider_id:payment.provider_id,account_holder_id:holder.id,provider_customer_id:data.customer,payment_method_id:methodId,payment_id:payment.id})
 return {status:'SAVED' as const}
}
