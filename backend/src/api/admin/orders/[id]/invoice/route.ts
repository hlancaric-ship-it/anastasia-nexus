import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { adminActor } from "../../../../../lib/observability/audit"
import { invoiceFileName, invoicePdfForOrder, loadInvoiceOrder } from "../../../../../lib/invoice/load"
import { buildPohodaDataPackXml, isAccountingEligibleOrder } from "../../../../../lib/invoice/pohoda"

/** GET /admin/orders/:id/invoice – faktúra (alebo zálohová faktúra) ako PDF alebo Pohoda XML (`?format=pohoda`) pre správcu. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store")
  if (!adminActor(req)) return res.status(401).json({ message: "Vyžaduje sa prihlásenie správcu." })
  try {
    const id = String(req.params.id ?? "")
    const format = String((req.query as Record<string, unknown> | undefined)?.format ?? "").trim().toLowerCase()
    if (format === "pohoda") {
      const order = await loadInvoiceOrder(req.scope, id)
      if (!order) return res.status(404).json({ message: "Objednávka sa nenašla." })
      if (!isAccountingEligibleOrder(order)) {
        return res.status(409).json({
          code: "NOT_TAX_INVOICE",
          message: "Do účtovníctva Pohoda vstupujú iba uhradené daňové doklady (FA). Nezaplatená objednávka má iba zálohovú faktúru (ZF).",
        })
      }
      const pack = buildPohodaDataPackXml([order])
      res.setHeader("Content-Type", "application/xml; charset=utf-8")
      res.setHeader("Content-Disposition", `attachment; filename="Pohoda-${pack.invoiceNumbers[0] ?? id}.xml"`)
      return res.status(200).send(pack.xml)
    }
    const out = await invoicePdfForOrder(req.scope, id)
    if (!out) return res.status(404).json({ message: "Objednávka sa nenašla." })
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `inline; filename="${invoiceFileName(out.model)}"`)
    return res.status(200).send(out.pdf)
  } catch {
    return res.status(503).json({ message: "Faktúru sa nepodarilo vytvoriť. Skúste to znova." })
  }
}
