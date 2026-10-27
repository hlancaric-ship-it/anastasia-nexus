import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { adminActor } from "../../../../../lib/observability/audit"
import { invoiceFileName, invoicePdfForOrder } from "../../../../../lib/invoice/load"

/** GET /admin/orders/:id/invoice – faktúra (alebo zálohová faktúra) ako PDF pre správcu. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store")
  if (!adminActor(req)) return res.status(401).json({ message: "Vyžaduje sa prihlásenie správcu." })
  try {
    const out = await invoicePdfForOrder(req.scope, String(req.params.id ?? ""))
    if (!out) return res.status(404).json({ message: "Objednávka sa nenašla." })
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `inline; filename="${invoiceFileName(out.model)}"`)
    return res.status(200).send(out.pdf)
  } catch {
    return res.status(503).json({ message: "Faktúru sa nepodarilo vytvoriť. Skúste to znova." })
  }
}
