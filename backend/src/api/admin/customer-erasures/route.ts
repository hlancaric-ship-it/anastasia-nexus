import type { MedusaRequest,MedusaResponse } from "@medusajs/framework/http"
import { legalActor,legalPage,sendLegalError } from "../../legal-helpers"
import { privacyService,erasureDTO } from "../../customer-privacy-helpers"
export async function GET(req:MedusaRequest,res:MedusaResponse) {
 res.setHeader("Cache-Control","no-store")
 try {legalActor(req,"user");const [rows,count]=await privacyService(req).listAndCountCustomerErasures({},legalPage(req.query));return res.json({requests:rows.map(erasureDTO),count})}
 catch(error){return sendLegalError(req,res,error)}
}
