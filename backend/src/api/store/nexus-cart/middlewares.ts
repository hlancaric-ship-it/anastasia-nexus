import { authenticate, type MedusaNextFunction, type MedusaRequest, type MedusaResponse, type MiddlewareRoute } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { assertCartShippingReady, CheckoutChoiceError } from "../../../lib/checkout/delivery-payment"

/**
 * Natívne Store API `POST /store/payment-collections/:id/payment-sessions` nesmie pripraviť platbu
 * pre košík bez platnej dopravy pre všetky prepravné profily (zákazníčka by zaplatila a objednávka
 * by nevznikla). Pokladňa používa /store/nexus-checkout/options; toto je poistka pre priame volanie.
 */
export async function requireShippingBeforePayment(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  try {
    const collectionId = (req.params as Record<string, string> | undefined)?.id
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
    const { data } = await query.graph({ entity: "cart_payment_collection", fields: ["cart_id", "payment_collection_id"], filters: { payment_collection_id: collectionId } })
    const cartId = data?.[0]?.cart_id
    if (cartId) await assertCartShippingReady(req.scope, cartId)
    return next()
  } catch (error) {
    if (error instanceof CheckoutChoiceError) return res.status(error.status).json({ ok: false, error: error.code, message: "Najprv zvoľte spôsob doručenia." })
    return next(error)
  }
}

/**
 * Autentizace zákaznice pro /store/nexus-cart a /store/nexus-checkout.
 *
 * SECURITY FIX (C1/C3/F3): tyto endpointy přijímají cart_id z klienta a
 * manipulují ceny / dokončují objednávky. Bez auth middleware může kdokoliv:
 *   - bruteforce kupónových kódů (C1),
 *   - dokončit checkout cizího košíku (C3),
 *   - manipulovat kupóny na cizích košících (F3).
 *
 * Ownership validace (cart.customer_id === auth.actor_id) se dělá uvnitř
 * route handleru po načtení košíku -- middleware ověří jen přihlášení.
 */
export const nexusCartMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/store/nexus-cart",
    method: ["POST"],
    middlewares: [authenticate("customer", ["session", "bearer"])],
  },
  {
    matcher: "/store/nexus-checkout",
    method: ["POST"],
    middlewares: [authenticate("customer", ["session", "bearer"])],
  },
  {
    matcher: "/store/nexus-checkout/options",
    method: ["GET", "POST"],
    middlewares: [authenticate("customer", ["session", "bearer"])],
  },
  {
    matcher: "/store/payment-collections/:id/payment-sessions",
    method: ["POST"],
    middlewares: [requireShippingBeforePayment],
  },
]
