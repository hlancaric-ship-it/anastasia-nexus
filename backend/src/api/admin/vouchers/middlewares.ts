import { authenticate, type MiddlewareRoute } from "@medusajs/framework/http"

const admin = [authenticate("user", ["session", "bearer"])]

export const giftVoucherAdminMiddlewares: MiddlewareRoute[] = [
  { matcher: "/admin/vouchers", method: ["GET"], middlewares: admin },
  { matcher: "/admin/vouchers/settings", method: ["GET", "POST"], middlewares: admin, bodyParser: { sizeLimit: "16kb" } },
  { matcher: "/admin/vouchers/refund", method: ["POST"], middlewares: admin, bodyParser: { sizeLimit: "4kb" } },
  { matcher: "/admin/vouchers/:id/void", method: ["POST"], middlewares: admin, bodyParser: { sizeLimit: "4kb" } },
]
