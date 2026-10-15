import { authenticate, type MiddlewareRoute } from "@medusajs/framework/http"

const admin = [authenticate("user", ["session", "bearer"])]

/** K9 kalendář Lucie: jen přihlášený správce, malá těla požadavků. */
export const bookingAdminMiddlewares: MiddlewareRoute[] = [
  { matcher: "/admin/booking/types", method: ["GET"], middlewares: admin },
  { matcher: "/admin/booking/types", method: ["POST"], middlewares: admin, bodyParser: { sizeLimit: "16kb" } },
  { matcher: "/admin/booking/types/:id", method: ["GET"], middlewares: admin },
  { matcher: "/admin/booking/types/:id", method: ["POST"], middlewares: admin, bodyParser: { sizeLimit: "16kb" } },
  { matcher: "/admin/booking/availability", method: ["GET"], middlewares: admin },
  { matcher: "/admin/booking/availability", method: ["POST"], middlewares: admin, bodyParser: { sizeLimit: "32kb" } },
]
