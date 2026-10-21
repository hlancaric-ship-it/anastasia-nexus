import { authenticate, type MiddlewareRoute } from "@medusajs/framework/http"

const customer = [authenticate("customer", ["session", "bearer"])]
const admin = [authenticate("user", ["session", "bearer"])]
const small = { sizeLimit: "16kb" }

/** C5 chat: zákazník jen přihlášená, Lucia jen jako správce; těla malá (zpráva max 2000/5000 znaků). */
export const chatMiddlewares: MiddlewareRoute[] = [
  { matcher: "/store/chat/status", method: ["GET"], middlewares: customer },
  { matcher: "/store/chat/conversations", method: ["GET"], middlewares: customer },
  { matcher: "/store/chat/conversations", method: ["POST"], middlewares: customer, bodyParser: small },
  { matcher: "/store/chat/conversations/:id", method: ["GET"], middlewares: customer },
  { matcher: "/store/chat/conversations/:id/messages", method: ["POST"], middlewares: customer, bodyParser: small },
  { matcher: "/store/chat/conversations/:id/read", method: ["POST"], middlewares: customer, bodyParser: small },
  { matcher: "/admin/chat/conversations", method: ["GET"], middlewares: admin },
  { matcher: "/admin/chat/conversations/:id", method: ["GET"], middlewares: admin },
  { matcher: "/admin/chat/conversations/:id", method: ["POST"], middlewares: admin, bodyParser: small },
  { matcher: "/admin/chat/conversations/:id/messages", method: ["POST"], middlewares: admin, bodyParser: { sizeLimit: "32kb" } },
  { matcher: "/admin/chat/conversations/:id/read", method: ["POST"], middlewares: admin, bodyParser: small },
  { matcher: "/admin/chat/customers/:id/block", method: ["POST"], middlewares: admin, bodyParser: small },
]
