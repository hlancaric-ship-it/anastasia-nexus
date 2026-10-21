import { authenticate, type MiddlewareRoute } from "@medusajs/framework/http"

const admin = [authenticate("user", ["session", "bearer"])]

export const mediaAdminMiddlewares: MiddlewareRoute[] = [
  { matcher: "/admin/media", method: ["GET", "POST"], middlewares: admin, bodyParser: { sizeLimit: "64kb" } },
  { matcher: "/admin/media/:key", method: ["DELETE"], middlewares: admin },
]
