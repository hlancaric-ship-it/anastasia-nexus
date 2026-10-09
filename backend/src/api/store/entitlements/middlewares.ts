import { authenticate, type MiddlewareRoute } from "@medusajs/framework/http"

/**
 * Povinná autentizace zákaznice pro /store/entitlements.
 * Integrátor je musí zapojit do src/api/middlewares.ts:
 *   defineMiddlewares({ routes: [...entitlementStoreMiddlewares] })
 */
export const entitlementStoreMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/store/entitlements",
    method: ["GET"],
    middlewares: [authenticate("customer", ["session", "bearer"])],
  },
]
