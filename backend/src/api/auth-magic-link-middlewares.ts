import type { MiddlewareRoute } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { normalizeEmail } from "../modules/auth-magic-link/policy"
import { claimAuthRate } from "../modules/auth-magic-link/state"
export async function limitMagicLink(req: any, res: any, next: any) {
  // Native auth uses decoded dynamic parameters, including percent-encoded paths.
  let provider = req.params?.auth_provider, actor = req.params?.actor_type
  if (!provider) {
    try {
      const parts = (req.path || "").split("/")
      provider = decodeURIComponent(parts[3] || "")
      actor = decodeURIComponent(parts[2] || "")
    } catch { return res.status(400).json({ error: "INVALID_AUTH_PATH" }) }
  }
  if (provider !== "magic-link") return next()
  if (actor !== "customer") return res.status(404).json({ error: "AUTH_PROVIDER_UNAVAILABLE" })
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
  { matcher: "/auth/:actor_type/:auth_provider", method: ["POST", "GET"], middlewares: [limitMagicLink], bodyParser: { sizeLimit: "4kb" } },
]
