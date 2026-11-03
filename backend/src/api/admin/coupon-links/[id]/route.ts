import { unavailable } from "../failure"
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { adminActor, auditAdminChange } from "../../../../lib/observability/audit"
import { getRecord, describeRecord, database, tenant } from "../registry"
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!adminActor(req)) return res.status(401).json({ message: "Vyžaduje sa prihlásenie správcu." })
  try {
    const record = await getRecord(req.scope, req.params.id)
    if (!record) return res.status(404).json({ message: "QR kód sa nenašiel." })
    return res.json({ link: await describeRecord(req.scope, record) })
  } catch { return unavailable(req, res, "qr_detail_unavailable", "QR kód sa nepodarilo načítať. Skúste to znova.") }
}

/** DELETE /admin/coupon-links/:id: QR odkaz zmizne zo zoznamu (soft delete). Kupón sa nemení. */
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!adminActor(req)) return res.status(401).json({ message: "Vyžaduje sa prihlásenie správcu." })
  try {
    const record = await getRecord(req.scope, req.params.id)
    if (!record) return res.status(404).json({ message: "QR kód sa nenašiel." })
    await database(req.scope)("coupon_link_record").where({ id: record.id, tenant_id: tenant() }).whereNull("deleted_at").update({ deleted_at: new Date() })
    await auditAdminChange(req, "qr.link_deleted", "coupon_link", record.id, { sku: record.sku, coupon_code: record.coupon_code }, null)
    return res.json({ ok: true, id: record.id, deleted: true })
  } catch { return unavailable(req, res, "qr_delete_unavailable", "QR kód sa nepodarilo zmazať. Skúste to znova.") }
}
