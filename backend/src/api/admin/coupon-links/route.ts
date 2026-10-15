import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { adminInput, buildCouponUrl, localQrRenderer } from "./links"
import { validateLink } from "./validation"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!req.auth_context?.actor_id || req.auth_context.actor_type !== "user") {
    return res.status(401).json({ message: "Vyžaduje sa prihlásenie správcu." })
  }
  const parsed = adminInput.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: "Skontrolujte kód produktu, kupón, množstvo a formát." })
  const { format, ...input } = parsed.data
  try {
    if (!await validateLink(req.scope, input)) return res.status(422).json({ message: "Produkt alebo kupón nie je dostupný." })
    const origin = process.env.COUPON_LINK_STOREFRONT_ORIGIN
    if (!origin) throw new Error("MISSING_STOREFRONT_ORIGIN")
    const url = buildCouponUrl(origin, input)
    const qr = await localQrRenderer.render(url, format)
    return res.json({ url, qr, activation_status: "PENDING_PRICING_INTEGRATION" })
  } catch {
    return res.status(503).json({ message: "Generátor nie je dostupný. Skontrolujte konfiguráciu a závislosti." })
  }
}
