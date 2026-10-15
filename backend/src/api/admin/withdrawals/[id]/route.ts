import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { legalActor,legalService,sendLegalError } from "../../../legal-helpers"
import { auditAdminChange } from "../../../../lib/observability/audit"
export async function POST(req:MedusaRequest,res:MedusaResponse) {
 res.setHeader("Cache-Control","no-store")
 try {
  const actor=legalActor(req,"user"), {row,before,replayed}=await legalService(req).transition(req.params.id,(req.body as any)?.status,actor)
  if(!replayed) await auditAdminChange(req,"withdrawal.status","legal_withdrawal",row.id,{status:before},{status:row.status})
  return res.json({withdrawal:row})
 }catch(error){return sendLegalError(req,res,error)}
}
