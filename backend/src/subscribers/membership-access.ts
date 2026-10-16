import type { SubscriberArgs, SubscriberConfig } from '@medusajs/framework'
import { MEMBERSHIP_MODULE } from '../modules/membership'
import type MembershipModuleService from '../modules/membership/service'
import { reconcileMembershipAccess } from '../lib/membership/access'
import { resolveOrderIdByPayment } from '../modules/entitlement/order-sync'
import { recordEvent } from '../lib/observability/events'
export default async function membershipAccessHandler({event,container}:SubscriberArgs<{id:string}>){
 if(!container.hasRegistration(MEMBERSHIP_MODULE))return
 const orderId=event.name.startsWith('payment.')?await resolveOrderIdByPayment(container,event.data.id):event.data.id
 if(!orderId)return
 const service=container.resolve<MembershipModuleService>(MEMBERSHIP_MODULE)
 const [claim]=await service.listMembershipReceipts({order_id:orderId},{take:1})
 if(!claim)return // Initial activation is explicitly handled after enrollment; the periodic job recovers gaps.
 try{
  const result=await reconcileMembershipAccess(container,claim.membership_id)
  await recordEvent(container,result.status==='PENDING_VERIFICATION'?'warn':'info','entitlement','membership_access_reconciled',{entity_id:claim.membership_id,membership_id:claim.membership_id,order_id:orderId,status:result.status})
  if(result.status==='PENDING_VERIFICATION')throw new Error('MEMBERSHIP_ACCESS_PENDING')
 }catch{throw new Error('MEMBERSHIP_ACCESS_RECONCILIATION_REQUIRED')}
}
export const config:SubscriberConfig={event:['order.placed','payment.captured','payment.refunded','order.canceled']}
