import { authenticate, type MiddlewareRoute } from "@medusajs/framework/http"

export const nexusAuthAdminMiddlewares: MiddlewareRoute[] = [
  { matcher: "/admin/nexus-auth/logout-all", method: ["POST"], middlewares: [authenticate("user", ["session", "bearer"])] },
]
