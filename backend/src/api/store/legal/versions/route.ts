import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { versions } from "../../../../modules/legal/policy"
import { sendLegalError } from "../../../legal-helpers"
export async function GET(req:MedusaRequest,res:MedusaResponse) {
 res.setHeader("Cache-Control","no-store")
 try { const config=versions(); return res.json({terms_version:config.terms,privacy_version:config.privacy}) }
 catch(error) {return sendLegalError(req,res,error)}
}
