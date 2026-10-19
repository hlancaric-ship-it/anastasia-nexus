import { authenticate, type MiddlewareRoute } from "@medusajs/framework/http"

/** Integrator: spread into defineMiddlewares routes; keep global file owned by K4. */
export const couponLinkMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/coupon-links",
    method: ["GET", "POST"],
    middlewares: [authenticate("user", ["session", "bearer"])],
    bodyParser: { sizeLimit: "8kb" },
  },
  ...["/admin/coupon-links/import", "/admin/coupon-links/:id", "/admin/coupon-links/:id/qr", "/admin/coupon-links/:id/deactivate"].map(matcher => ({
    matcher, method: ["GET", "POST"] as ("GET" | "POST")[],
    middlewares: [authenticate("user", ["session", "bearer"])],
    bodyParser: { sizeLimit: "256kb" },
  })),
  {
    matcher: "/store/coupon-links",
    method: ["POST"],
    middlewares: [], // Medusa Store namespace checks the publishable key; route checks channels too.
    bodyParser: { sizeLimit: "8kb" },
  },
]
