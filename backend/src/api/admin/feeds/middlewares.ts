import { authenticate, type MiddlewareRoute } from "@medusajs/framework/http"

const admin = [authenticate("user", ["session", "bearer"])]

export const feedAdminMiddlewares: MiddlewareRoute[] = [
  { matcher: "/admin/feeds", method: ["GET"], middlewares: admin },
]
