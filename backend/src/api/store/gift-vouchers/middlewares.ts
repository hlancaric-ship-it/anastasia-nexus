import type { MiddlewareRoute } from "@medusajs/framework/http"

/** Store namespace overuje publishable key; telo požiadaviek je malé (max. 10 obdarovaných × 300 znakov). */
export const giftVoucherStoreMiddlewares: MiddlewareRoute[] = [
  { matcher: "/store/gift-vouchers/apply", method: ["POST"], middlewares: [], bodyParser: { sizeLimit: "2kb" } },
  { matcher: "/store/gift-vouchers/remove", method: ["POST"], middlewares: [], bodyParser: { sizeLimit: "2kb" } },
  { matcher: "/store/gift-vouchers/recipients", method: ["POST"], middlewares: [], bodyParser: { sizeLimit: "64kb" } },
]
