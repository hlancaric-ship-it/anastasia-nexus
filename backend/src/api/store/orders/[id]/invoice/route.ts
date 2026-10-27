import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { invoiceFileName, invoicePdfForOrder } from "../../../../../lib/invoice/load"

/** GET /store/orders/:id/invoice – faktúra pre prihlásenú vlastníčku objednávky (vlastníctvo overuje middleware). */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store")
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
