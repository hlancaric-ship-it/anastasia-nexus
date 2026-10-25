import { authenticate, type MiddlewareRoute } from "@medusajs/framework/http"
import { limitVoucherAttempts } from "./rate-limit"

/** Store namespace overuje publishable key; telo požiadaviek je malé (max. 10 obdarovaných × 300 znakov). */
export const giftVoucherStoreMiddlewares: MiddlewareRoute[] = [
  { matcher: "/store/gift-vouchers/apply", method: ["POST"], middlewares: [limitVoucherAttempts], bodyParser: { sizeLimit: "2kb" } },
  { matcher: "/store/gift-vouchers/remove", method: ["POST"], middlewares: [], bodyParser: { sizeLimit: "2kb" } },
  // Poukazy v zákazníckej zóne: len prihlásený zákazník.
  { matcher: "/store/gift-vouchers/mine", method: ["GET"], middlewares: [authenticate("customer", ["session", "bearer"])] },
  { matcher: "/store/gift-vouchers/mine/:id/pdf", method: ["GET"], middlewares: [authenticate("customer", ["session", "bearer"])] },
  { matcher: "/store/gift-vouchers/recipients", method: ["POST"], middlewares: [], bodyParser: { sizeLimit: "64kb" } },
]
