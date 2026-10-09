import { authenticate, type MiddlewareRoute } from "@medusajs/framework/http"

/** Integrator: spread into defineMiddlewares routes; keep global file owned by K4. */
export const couponLinkMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/coupon-links",
    method: ["POST"],
    middlewares: [authenticate("user", ["session", "bearer"])],
    bodyParser: { sizeLimit: "8kb" },
  },
  {
    matcher: "/store/coupon-links",
    method: ["POST"],
    middlewares: [], // Medusa Store namespace checks the publishable key; route checks channels too.
    bodyParser: { sizeLimit: "8kb" },
  },
]
