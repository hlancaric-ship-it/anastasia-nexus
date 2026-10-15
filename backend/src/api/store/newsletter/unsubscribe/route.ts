import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { legalService, sendLegalError } from "../../../legal-helpers"
export async function POST(req:MedusaRequest,res:MedusaResponse) {
 res.setHeader("Cache-Control","no-store")
 try{return res.json(await legalService(req).unsubscribe((req.body as any)?.token ?? ""))}catch(error){return sendLegalError(req,res,error)}
}
