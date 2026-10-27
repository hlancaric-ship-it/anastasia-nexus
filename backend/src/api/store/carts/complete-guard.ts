import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { storedCouponCode } from "../../../lib/pricing/coupon"

/**
 * Natívne dokončenie košíka (`POST /store/carts/:id/complete`) neprochádza NEXUS repricingom.
 * Košík s kupónom dokončuje iba `/store/nexus-checkout`, ktorý pred spoločným
 * `completeCartWorkflow` hookom cenu znovu overí a atomicky rezervuje použitie kupónu.
 * Bez obmedzenia by sa mohol dokončiť košík so zastaralou cenou.
 *
 * Preto sa košík s kupónom dokončí len cez `/store/nexus-checkout` → 409 USE_NEXUS_CHECKOUT.
 * Kupón sa v obchode ukladá do `cart.metadata.nexus_coupon` (Medusa promotion sa na košík
 * nepripája, cenu počíta NEXUS Worker); kontrolujú sa oba zdroje – Medusa promotion na
 * košíku aj uložený kupón v metadátach.
 *
 * Interný checkout (`completeCartWorkflow`) sa z `/store/nexus-checkout` volá priamo a touto
 * trasou neprechádza; použitie rezervuje jeho validačný hook.
 */
export async function requireNexusCheckoutForCouponCart(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  try {
    const cartId = (req.params as Record<string, string> | undefined)?.id
    if (!cartId) return next()
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
    const { data } = await query.graph({ entity: "cart", fields: ["id", "metadata", "promotions.code"], filters: { id: cartId } })
    const cart = data?.[0]
    if (!cart) return next()
    const promotions = Array.isArray(cart.promotions) ? cart.promotions : []
    const promotionCode = promotions
      .map((promotion: any) => (typeof promotion?.code === "string" ? promotion.code.trim() : ""))
      .find(Boolean)
    const coupon = storedCouponCode(cart.metadata)
    if (!promotionCode && !coupon) return next()
    return res.status(409).json({
      ok: false,
      code: "USE_NEXUS_CHECKOUT",
      error: "USE_NEXUS_CHECKOUT",
      message: "Košík s kupónom sa dokončí len cez /store/nexus-checkout.",
    })
  } catch (error) {
    // Fail closed: bez spoľahlivého čítania košíka sa dokončenie nepustí (chyba DB = 500).
    return next(error)
  }
}
