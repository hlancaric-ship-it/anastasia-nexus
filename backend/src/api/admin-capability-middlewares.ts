import { authenticate, type MedusaNextFunction, type MedusaRequest, type MedusaResponse, type MiddlewareRoute } from "@medusajs/framework/http"
import { adminCan, resolveAdminRole, type AdminCapability } from "../lib/admin/roles"

/**
 * Serverová hranica rolí (vlastník / asistent) pre natívne aj vlastné admin trasy.
 *
 * Skrytie sekcií v administrácii nie je bezpečnostná hranica: asistent by priamym volaním API
 * zmenil ceny, kupóny alebo poukazy. Každá trasa nižšie si rolu načíta z databázy (nikdy z klienta).
 * Autentifikácia je súčasťou poistky, aby nezáležalo na poradí registrácie middlewarov.
 * Tajný admin API kľúč (`actor_type: api-key`) prejde – kľúče smie zakladať len vlastník (`roles`).
 */
const adminAuth = authenticate("user", ["session", "bearer", "api-key"])
const WRITE: MiddlewareRoute["method"] = ["POST", "PUT", "PATCH", "DELETE"]
const ALL: MiddlewareRoute["method"] = ["GET", "POST", "PUT", "PATCH", "DELETE"]

async function roleAllows(req: MedusaRequest, capability: AdminCapability): Promise<"allow" | "deny" | "unauthenticated"> {
  const ctx = (req as any).auth_context
  if (ctx?.actor_type === "api-key" && ctx.actor_id) return "allow"
  if (ctx?.actor_type !== "user" || !ctx.actor_id) return "unauthenticated"
  return adminCan(await resolveAdminRole(req.scope as never, ctx.actor_id), capability) ? "allow" : "deny"
}

function deny(res: MedusaResponse, verdict: "deny" | "unauthenticated") {
  if (verdict === "unauthenticated") return res.status(401).json({ message: "Prihláste sa do administrácie." })
  return res.status(403).json({ code: "ADMIN_ROLE_FORBIDDEN", message: "Túto časť administrácie môže spravovať iba vlastník." })
}

export function requireCapability(capability: AdminCapability) {
  return async (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
    try {
      const verdict = await roleAllows(req, capability)
      return verdict === "allow" ? next() : deny(res, verdict)
    } catch {
      return res.status(503).json({ message: "Overenie oprávnenia je dočasne nedostupné." })
    }
  }
}

/**
 * Nájde neprázdny kľúč `prices` (ceny variantov) kdekoľvek v tele požiadavky – aj v dávkach a vnorených variantoch.
 * Prázdne `prices: []` (nový produkt bez ceny) cenu nemení a asistent ho smie poslať.
 */
export function bodyTouchesPrices(value: unknown, depth = 0): boolean {
  if (!value || typeof value !== "object" || depth > 6) return false
  if (Array.isArray(value)) return value.some((item) => bodyTouchesPrices(item, depth + 1))
  return Object.entries(value as Record<string, unknown>).some(([key, item]) => (key === "prices" && !(Array.isArray(item) && item.length === 0)) || bodyTouchesPrices(item, depth + 1))
}

/** Asistent smie upravovať produkty, ale nie ich ceny (doplnok k `pricing`). */
export async function rejectAssistantPriceChange(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  if (!bodyTouchesPrices(req.body)) return next()
  return requireCapability("pricing")(req, res, next)
}

const guard = (matcher: string, method: MiddlewareRoute["method"], capability: AdminCapability): MiddlewareRoute => ({
  matcher, method, middlewares: [adminAuth, requireCapability(capability)],
})

export const adminCapabilityMiddlewares: MiddlewareRoute[] = [
  // Ceny, zľavy, kupóny a poukazy (kódy poukazov sú peniaze – asistent ich ani nečíta).
  guard("/admin/coupon-links*", ALL, "pricing"),
  guard("/admin/vouchers*", ALL, "pricing"),
  guard("/admin/shop-prices*", WRITE, "pricing"),
  guard("/admin/promotions*", WRITE, "pricing"),
  guard("/admin/campaigns*", WRITE, "pricing"),
  guard("/admin/price-lists*", WRITE, "pricing"),
  guard("/admin/price-preferences*", WRITE, "pricing"),
  guard("/admin/nexus/loyalty-policy*", WRITE, "pricing"),
  guard("/admin/nexus/customers/*", WRITE, "pricing"),
  // Import produktov nesie ceny v súbore, ktorý middleware nevidí.
  guard("/admin/products/import*", WRITE, "pricing"),
  guard("/admin/products/imports*", WRITE, "pricing"),
  { matcher: "/admin/products*", method: WRITE, middlewares: [adminAuth, rejectAssistantPriceChange] },
  // Ručné udelenie a odobratie prístupu k digitálnemu obsahu.
  guard("/admin/entitlements*", WRITE, "access"),
  // Role, 2FA ostatných a tajné API kľúče (kľúč by obišiel kontrolu role).
  guard("/admin/api-keys*", ALL, "roles"),
  guard("/admin/nexus/admin-roles", WRITE, "roles"),
]
