import { authenticate, type MiddlewareRoute } from "@medusajs/framework/http"

/**
 * Autentizace zákazník pro /store/nexus-cart a /store/nexus-checkout.
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
]
