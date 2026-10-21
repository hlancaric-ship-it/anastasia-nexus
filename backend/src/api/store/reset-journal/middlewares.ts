import { authenticate, type MiddlewareRoute } from "@medusajs/framework/http"

/**
 * Zrkadielko a štruktúra programu sú len pre prihláseného zákazníka.
 * Integrátor ich musí zapojiť do src/api/middlewares.ts.
 */
export const resetJournalStoreMiddlewares: MiddlewareRoute[] = [
  { matcher: "/store/reset-journal", method: ["GET", "POST"], middlewares: [authenticate("customer", ["session", "bearer"])] },
  { matcher: "/store/reset-journal/:id", method: ["PATCH", "DELETE"], middlewares: [authenticate("customer", ["session", "bearer"])] },
  { matcher: "/store/reset-program", method: ["GET"], middlewares: [authenticate("customer", ["session", "bearer"])] },
]
