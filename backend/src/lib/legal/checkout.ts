import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { LegalError, isCurrentConsent } from "../../modules/legal/policy"
/** Authority is the legal module table, never client-writable cart metadata. */
export async function assertCartConsent(scope: Pick<MedusaContainer,"resolve">, cart: {id:string;customer_id?:string|null;completed_at?:unknown}) {
  if (cart.completed_at) return // completed-order replay must not require accepting a newer policy
  const rows=await (scope.resolve("legal") as any).listLegalConsents({cart_id:cart.id},{take:1})
  isCurrentConsent(rows[0],cart.customer_id ?? null)
}
export async function loadConsentCart(scope: Pick<MedusaContainer,"resolve">, id:string) {
  const {data}=await (scope.resolve(ContainerRegistrationKeys.QUERY) as any).graph({entity:"cart",fields:["id","customer_id","completed_at"],filters:{id}})
  if(!data[0]) throw new LegalError("CART_NOT_FOUND",404)
  return data[0]
}
