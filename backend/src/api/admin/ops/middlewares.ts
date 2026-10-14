import { authenticate, type MiddlewareRoute } from "@medusajs/framework/http"

export const opsAdminMiddlewares: MiddlewareRoute[] = [
  { matcher: "/admin/ops/*", middlewares: [authenticate("user", ["session", "bearer"])] },
]
