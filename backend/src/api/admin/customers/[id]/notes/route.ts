import type { MedusaRequest,MedusaResponse } from "@medusajs/framework/http"
import { legalActor,legalPage,sendLegalError } from "../../../../legal-helpers"
import { privacyService,privacyCustomer } from "../../../../customer-privacy-helpers"
import { auditAdminChange } from "../../../../../lib/observability/audit"
export async function GET(req:MedusaRequest,res:MedusaResponse) {
 res.setHeader("Cache-Control","no-store")
 try {legalActor(req,"user");await privacyCustomer(req,req.params.id);const [notes,count]=await privacyService(req).listAndCountCustomerNotes({customer_id:req.params.id},legalPage(req.query));return res.json({notes,count})}
 catch(error){return sendLegalError(req,res,error)}
}
export async function POST(req:MedusaRequest,res:MedusaResponse) {
 res.setHeader("Cache-Control","no-store")
 try {
  const actor=legalActor(req,"user"),note=await privacyService(req).writeNote(req.params.id,null,(req.body as any)?.body,actor)
  await auditAdminChange(req,"customer.note_created","customer_note",note.id,null,{customer_id:req.params.id})
  return res.status(201).json({note})
 }catch(error){return sendLegalError(req,res,error)}
}
