import { authenticate, type MiddlewareRoute } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { claimLegalRate } from "../../../lib/legal/rate-limit"

const admin = [authenticate("user", ["session", "bearer"])]

/** Verejné hlasovanie a kliknutia: brzda na IP (zdieľané počítadlo v DB, pri výpadku fail closed). */
function byIp(bucket: string, limit: number, seconds: number) {
  return async (req: any, res: any, next: any) => {
    res.setHeader("Cache-Control", "no-store")
    try {
      const ip = req.ip || req.socket?.remoteAddress || "unknown-peer"
      const result = await claimLegalRate(req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION), `${bucket}:${ip}`, limit, seconds)
      if (result.allowed) return next()
      res.setHeader("Retry-After", String(result.retryAfter))
      return res.status(429).json({ error: "RATE_LIMITED", message: "Príliš veľa požiadaviek. Skúste to, prosím, neskôr." })
    } catch {
      return res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Služba je dočasne nedostupná." })
    }
  }
}

export const novinkyMiddlewares: MiddlewareRoute[] = [
  { matcher: "/admin/novinky", method: ["GET", "PUT"], middlewares: admin, bodyParser: { sizeLimit: "512kb" } },
  { matcher: "/store/novinky/polls/:postId/vote", method: ["POST"], middlewares: [byIp("novinky-vote-ip", 30, 3600)], bodyParser: { sizeLimit: "2kb" } },
  { matcher: "/store/novinky/ads/:slot/click", method: ["POST"], middlewares: [byIp("novinky-click-ip", 60, 3600)], bodyParser: { sizeLimit: "2kb" } },
]
