import { authenticate, type MiddlewareRoute } from "@medusajs/framework/http"

export const bookingStoreMiddlewares: MiddlewareRoute[] = [
  { matcher: "/store/bookings", method: ["GET", "POST"], middlewares: [authenticate("customer", ["session", "bearer"])] },
  { matcher: "/store/bookings/:id/cancel", method: ["POST"], middlewares: [authenticate("customer", ["session", "bearer"])] },
  { matcher: "/store/bookings/:id/cart", method: ["POST"], middlewares: [authenticate("customer", ["session", "bearer"])] },
  { matcher: "/store/booking-requests", method: ["POST"], bodyParser: { sizeLimit: "8kb" } },
  // Prihlásený zákazník si termín naviaže na účet, hosť na košík – prihlásenie je voliteľné.
  { matcher: "/store/booking-requests/:id/claim", method: ["POST"], middlewares: [authenticate("customer", ["session", "bearer"], { allowUnauthenticated: true })], bodyParser: { sizeLimit: "4kb" } },
]
