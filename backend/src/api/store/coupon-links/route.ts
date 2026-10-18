import type { MedusaStoreRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { linkInput, legacyQuantity } from "../../admin/coupon-links/links"
import { validateLink, resolveLinkProduct } from "../../admin/coupon-links/validation"

const storeInput = linkInput.extend({
  kupon: z.string().trim().max(128).refine(v => !/[\u0000-\u001f\u007f]/.test(v)).default(""),
  ks: z.union([z.number().int().min(1).max(999), z.string().max(64).transform(legacyQuantity)]).default(1),
}).strict()

/** Read-only preflight. Never claims a discount has been applied. */
export async function POST(req: MedusaStoreRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  const parsed = storeInput.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: "Neplatný odkaz na kupón." })
  const channels = req.publishable_key_context?.sales_channel_ids
  if (!channels?.length) return res.status(401).json({ message: "Chýba prístup k predajnému kanálu." })
  try {
    const target = await resolveLinkProduct(req.scope, parsed.data, channels)
    if (!target) return res.status(422).json({ code_valid: false, discount_applied: false, message: "Produkt nie je dostupný." })
    const couponValid = parsed.data.kupon ? Boolean(await validateLink(req.scope, parsed.data, channels)) : false
    if (parsed.data.kupon && !couponValid) return res.status(422).json({ ...target, quantity: parsed.data.ks, code_valid: false, discount_applied: false, message: "Kupón nie je dostupný. Produkt môžete pridať bez neho." })
    return res.json({
      code_valid: couponValid, validation_scope: "CODE_AVAILABILITY_ONLY", discount_applied: false,
      activation_status: "PENDING_PRICING_INTEGRATION", destination: "/kosik",
      ...target, quantity: parsed.data.ks,
    })
  } catch {
    return res.status(503).json({ message: "Overenie kupónu je dočasne nedostupné." })
  }
}
