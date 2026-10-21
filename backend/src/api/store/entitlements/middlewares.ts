import { authenticate, type MiddlewareRoute } from "@medusajs/framework/http"

/**
 * Povinná autentizace zákazník pro /store/entitlements.
 * Integrátor je musí zapojit do src/api/middlewares.ts:
 *   defineMiddlewares({ routes: [...entitlementStoreMiddlewares] })
 */
export const entitlementStoreMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/store/entitlements",
    method: ["GET"],
    middlewares: [authenticate("customer", ["session", "bearer"])],
  },
  {
    matcher: "/store/media-access",
    method: ["POST"],
    middlewares: [authenticate("customer", ["session", "bearer"])],
  },
]
