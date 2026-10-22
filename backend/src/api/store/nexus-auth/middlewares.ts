import { authenticate, type MiddlewareRoute } from "@medusajs/framework/http"

/**
 * Odhlásenie zákazníka: iba platný Bearer token zákazníka.
 * `bearer` (nie `session`) – Medusa token je bezstavový a odhlásenie ho zneplatní serverovo.
 */
export const nexusAuthStoreMiddlewares: MiddlewareRoute[] = [
  { matcher: "/store/nexus-auth/logout", method: ["POST"], middlewares: [authenticate("customer", ["bearer"])] },
]
