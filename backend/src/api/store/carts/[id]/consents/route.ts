import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { legalService, sendLegalError } from "../../../../legal-helpers"
import { LegalError, validateAcceptance } from "../../../../../modules/legal/policy"
import { loadConsentCart } from "../../../../../lib/legal/checkout"
export async function POST(req:MedusaRequest,res:MedusaResponse) {
 res.setHeader("Cache-Control","no-store")
 try {
  const config=validateAcceptance(req.body)
  const cart=await loadConsentCart(req.scope,req.params.id)
  const auth=(req as any).auth_context
  if(cart.customer_id) {
   const actor=auth?.actor_type==="customer"?auth.actor_id:null
   // Medusa creates a guest customer_id from cart.email; it is not proof of a registered account.
   if(actor ? actor!==cart.customer_id : cart.customer?.has_account!==false) throw new LegalError("CART_NOT_FOUND",404)
  }
  if(cart.completed_at) throw new LegalError("CART_COMPLETED",409)
  const row=await legalService(req).accept({cart_id:cart.id,customer_id:cart.customer_id ?? null,terms_version:config.terms,privacy_version:config.privacy})
  return res.status(200).json({consent:{terms_version:row.terms_version,privacy_version:row.privacy_version,accepted_at:row.accepted_at}})
 } catch(error) {return sendLegalError(req,res,error)}
}
