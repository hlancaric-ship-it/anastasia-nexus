import { isDeepStrictEqual } from 'node:util'
import { generateEntityId, InjectTransactionManager, MedusaContext, MedusaService } from '@medusajs/framework/utils'
import type { Context } from '@medusajs/framework/types'
import MembershipRow from './models/membership'
import MembershipReceipt from './models/membership-receipt'
import MembershipCheckout from './models/membership-checkout'
import {assertCheckoutContract,assertCheckoutReceipt,type CheckoutContract} from '../../lib/membership/checkout-policy'
import { activateMembership, applyRenewalReceipt, assertMembership, markRenewalUnknown, planRenewal, stopRenewal, type Membership, type Receipt, type Terms } from '../../lib/membership/policy'

type RecordRow={id:string;customer_id:string;first_order_id:string;status:string;period_end:Date|string;snapshot:Record<string,unknown>}
const json=(state:Membership)=>state as unknown as Record<string,unknown>
class MembershipModuleService extends MedusaService({Membership:MembershipRow,MembershipReceipt,MembershipCheckout}) {
 private async lock(key:string,context:Context){
  const knex=(context.transactionManager as any)?.getTransactionContext()
  if(!knex)throw new Error('MEMBERSHIP_TRANSACTION_REQUIRED')
  await knex.raw("SET LOCAL lock_timeout = '3s'")
  await knex.raw('SELECT pg_advisory_xact_lock(hashtext(?))',[`membership:${key}`])
 }
 private checked(row:RecordRow):Membership{
  const state=row.snapshot as unknown as Membership
  assertMembership(state)
  if(state.id!==row.id||state.terms.customer_id!==row.customer_id||state.status!==row.status||new Date(state.period_end).getTime()!==new Date(row.period_end).getTime())throw new Error('MEMBERSHIP_SNAPSHOT_MISMATCH')
  return state
 }
 private async read(id:string,context:Context){return this.checked(await this.retrieveMembership(id,{},context) as unknown as RecordRow)}
 private async save(state:Membership,context:Context){
  assertMembership(state)
  await this.updateMemberships({id:state.id,status:state.status,period_end:new Date(state.period_end),snapshot:json(state)},context)
  const saved=await this.read(state.id,context)
  if(!isDeepStrictEqual(saved,state))throw new Error('MEMBERSHIP_READBACK_MISMATCH')
  return saved
 }
 private checkout(row:any):{id:string;contract:CheckoutContract;status:'prepared'|'settled';order_id:string|null;membership_id:string|null}{
  const contract=row.snapshot as CheckoutContract
  assertCheckoutContract(contract)
  if(row.cart_id!==contract.cart_id||row.customer_id!==contract.terms.customer_id||!['prepared','settled'].includes(row.status)||
    (row.status==='prepared'?(row.order_id!==null||row.membership_id!==null):(!row.order_id||!row.membership_id)))throw new Error('MEMBERSHIP_CHECKOUT_SNAPSHOT_MISMATCH')
  return {id:row.id,contract,status:row.status,order_id:row.order_id,membership_id:row.membership_id}
 }
 /** Internal server contract only; checkout terms must be read before any payment starts. */
 @InjectTransactionManager()
 async reserveCheckout(contract:CheckoutContract,@MedusaContext() context:Context={}){
  assertCheckoutContract(contract)
  await this.lock(`checkout-cart:${contract.cart_id}`,context)
  const [prior]=await this.listMembershipCheckouts({cart_id:contract.cart_id},{take:1},context)
  if(prior){
   const checked=this.checkout(prior)
   if(!isDeepStrictEqual({...checked.contract,accepted_at:contract.accepted_at},contract))throw new Error('MEMBERSHIP_CHECKOUT_CONTRACT_CHANGED')
   return checked
  }
  const created=await this.createMembershipCheckouts({cart_id:contract.cart_id,customer_id:contract.terms.customer_id,status:'prepared',snapshot:contract as unknown as Record<string,unknown>},context)
  const saved=this.checkout(await this.retrieveMembershipCheckout(created.id,{},context))
  if(!isDeepStrictEqual(saved.contract,contract))throw new Error('MEMBERSHIP_CHECKOUT_READBACK_MISMATCH')
  return saved
 }
 async checkoutForCustomer(id:string,customerId:string){
  const [row]=await this.listMembershipCheckouts({id,customer_id:customerId},{take:1})
  return row?this.checkout(row):null
 }
 /** Receipt comes only from the native loader bound to this persisted cart. No charge here. */
 @InjectTransactionManager()
 async settleCheckout(id:string,customerId:string,receipt:Receipt,now:string,@MedusaContext() context:Context={}){
  await this.lock(`checkout:${id}`,context)
  const checkout=this.checkout(await this.retrieveMembershipCheckout(id,{},context))
  if(checkout.contract.terms.customer_id!==customerId)throw new Error('MEMBERSHIP_CHECKOUT_NOT_FOUND')
  assertCheckoutReceipt(checkout.contract,receipt)
  if(checkout.status==='settled'&&checkout.order_id!==receipt.order_id)throw new Error('MEMBERSHIP_CHECKOUT_ALREADY_SETTLED')
  const result=await this.activate(checkout.contract.terms,receipt,checkout.contract.consent,now,context)
  if(checkout.status==='settled'&&checkout.membership_id!==result.state.id)throw new Error('MEMBERSHIP_CHECKOUT_SETTLEMENT_MISMATCH')
  if(checkout.status==='prepared')await this.updateMembershipCheckouts({id,status:'settled',order_id:receipt.order_id,membership_id:result.state.id},context)
  const saved=this.checkout(await this.retrieveMembershipCheckout(id,{},context))
  if(saved.status!=='settled'||saved.order_id!==receipt.order_id||saved.membership_id!==result.state.id||!isDeepStrictEqual(saved.contract,checkout.contract))throw new Error('MEMBERSHIP_CHECKOUT_READBACK_MISMATCH')
  return result
 }
 /** Internal trusted-receipt boundary only. Never expose raw receipt/terms as a customer HTTP payload. */
 @InjectTransactionManager()
 async activate(terms:Terms,receipt:Receipt,consent:{version:string;auto_renew:boolean},now:string,@MedusaContext() context:Context={}):Promise<{state:Membership;replayed:boolean}>{
  const candidate=activateMembership(generateEntityId(undefined,'mbr'),terms,receipt,consent,now)
  await this.lock(`order:${receipt.order_id}`,context)
  const [claim]=await this.listMembershipReceipts({order_id:receipt.order_id},{take:1},context)
  if(claim){
   const state=await this.read(claim.membership_id,context)
   if(!isDeepStrictEqual(state.terms,terms)||claim.checkout_key!==receipt.checkout_key)throw new Error('MEMBERSHIP_ORDER_ALREADY_CLAIMED')
   return {state,replayed:true}
  }
  await this.createMemberships({id:candidate.id,customer_id:terms.customer_id,first_order_id:receipt.order_id,status:candidate.status,period_end:new Date(candidate.period_end),snapshot:json(candidate)},context)
  await this.createMembershipReceipts({membership_id:candidate.id,order_id:receipt.order_id,checkout_key:receipt.checkout_key},context)
  return {state:await this.read(candidate.id,context),replayed:false}
 }
 @InjectTransactionManager()
 async prepareRenewal(id:string,now:string,current:{version:string;amount_minor:number;currency:string},@MedusaContext() context:Context={}){
  await this.lock(id,context)
  const before=await this.read(id,context),decision=planRenewal(before,now,current)
  return {...decision,state:decision.state===before?before:await this.save(decision.state,context)}
 }
 @InjectTransactionManager()
 async markUnknown(id:string,key:string,@MedusaContext() context:Context={}){
  await this.lock(id,context)
  const state=await this.read(id,context)
  if(state.renewal_key!==key)throw new Error('MEMBERSHIP_STALE_EXECUTION')
  return state.status==='unknown'?state:this.save(markRenewalUnknown(state),context)
 }
 @InjectTransactionManager()
 async applyReceipt(id:string,receipt:Receipt,now:string,@MedusaContext() context:Context={}){
  await this.lock(id,context)
  const before=await this.read(id,context),next=applyRenewalReceipt(before,receipt,now)
  const [claim]=await this.listMembershipReceipts({order_id:receipt.order_id},{take:1},context)
  if(claim){
   if(claim.membership_id!==id||claim.checkout_key!==receipt.checkout_key)throw new Error('MEMBERSHIP_ORDER_ALREADY_CLAIMED')
   if(next!==before)throw new Error('MEMBERSHIP_RECEIPT_STATE_MISMATCH')
   return {state:before,replayed:true}
  }
  if(next===before)throw new Error('MEMBERSHIP_RECEIPT_MISSING')
  await this.createMembershipReceipts({membership_id:id,order_id:receipt.order_id,checkout_key:receipt.checkout_key},context)
  return {state:await this.save(next,context),replayed:false}
 }
 @InjectTransactionManager()
 async stop(id:string,@MedusaContext() context:Context={}){
  await this.lock(id,context)
  const state=await this.read(id,context)
  return state.renew?this.save(stopRenewal(state),context):state
 }
 /** Serializes access reconciliation with membership changes. Callback touches native DB only.
  * Entitlements use their own module transaction; replays and the periodic reconciler recover gaps. */
 @InjectTransactionManager()
 async withAccessLock<T>(id:string,check:(state:Membership)=>Promise<{value:T;stop_renewal:boolean}>,@MedusaContext() context:Context={}):Promise<T>{
  await this.lock(id,context)
  const state=await this.read(id,context),result=await check(state)
  if(result.stop_renewal&&state.renew)await this.save(stopRenewal(state),context)
  return result.value
 }
 /** Future authenticated routes must pass the actor ID, never a customer ID from the body. */
 async findForCustomer(id:string,customerId:string){
  const [row]=await this.listMemberships({id,customer_id:customerId},{take:1})
  return row?this.checked(row as unknown as RecordRow):null
 }
}
export default MembershipModuleService
