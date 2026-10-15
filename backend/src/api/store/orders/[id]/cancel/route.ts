import type { MedusaRequest,MedusaResponse } from "@medusajs/framework/http"
import { legalActor } from "../../../../legal-helpers"
import { LegalError } from "../../../../../modules/legal/policy"
import { cancelOwnOrder } from "../../../../../lib/order-self-cancel/cancel"
import { recordEvent } from "../../../../../lib/observability/events"
const MESSAGES:Record<string,string>={
 ORDER_NOT_FOUND:"Objednávka sa nenašla.",ORDER_CANCEL_IN_PROGRESS:"Zrušenie objednávky už prebieha.",
 ORDER_CANCEL_NOT_AVAILABLE:"Túto objednávku už nie je možné zrušiť v účte. Kontaktujte nás.",
 ORDER_ALREADY_FULFILLED:"Objednávka sa už vybavuje alebo bola odoslaná. Kontaktujte nás.",
 DIGITAL_CONTENT_ALREADY_AVAILABLE:"Digitálny obsah už bol sprístupnený. Obráťte sa na nás s požiadavkou.",
 BOOKING_CANCEL_TOO_LATE:"Lehota na zrušenie konzultácie v účte už uplynula. Kontaktujte nás.",
 ISSUED_VOUCHER_ALREADY_DELIVERED:"Poukaz z tejto objednávky už bol vystavený. Pre zrušenie nás kontaktujte.",
}
export async function POST(req:MedusaRequest,res:MedusaResponse) {
 res.setHeader("Cache-Control","no-store")
 try {
  const customerId=legalActor(req,"customer"),order=await cancelOwnOrder(req.scope,req.params.id,customerId)
  await recordEvent(req.scope,"info","checkout","order_self_canceled",{order_id:order.id,customer_id:customerId})
  return res.json({order})
 }catch(error) {
  const known=error instanceof LegalError,code=known?error.code:"ORDER_CANCEL_UNAVAILABLE",status=known?error.status:503
  await recordEvent(req.scope,status>=500?"error":"warn","checkout","order_self_cancel_rejected",{order_id:req.params.id,error_code:code,http_status:status})
  return res.status(status).json({error:code,message:MESSAGES[code] ?? "Požiadavku sa teraz nepodarilo vybaviť. Skúste to neskôr."})
 }
}
