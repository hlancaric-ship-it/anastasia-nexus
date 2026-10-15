import { authenticate, type MiddlewareRoute } from "@medusajs/framework/http"

const admin = [authenticate("user", ["session", "bearer"])]

export const emailTemplateAdminMiddlewares: MiddlewareRoute[] = [
  { matcher: "/admin/email-templates", method: ["GET"], middlewares: admin },
  { matcher: "/admin/email-templates/:template", method: ["GET", "DELETE"], middlewares: admin },
  { matcher: "/admin/email-templates/:template", method: ["POST"], middlewares: admin, bodyParser: { sizeLimit: "64kb" } },
  { matcher: "/admin/email-templates/:template/preview", method: ["POST"], middlewares: admin, bodyParser: { sizeLimit: "64kb" } },
]
