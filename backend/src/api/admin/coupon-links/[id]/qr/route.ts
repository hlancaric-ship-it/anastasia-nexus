import { unavailable } from "../../failure"
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { adminActor } from "../../../../../lib/observability/audit"
import { getRecord, downloadInput } from "../../registry"
import { localQrRenderer } from "../../links"
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!adminActor(req)) return res.status(401).json({ message: "Vyžaduje sa prihlásenie správcu." })
  const parsed = downloadInput.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ message: "Vyberte formát SVG alebo PNG." })
  try {
    const record = await getRecord(req.scope, req.params.id)
    if (!record) return res.status(404).json({ message: "QR kód sa nenašiel." })
    // Immutable saved URL, even if the current storefront origin or coupon status changed.
    return res.json({ url: record.url, qr: await localQrRenderer.render(record.url, parsed.data.format) })
  } catch { return unavailable(req, res, "qr_detail_qr_unavailable", "QR kód sa nepodarilo pripraviť. Skúste to znova.") }
}
