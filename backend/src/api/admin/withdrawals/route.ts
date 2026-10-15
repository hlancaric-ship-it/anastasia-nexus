import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { legalActor,legalPage,legalService,sendLegalError } from "../../legal-helpers"
export async function GET(req:MedusaRequest,res:MedusaResponse) {
 res.setHeader("Cache-Control","no-store")
 try {legalActor(req,"user"); const [withdrawals,count]=await legalService(req).listAndCountLegalWithdrawals({},legalPage(req.query));return res.json({withdrawals,count})}
 catch(error){return sendLegalError(req,res,error)}
}
