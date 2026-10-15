import type { MedusaRequest,MedusaResponse } from "@medusajs/framework/http"
import { legalActor,sendLegalError } from "../../../../legal-helpers"
import { privacyService,erasureDTO } from "../../../../customer-privacy-helpers"
export async function POST(req:MedusaRequest,res:MedusaResponse) {
 res.setHeader("Cache-Control","no-store")
 try {const row=await privacyService(req).requestErasure(legalActor(req,"customer"));return res.status(202).json({request:erasureDTO(row)})}
 catch(error){return sendLegalError(req,res,error)}
}
