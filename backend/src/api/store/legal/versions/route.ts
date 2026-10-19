import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { versions } from "../../../../modules/legal/policy"
import { sendLegalError } from "../../../legal-helpers"
export async function GET(req:MedusaRequest,res:MedusaResponse) {
 res.setHeader("Cache-Control","no-store")
 try { const config=versions(); const newsletter=process.env.NEWSLETTER_CONSENT_VERSION?.trim(); return res.json({terms_version:config.terms,privacy_version:config.privacy,newsletter_version:newsletter && newsletter.length<=100 ? newsletter : null}) }
 catch(error) {return sendLegalError(req,res,error)}
}
