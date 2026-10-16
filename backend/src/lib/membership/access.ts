import type { MedusaContainer } from '@medusajs/framework/types'
import { recordEvent } from '../observability/events'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { ENTITLEMENT_MODULE } from '../../modules/entitlement'
import type EntitlementModuleService from '../../modules/entitlement/service'
import { orderDedupeKey } from '../../modules/entitlement/policy'
import { MEMBERSHIP_MODULE } from '../../modules/membership'
import type MembershipModuleService from '../../modules/membership/service'
import { applyRenewalReceipt,type Membership } from './policy'
import { euroMinor,loadNativeMembershipReceipt } from './native-receipt'

type Scope={resolve:(key:string)=>any}
export type AccessResult={status:'ACTIVE'|'EXPIRED'|'REVOKED'|'NEEDS_REVIEW'|'PENDING_VERIFICATION';entitlement_id?:string}
async function revocation(scope:Scope,state:Membership):Promise<'FULL'|'PARTIAL'|'UNKNOWN'>{
 try{
  const {data}=await scope.resolve(ContainerRegistrationKeys.QUERY).graph({entity:'order',fields:['id','customer_id','status','payment_collections.id','payment_collections.captured_amount','payment_collections.refunded_amount'],filters:{id:state.last_order_id}})
  const row=data?.[0]
  if(data.length!==1||row.id!==state.last_order_id||row.customer_id!==state.terms.customer_id)return 'UNKNOWN'
  if(row.status==='canceled')return 'FULL'
  if(!Array.isArray(row.payment_collections)||!row.payment_collections.length)return 'UNKNOWN'
  let captured=0,refunded=0
  const seen=new Set<string>()
  for(const c of row.payment_collections){if(!c.id||seen.has(c.id))return 'UNKNOWN';seen.add(c.id);captured+=euroMinor(c.captured_amount);refunded+=euroMinor(c.refunded_amount)}
  if(captured>0&&refunded>=captured)return 'FULL'
  return refunded>0?'PARTIAL':'UNKNOWN'
 }catch{return 'UNKNOWN'}
}
/** Internal reconciliation only: membership/receipt claims already belong to the server.
 * Does not enroll, charge, reactivate revoked access, or accept a client receipt. */
