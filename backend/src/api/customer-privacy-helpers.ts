import type { MedusaRequest } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { LegalError } from "../modules/legal/policy"
export const privacyService=(req:MedusaRequest):any=>req.scope.resolve("customerPrivacy")
export async function privacyCustomer(req:MedusaRequest,id:string) {
 const {data}=await (req.scope.resolve(ContainerRegistrationKeys.QUERY) as any).graph({entity:"customer",fields:["id"],filters:{id}})
 if(!data[0])throw new LegalError("CUSTOMER_NOT_FOUND",404)
}
export const erasureDTO=(row:any)=>({id:row.id,customer_id:row.customer_id,status:row.status,created_at:row.created_at,completed_at:row.completed_at})
