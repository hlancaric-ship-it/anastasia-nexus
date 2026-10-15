import type { MedusaRequest,MedusaResponse } from "@medusajs/framework/http"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { legalActor,sendLegalError } from "../../../../legal-helpers"
import { privacyService,erasureDTO } from "../../../../customer-privacy-helpers"
import { confirmErasure } from "../../../../../modules/customer-privacy/policy"
import { LegalError } from "../../../../../modules/legal/policy"
import { stateKey, sha256Hex } from "../../../../../modules/auth-magic-link/policy"
import { auditAdminChange } from "../../../../../lib/observability/audit"
export async function POST(req:MedusaRequest,res:MedusaResponse) {
 res.setHeader("Cache-Control","no-store")
 try {
  const actor=legalActor(req,"user"), service=privacyService(req)
  const [request]=await service.listCustomerErasures({id:req.params.id},{take:1})
  if(!request)throw new LegalError("ERASURE_NOT_FOUND",404)
  confirmErasure(req.body,request.customer_id)
  const prepared=await service.prepareErasure(request.id,actor)
  for(const email of (!prepared.replayed ? prepared.emails : [])) {
   await (req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any).raw("delete from auth_link_state where id = ?",[sha256Hex(email)])
   // Same public Auth service state API used by magic-link: consuming invalidates the cached token.
   await (req.scope.resolve(Modules.AUTH) as any).getAuthIdentityProviderService("magic-link").getState(stateKey(email))
  }
  const result=await service.completeErasure(request.id)
  if(!result.replayed)await auditAdminChange(req,"customer.erasure","customer_erasure",request.id,{status:"requested"},{status:"completed",customer_id:request.customer_id})
  return res.json({request:erasureDTO(result.row),replayed:result.replayed})
 }catch(error){return sendLegalError(req,res,error)}
}
