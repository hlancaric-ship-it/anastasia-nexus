import { authenticate, type MiddlewareRoute } from "@medusajs/framework/http"

const admin = [authenticate("user", ["session", "bearer"])]

export const contentAdminMiddlewares: MiddlewareRoute[] = [
  { matcher: "/admin/content", method: ["GET", "POST"], middlewares: admin, bodyParser: { sizeLimit: "256kb" } },
  { matcher: "/admin/content/reset", method: ["POST"], middlewares: admin, bodyParser: { sizeLimit: "32kb" } },
]
