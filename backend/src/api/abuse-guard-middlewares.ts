import type { MiddlewareRoute } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { claimLegalRate } from "../lib/legal/rate-limit"
import { normalizeEmail } from "../modules/auth-magic-link/policy"

/**
 * Brzdy proti zneužitiu verejného Store API (audit 27. 10. 2026):
 * - skúšanie ukradnutých kariet cez platobné relácie (card testing),
 * - zahltenie cudzej schránky formulármi (limit na cieľový e-mail, nie len na IP),
 * - blokovanie termínov hosťovskými košíkmi, skúšanie kódov kupónov,
 * - drahé zoznamy (limit/offset) a nezmyselné množstvá v košíku.
 * Počítadlá sú zdieľané v DB (všetky inštancie), ukladá sa len hash subjektu. Pri výpadku DB fail closed (503).
 */

const ip = (req: any) => req.ip || req.socket?.remoteAddress || "unknown-peer"
const customerOf = (req: any): string | undefined =>
  req.auth_context?.actor_type === "customer" ? req.auth_context.actor_id : undefined

type Rule = { bucket: string; limit: number; seconds: number; key: (req: any) => string | null | undefined }

function limitBy(...rules: Rule[]) {
  return async (req: any, res: any, next: any) => {
    try {
      const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
      for (const rule of rules) {
        const subject = rule.key(req)
        if (!subject) continue
        const result = await claimLegalRate(db, `${rule.bucket}:${subject}`, rule.limit, rule.seconds)
        if (!result.allowed) {
          res.setHeader("Retry-After", String(result.retryAfter))
          res.setHeader("Cache-Control", "no-store")
          return res.status(429).json({ error: "RATE_LIMITED", message: "Príliš veľa požiadaviek. Skúste to, prosím, neskôr." })
        }
      }
      return next()
    } catch {
      return res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Služba je dočasne nedostupná." })
    }
  }
}

const byIp = (bucket: string, limit: number, seconds: number): Rule => ({ bucket: `${bucket}-ip`, limit, seconds, key: ip })
const byCustomer = (bucket: string, limit: number, seconds: number): Rule => ({ bucket: `${bucket}-customer`, limit, seconds, key: customerOf })
const byBodyEmail = (bucket: string, limit: number, seconds: number): Rule => ({
  bucket: `${bucket}-email`, limit, seconds, key: (req) => normalizeEmail(req.body?.email),
})

export const STORE_LIST_LIMIT_MAX = 100
export const STORE_LIST_OFFSET_MAX = 10_000
export const CART_QUANTITY_MAX = 99

/** `limit`/`offset` mimo rozsah → 400 (inak jeden dopyt vytiahne celý katalóg alebo zaťaží DB hlbokým offsetom). */
export function capListQuery(req: any, res: any, next: any) {
  const query = req.query ?? {}
  const check = (name: string, max: number) => {
    const raw = query[name]
    if (raw === undefined) return true
    if (typeof raw !== "string" || !/^\d{1,9}$/.test(raw)) return false
    return Number(raw) <= max
  }
  if (!check("limit", STORE_LIST_LIMIT_MAX) || !check("offset", STORE_LIST_OFFSET_MAX)) {
    return res.status(400).json({ error: "INVALID_PAGINATION", message: `limit najviac ${STORE_LIST_LIMIT_MAX}, offset najviac ${STORE_LIST_OFFSET_MAX}.` })
  }
  return next()
}

/** Množstvo v košíku: celé číslo 1–99 (pri úprave aj 0 = odstrániť). */
export function capCartQuantity(allowZero: boolean) {
  return (req: any, res: any, next: any) => {
    const quantity = req.body?.quantity
    if (quantity === undefined && allowZero) return next()
    const min = allowZero ? 0 : 1
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < min || quantity > CART_QUANTITY_MAX) {
      return res.status(400).json({ error: "INVALID_QUANTITY", message: `Množstvo musí byť ${min} až ${CART_QUANTITY_MAX}.` })
    }
    return next()
  }
}

/** Položky pri založení košíka (`items[]`) majú rovnaký strop. */
export function capCartCreateItems(req: any, res: any, next: any) {
  const items = req.body?.items
  if (items === undefined) return next()
  if (!Array.isArray(items) || items.length > 50) return res.status(400).json({ error: "INVALID_ITEMS", message: "Košík môže mať najviac 50 položiek." })
  const bad = items.some((item: any) => !Number.isInteger(item?.quantity) || item.quantity < 1 || item.quantity > CART_QUANTITY_MAX)
  if (bad) return res.status(400).json({ error: "INVALID_QUANTITY", message: `Množstvo musí byť 1 až ${CART_QUANTITY_MAX}.` })
  return next()
}

export const abuseGuardMiddlewares: MiddlewareRoute[] = [
  { matcher: "/store/*", method: ["GET"], middlewares: [capListQuery] },
  // Card testing: každá platobná relácia = pokus o autorizáciu karty. Limit na IP aj na účet (účet sa dá založiť lacno).
  {
    matcher: "/store/payment-collections/:id/payment-sessions", method: ["POST"],
    middlewares: [limitBy(byIp("payment-session", 10, 600), byCustomer("payment-session", 10, 600))],
  },
  // Pokladňa: hosť má limit v nexusCartMiddlewares, prihlásený doteraz žiadny.
  { matcher: "/store/nexus-checkout", method: ["POST"], middlewares: [limitBy(byCustomer("nexus-checkout", 20, 600))] },
  { matcher: "/store/nexus-cart", method: ["POST"], middlewares: [limitBy(byCustomer("nexus-cart", 120, 60))] },
  { matcher: "/store/coupon-links", method: ["POST"], middlewares: [limitBy(byIp("coupon-link", 20, 60))] },
  { matcher: "/store/gift-vouchers/remove", method: ["POST"], middlewares: [limitBy(byIp("gift-voucher-remove", 30, 60))] },
  { matcher: "/store/gift-vouchers/recipients", method: ["POST"], middlewares: [limitBy(byIp("gift-voucher-recipients", 30, 60))] },
  { matcher: "/store/carts/:id/consents", method: ["POST"], middlewares: [limitBy(byIp("cart-consents", 30, 60))] },
  // Podržanie termínu hosťom: bez limitu by robot obsadil všetky termíny.
  { matcher: "/store/booking-guest", method: ["POST"], middlewares: [limitBy(byIp("booking-guest", 10, 600))] },
  { matcher: "/store/booking-guest/:id/cancel", method: ["POST"], middlewares: [limitBy(byIp("booking-guest-cancel", 20, 600))] },
  // Formuláre, ktoré posielajú e-mail na zadanú adresu: limit aj na cieľovú adresu (rotácia IP nepomôže).
  { matcher: "/store/booking-requests", method: ["POST"], middlewares: [limitBy(byBodyEmail("booking-request", 3, 3600))] },
  { matcher: "/store/contract-withdrawal", method: ["POST"], middlewares: [limitBy(byBodyEmail("contract-withdrawal", 3, 3600))] },
  { matcher: "/store/carts", method: ["POST"], middlewares: [capCartCreateItems] },
  { matcher: "/store/carts/:id/line-items", method: ["POST"], middlewares: [capCartQuantity(false)] },
  { matcher: "/store/carts/:id/line-items/:line_id", method: ["POST"], middlewares: [capCartQuantity(true)] },
]
