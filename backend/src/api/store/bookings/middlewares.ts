import { authenticate, type MiddlewareRoute } from "@medusajs/framework/http"

export const bookingStoreMiddlewares: MiddlewareRoute[] = [
  { matcher: "/store/bookings", method: ["GET", "POST"], middlewares: [authenticate("customer", ["session", "bearer"])] },
  { matcher: "/store/bookings/:id/cancel", method: ["POST"], middlewares: [authenticate("customer", ["session", "bearer"])] },
  { matcher: "/store/bookings/:id/cart", method: ["POST"], middlewares: [authenticate("customer", ["session", "bearer"])] },
]
