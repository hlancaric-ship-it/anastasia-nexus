import type { MedusaRequest,MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { legalActor,sendLegalError } from "../../../../legal-helpers"
import { LegalError } from "../../../../../modules/legal/policy"
import { exportCustomerData } from "../../../../../lib/customer-privacy/export"
export async function GET(req:MedusaRequest,res:MedusaResponse) {
 res.setHeader("Cache-Control","no-store")
 try {
  const id=legalActor(req,"customer")
  if(req.query.customer_id && req.query.customer_id!==id)throw new LegalError("CUSTOMER_NOT_FOUND",404)
  const data=await exportCustomerData(req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION),id)
  const query=req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const orders:any[]=[]
  // Bounded batches avoid exceeding graph pagination defaults or query parameter limits.
  for(let i=0;i<data.orders.length;i+=100) {
   const {data:page}=await query.graph({entity:"order",fields:["id","customer_id","currency_code","total","subtotal","tax_total","shipping_total","discount_total","items.id","items.title","items.quantity","items.unit_price",...(["billing_address","shipping_address"].flatMap(prefix=>["first_name","last_name","company","address_1","address_2","city","country_code","province","postal_code","phone"].map(field=>`${prefix}.${field}`)))],filters:{id:data.orders.slice(i,i+100).map((o:any)=>o.id),customer_id:id},pagination:{take:100}})
   orders.push(...page.filter((o:any)=>o.customer_id===id).map((o:any)=>({...o,customer_id:undefined})))
  }
  res.setHeader("Content-Disposition",'attachment; filename="customer-data.json"')
  return res.json({...data,orders:data.orders.map((o:any)=>({...o,...orders.find((detail:any)=>detail.id===o.id)}))})
 }catch(error){return sendLegalError(req,res,error)}
}
