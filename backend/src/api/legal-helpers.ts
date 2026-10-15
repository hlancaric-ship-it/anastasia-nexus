import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { LegalError } from "../modules/legal/policy"
export const legalService=(req:MedusaRequest):any=>req.scope.resolve("legal")
export function legalActor(req: any, type:"user"|"customer") {
  if(req.auth_context?.actor_type!==type || !req.auth_context.actor_id) throw new LegalError("UNAUTHORIZED",401)
  return req.auth_context.actor_id as string
}
export function sendLegalError(req:MedusaRequest,res:MedusaResponse,error:unknown) {
  if(error instanceof LegalError) return res.status(error.status).json({error:error.code,message:error.code==="TERMS_NOT_ACCEPTED"?"Pred dokončením objednávky prijmite aktuálne obchodné podmienky a potvrďte oboznámenie s ochranou súkromia.":"Požiadavku sa nepodarilo vybaviť. Skontrolujte údaje alebo to skúste neskôr."})
  req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("[legal] operation failed")
  return res.status(503).json({error:"LEGAL_UNAVAILABLE",message:"Služba je dočasne nedostupná. Skúste to neskôr."})
}
export const legalPage=(q:any)=>({take:Math.min(100,Math.max(1,Number(q?.limit)||50)),skip:Math.max(0,Number(q?.offset)||0),order:{created_at:"DESC"}})
export async function ownedOrder(req:MedusaRequest,id:string,customer:string) {
  const {data}=await (req.scope.resolve(ContainerRegistrationKeys.QUERY) as any).graph({entity:"order",fields:["id","customer_id","email","status","items.id","items.quantity","fulfillments.delivered_at","payment_collections.payments.captured_at"],filters:{id,customer_id:customer}})
  if(!data[0] || data[0].customer_id!==customer) throw new LegalError("ORDER_NOT_FOUND",404)
  return data[0]
}
