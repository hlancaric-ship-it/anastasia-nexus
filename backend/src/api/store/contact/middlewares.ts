import type { MiddlewareRoute } from "@medusajs/framework/http"

/** Store namespace overuje publishable key; správa má najviac 2000 znakov. */
export const contactStoreMiddlewares: MiddlewareRoute[] = [
  { matcher: "/store/contact", method: ["POST"], middlewares: [], bodyParser: { sizeLimit: "16kb" } },
]
