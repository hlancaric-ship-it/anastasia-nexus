import type { MiddlewareRoute } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { normalizeEmail } from "../modules/auth-magic-link/policy"
import { claimAuthRate } from "../modules/auth-magic-link/state"
export async function limitMagicLink(req: any, res: any, next: any) {
  try {
    const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    // req.ip follows the server's trusted-proxy configuration; never trust raw forwarded headers.
    const client = await claimAuthRate(db, `ip:${req.ip || "unknown"}`, 60, 900)
    let rate = client
    const email = normalizeEmail(req.body?.email)
    if (client.allowed && email && !req.body?.token) rate = await claimAuthRate(db, `email:${email}`, 3, 900)
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfter))
      return res.status(429).json({ error: "MAGIC_LINK_RATE_LIMITED", message: "Príliš veľa pokusov. Skúste to, prosím, neskôr." })
    }
    return next()
  } catch {
    return res.status(503).json({ error: "AUTH_SECURITY_UNAVAILABLE", message: "Prihlásenie je dočasne nedostupné." })
  }
}
export const authMagicLinkMiddlewares: MiddlewareRoute[] = [
  { matcher: "/auth/customer/magic-link", method: ["POST", "GET"], middlewares: [limitMagicLink], bodyParser: { sizeLimit: "4kb" } },
]
