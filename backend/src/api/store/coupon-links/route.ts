import type { MedusaStoreRequest, MedusaResponse } from "@medusajs/framework/http"
import { linkInput } from "../../admin/coupon-links/links"
import { validateLink } from "../../admin/coupon-links/validation"

/** Read-only preflight. Never claims a discount has been applied. */
export async function POST(req: MedusaStoreRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  const parsed = linkInput.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: "Neplatný odkaz na kupón." })
  const channels = req.publishable_key_context?.sales_channel_ids
  if (!channels?.length) return res.status(401).json({ message: "Chýba prístup k predajnému kanálu." })
  try {
    const target = await validateLink(req.scope, parsed.data, channels)
    if (!target) return res.status(422).json({ code_valid: false, discount_applied: false, message: "Produkt alebo kupón nie je dostupný." })
    return res.json({
      code_valid: true, validation_scope: "CODE_AVAILABILITY_ONLY", discount_applied: false,
      activation_status: "PENDING_PRICING_INTEGRATION", destination: "/kosik",
      ...target, quantity: parsed.data.ks,
    })
  } catch {
    return res.status(503).json({ message: "Overenie kupónu je dočasne nedostupné." })
  }
}
