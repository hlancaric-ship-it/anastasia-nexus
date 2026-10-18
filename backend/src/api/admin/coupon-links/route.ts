import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { buildCouponUrl, localQrRenderer } from "./links"
import { validateLink } from "./validation"
import { generationInput, pageInput, saveRecord, listRecords, describeRecord } from "./registry"
import { adminActor, auditAdminChange } from "../../../lib/observability/audit"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!adminActor(req)) return res.status(401).json({ message: "Vyžaduje sa prihlásenie správcu." })
  const parsed = pageInput.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ message: "Skontrolujte vyhľadávanie a stránku." })
  try {
    const result = await listRecords(req.scope, parsed.data)
    return res.json({ ...result, links: await Promise.all(result.links.map((r: any) => describeRecord(req.scope, r))) })
  } catch { return res.status(503).json({ message: "Evidenciu QR kódov sa nepodarilo načítať. Skúste to znova." }) }
}
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: "Vyžaduje sa prihlásenie správcu." })
  const parsed = generationInput.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: "Skontrolujte kód produktu, kupón, množstvo a formát." })
  const { format, ...input } = parsed.data
  try {
    if (!await validateLink(req.scope, input)) return res.status(422).json({ message: "Produkt alebo kupón nie je dostupný." })
    const origin = process.env.COUPON_LINK_STOREFRONT_ORIGIN
    if (!origin) throw new Error("MISSING_STOREFRONT_ORIGIN")
    const url = buildCouponUrl(origin, input)
    const qr = await localQrRenderer.render(url, format)
    const { record, created } = await saveRecord(req.scope, input, url, "generated", actor, new Date())
    if (created) await auditAdminChange(req, "qr.created", "coupon_link", record.id, null, { source: "generated" })
    return res.json({ url: record.url, qr, record, created, discount_applied: false })
  } catch { return res.status(503).json({ message: "QR kód sa nepodarilo vytvoriť a uložiť. Skúste to znova; opakovaný pokus nevytvorí ďalší kupón." }) }
}
