import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { sendEmail } from "../../../lib/email/send"
import { orderUrl } from "../../../lib/notify/order"
import { legalActor,legalService,ownedOrder,sendLegalError } from "../../legal-helpers"
import { assertWithdrawalWindow,LegalError,withdrawalItems } from "../../../modules/legal/policy"
export async function POST(req:MedusaRequest,res:MedusaResponse) {
 res.setHeader("Cache-Control","no-store")
 try {
  const customer=legalActor(req,"customer"), body=req.body as any
  if(typeof body?.order_id!=="string") throw new LegalError("INVALID_ORDER")
  const order=await ownedOrder(req,body.order_id,customer)
  const items=withdrawalItems(body.items,order)
  if(body.reason!==undefined && (typeof body.reason!=="string" || body.reason.length>2000)) throw new LegalError("INVALID_REASON")
  // A retry returns its original receipt even after the fourteen-day window.
  const [existing]=await legalService(req).listLegalWithdrawals({order_id:order.id,customer_id:customer},{take:1})
  if(!existing) assertWithdrawalWindow(order)
  const {row,replayed}=await legalService(req).requestWithdrawal({order_id:order.id,customer_id:customer,items,reason:body.reason?.trim() || null})
  // Stable notification key also makes retries safe after provider failures.
  // Stable notification key also makes retries safe after provider failures (sendEmail dedupes by key).
  await sendEmail(req.scope,{to:order.email,template:"withdrawal-received-sk",idempotency_key:`withdrawal.received:${row.id}`,resource_id:row.id,resource_type:"withdrawal",
   data:{withdrawal_id:row.id,order_id:order.id,order_display_id:order.display_id!=null?String(order.display_id):null,received_at:new Date(row.created_at ?? Date.now()).toISOString(),url:orderUrl(order.id)}})
  return res.status(replayed?200:201).json({withdrawal:{id:row.id,order_id:row.order_id,status:row.status,items:row.items,created_at:row.created_at}})
 }catch(error){return sendLegalError(req,res,error)}
}
