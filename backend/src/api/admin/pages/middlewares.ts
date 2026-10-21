import { authenticate, type MiddlewareRoute } from "@medusajs/framework/http"

const admin = [authenticate("user", ["session", "bearer"])]

export const pageAdminMiddlewares: MiddlewareRoute[] = [
  { matcher: "/admin/pages", method: ["GET", "POST"], middlewares: admin, bodyParser: { sizeLimit: "256kb" } },
  { matcher: "/admin/pages/:slug", method: ["DELETE"], middlewares: admin },
]
