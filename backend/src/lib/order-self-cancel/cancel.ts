import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { cancelOrderWorkflow } from "@medusajs/medusa/core-flows"
import { GIFT_VOUCHER_MODULE } from "../../modules/gift-voucher"
import { LegalError } from "../../modules/legal/policy"
import { assertSelfCancelable } from "./policy"
/** PostgreSQL transaction is used ONLY for a process-independent mutex; native workflow owns writes/refunds. */
export async function withCancellationLock<T>(db:any,orderId:string,job:()=>Promise<T>):Promise<T> {
 return db.transaction(async(tx:any)=>{
  const {rows}=await tx.raw("SELECT pg_try_advisory_xact_lock(hashtext(?)) AS acquired",[`order-self-cancel:${orderId}`])
  if(rows[0]?.acquired!==true)throw new LegalError("ORDER_CANCEL_IN_PROGRESS",409)
  return job()
 })
}
export async function cancelOwnOrder(scope:MedusaContainer,orderId:string,customerId:string) {
 if(!/^[A-Za-z0-9_-]{1,120}$/.test(orderId))throw new LegalError("ORDER_NOT_FOUND",404)
 const query=scope.resolve(ContainerRegistrationKeys.QUERY) as any
 const load=async()=>{
  const {data}=await query.graph({entity:"order",fields:["id","customer_id","status","is_draft_order","metadata","fulfillments.id","fulfillments.canceled_at","fulfillments.shipped_at","fulfillments.delivered_at"],filters:{id:orderId,customer_id:customerId}})
  if(!data[0] || data[0].customer_id!==customerId)throw new LegalError("ORDER_NOT_FOUND",404)
  return data[0]
 }
 // Check owner before acquiring a mutex, so foreign requests cannot interfere with her order.
 await load()
 return withCancellationLock(scope.resolve(ContainerRegistrationKeys.PG_CONNECTION),orderId,async()=>{
  const order=await load()
  const entitlements=await (scope.resolve("entitlement") as any).listEntitlements({order_id:orderId},{take:1})
  const bookingService=scope.resolve("booking") as any
  const [bookings,count]=await bookingService.listAndCountBookings({order_id:orderId},{take:100})
  if(count>100)throw new LegalError("ORDER_CANCEL_MANUAL_REVIEW",409)
  // order.placed may not yet have attached a held booking: also check the immutable order snapshot link.
  if(typeof order.metadata?.booking_id==="string" && !bookings.some((b:any)=>b.id===order.metadata.booking_id)) {
   const [linked]=await bookingService.listBookings({id:order.metadata.booking_id},{take:1})
   if(!linked)throw new LegalError("ORDER_CANCEL_MANUAL_REVIEW",409)
   bookings.push(linked)
  }
  const [issuedVouchers,voucherCount]=await (scope.resolve(GIFT_VOUCHER_MODULE) as any).listAndCountGiftVouchers({source_order_id:orderId},{take:100})
  if(voucherCount>100)throw new LegalError("ORDER_CANCEL_MANUAL_REVIEW",409)
  assertSelfCancelable(order,customerId,{entitlements,bookings,issuedVouchers})
  try {
   // Existing workflow refunds captured payments, cancels authorizations and emits order.canceled.
   // Existing subscribers compensate voucher, booking and entitlement; no second financial implementation.
   await cancelOrderWorkflow(scope).run({input:{order_id:orderId}})
  }catch(error) {
   const type=(error as any)?.type
   if(type==="not_allowed" || type==="conflict")throw new LegalError("ORDER_CANCEL_NOT_AVAILABLE",409)
   throw error
  }
  return {id:orderId,status:"canceled"}
 })
}
