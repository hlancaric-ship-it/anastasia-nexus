import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { legalActor, legalPage, legalService, sendLegalError } from "../../legal-helpers"
import { csvCell } from "../../../modules/legal/policy"
export async function GET(req:MedusaRequest,res:MedusaResponse) {
 res.setHeader("Cache-Control","no-store")
 try {
  legalActor(req,"user")
  const [rows,count]=await legalService(req).listAndCountNewsletterConsents({}, {...legalPage(req.query), select:["id","email","source","text_version","status","consented_at","unsubscribed_at"]})
  if(req.query.format==="csv") {
   const fields=["id","email","source","text_version","status","consented_at","unsubscribed_at"]
   res.setHeader("Content-Type","text/csv; charset=utf-8");res.setHeader("Content-Disposition",'attachment; filename="newsletter-consents.csv"')
   return res.send([fields.join(","),...rows.map((r:any)=>fields.map(f=>csvCell(r[f])).join(","))].join("\r\n"))
  }
  const publicRows=rows.map((r:any)=>Object.fromEntries(["id","email","source","text_version","status","consented_at","unsubscribed_at"].map(k=>[k,r[k]])))
  return res.json({consents:publicRows,count,limit:legalPage(req.query).take,offset:legalPage(req.query).skip})
 }catch(error){return sendLegalError(req,res,error)}
}