export async function reconcileMembershipAccess(scope:Scope,id:string,now=new Date()):Promise<AccessResult>{
 const memberships=scope.resolve(MEMBERSHIP_MODULE) as MembershipModuleService
 const entitlements=scope.resolve(ENTITLEMENT_MODULE) as EntitlementModuleService
 let changed=false,orderId=''
 const result=await memberships.withAccessLock(id,async state=>{
  orderId=state.last_order_id
  const key=orderDedupeKey(state.last_order_id,state.terms.product_id)
  let existing=await entitlements.findByDedupeKey(key)
  if(existing&&(existing.customer_id!==state.terms.customer_id||existing.product_id!==state.terms.product_id||existing.variant_id!==state.terms.variant_id||existing.order_id!==state.last_order_id||existing.source!=='order'))throw new Error('MEMBERSHIP_ACCESS_OWNER_MISMATCH')
  const cap=async()=>{
   if(existing?.status==='active'&&!existing.granted_by&&(!existing.expires_at||new Date(existing.expires_at).getTime()>Date.parse(state.period_end))){
    await entitlements.updateEntitlements({id:existing.id,expires_at:new Date(state.period_end)});changed=true
    existing=await entitlements.findByDedupeKey(key)
   }
  }
  const negative=async()=>{
   await cap()
   const reason=await revocation(scope,state)
   if((reason==='FULL'||reason==='PARTIAL')&&state.renew)changed=true
   if(reason==='FULL'){
    if(existing?.status==='active'){existing=await entitlements.revoke(existing.id,'membership_order_revoked');changed=true}
    return {value:{status:'REVOKED',...(existing?{entitlement_id:existing.id}:{})} as AccessResult,stop_renewal:true}
   }
   if(reason==='PARTIAL')return {value:{status:'NEEDS_REVIEW',...(existing?{entitlement_id:existing.id}:{})} as AccessResult,stop_renewal:true}
   return {value:{status:'PENDING_VERIFICATION',...(existing?{entitlement_id:existing.id}:{})} as AccessResult,stop_renewal:false}
  }
  const verify=async()=>{
   const [claim]=await memberships.listMembershipReceipts({membership_id:id,order_id:state.last_order_id},{take:1})
   if(!claim||claim.checkout_key!==state.last_checkout_key)throw new Error('MEMBERSHIP_RECEIPT_MISSING')
   const {data}=await scope.resolve(ContainerRegistrationKeys.QUERY).graph({entity:'order_cart',fields:['cart_id','order_id'],filters:{order_id:state.last_order_id}})
   if(data.length!==1||!data[0].cart_id)throw new Error('MEMBERSHIP_CART_LINK_MISSING')
   const receipt=await loadNativeMembershipReceipt(scope,state.last_order_id,{cart_id:data[0].cart_id,customer_id:state.terms.customer_id,product_id:state.terms.product_id,variant_id:state.terms.variant_id,checkout_key:claim.checkout_key},now)
   if(applyRenewalReceipt(state,receipt,now.toISOString())!==state)throw new Error('MEMBERSHIP_ACCESS_NOT_CURRENT')
  }
  try{await verify()}catch{return negative()}
  if(existing?.status==='revoked')return {value:{status:'NEEDS_REVIEW',entitlement_id:existing.id} as AccessResult,stop_renewal:true}
  if(!existing&&Date.parse(state.period_end)<=now.getTime())return {value:{status:'EXPIRED'} as AccessResult,stop_renewal:false}
  if(!existing){changed=true;existing=(await entitlements.grant({customer_id:state.terms.customer_id,product_id:state.terms.product_id,variant_id:state.terms.variant_id,order_id:state.last_order_id,source:'order',dedupe_key:key,expires_at:new Date(state.period_end)})).entitlement}
  // Share the native order dedupe key with the generic handler; never create a second parallel right.
  if(existing.customer_id!==state.terms.customer_id||existing.product_id!==state.terms.product_id||existing.variant_id!==state.terms.variant_id||existing.order_id!==state.last_order_id||existing.source!=='order'||existing.status!=='active')return {value:{status:'NEEDS_REVIEW',entitlement_id:existing.id} as AccessResult,stop_renewal:true}
  if(!existing.expires_at||new Date(existing.expires_at).toISOString()!==state.period_end){
   if(existing.granted_by)return {value:{status:'NEEDS_REVIEW',entitlement_id:existing.id} as AccessResult,stop_renewal:true}
   if(existing.expires_at&&new Date(existing.expires_at).getTime()<Date.parse(state.period_end))return {value:{status:'NEEDS_REVIEW',entitlement_id:existing.id} as AccessResult,stop_renewal:true}
   await cap()
  }
  const saved=await entitlements.findByDedupeKey(key)
  if(!saved||saved.status!=='active'||saved.customer_id!==state.terms.customer_id||saved.product_id!==state.terms.product_id||saved.variant_id!==state.terms.variant_id||saved.order_id!==state.last_order_id||saved.source!=='order'||!saved.expires_at||new Date(saved.expires_at).toISOString()!==state.period_end)throw new Error('MEMBERSHIP_ACCESS_READBACK_MISMATCH')
  existing=saved
  try{await verify()}catch{return negative()}
  return {value:{status:Date.parse(state.period_end)>now.getTime()?'ACTIVE':'EXPIRED',entitlement_id:saved.id} as AccessResult,stop_renewal:false}
 })
 if(changed)await recordEvent(scope as MedusaContainer,result.status==='ACTIVE'||result.status==='EXPIRED'?'info':'warn','entitlement','membership_access_changed',{entity_id:id,membership_id:id,order_id:orderId,status:result.status})
 return result
}

