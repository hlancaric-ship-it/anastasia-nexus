import type { MedusaRequest,MedusaResponse } from "@medusajs/framework/http"
import { legalActor,sendLegalError } from "../../../../../legal-helpers"
import { privacyService } from "../../../../../customer-privacy-helpers"
import { auditAdminChange } from "../../../../../../lib/observability/audit"
async function write(req:MedusaRequest,res:MedusaResponse,remove:boolean) {
 res.setHeader("Cache-Control","no-store")
 try {
  const actor=legalActor(req,"user"),note=await privacyService(req).writeNote(req.params.id,req.params.note_id,(req.body as any)?.body,actor,remove)
  await auditAdminChange(req,remove?"customer.note_deleted":"customer.note_updated","customer_note",note.id,null,{customer_id:req.params.id,operation:remove?"delete":"update"})
  return res.json(remove?{id:note.id,deleted:true}:{note})
 }catch(error){return sendLegalError(req,res,error)}
}
export const POST=(req:MedusaRequest,res:MedusaResponse)=>write(req,res,false)
export const DELETE=(req:MedusaRequest,res:MedusaResponse)=>write(req,res,true)
