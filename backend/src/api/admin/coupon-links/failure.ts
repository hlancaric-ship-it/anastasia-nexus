import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { logEvent, type LoggerLike } from "../../../lib/observability/log"

/** Correlated operation signal only: never log URLs, coupon codes, request bodies or raw DB errors. */
export function unavailable(req: any, res: any, event: string, message: string) {
  try { logEvent(req.scope.resolve(ContainerRegistrationKeys.LOGGER) as LoggerLike, "error", "coupon", event, {}) } catch { /* Logging must not expose the original error or change the response. */ }
  return res.status(503).json({ message })
}
