import { authenticate, type MiddlewareRoute } from "@medusajs/framework/http"

const admin = [authenticate("user", ["session", "bearer"])]

export const carrierAdminMiddlewares: MiddlewareRoute[] = [
  { matcher: "/admin/carriers", method: ["GET"], middlewares: admin },
  { matcher: "/admin/carriers", method: ["POST"], middlewares: admin, bodyParser: { sizeLimit: "16kb" } },
]
