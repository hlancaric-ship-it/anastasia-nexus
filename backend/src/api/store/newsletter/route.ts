import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { normalizeEmail } from "../../../modules/auth-magic-link/policy"
import { legalService, sendLegalError } from "../../legal-helpers"
import { LegalError } from "../../../modules/legal/policy"
export async function POST(req:MedusaRequest,res:MedusaResponse) {
 res.setHeader("Cache-Control","no-store")
 try {
  const body=req.body as any, email=normalizeEmail(body?.email), version=process.env.NEWSLETTER_CONSENT_VERSION?.trim()
  if(!version || version.length>100) throw new LegalError("LEGAL_NOT_CONFIGURED",503)
  if(!email || body?.accepted!==true || body?.text_version!==version || typeof body?.source!=="string" || !/^[a-zA-Z0-9_-]{1,60}$/.test(body.source)) throw new LegalError("INVALID_NEWSLETTER_CONSENT")
  return res.status(200).json(await legalService(req).subscribe({email,source:body.source,text_version:version}))
 }catch(error){return sendLegalError(req,res,error)}
}
