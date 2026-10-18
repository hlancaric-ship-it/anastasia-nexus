import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { adminActor, auditAdminChange } from "../../../../../lib/observability/audit"
import { getRecord, deactivateInput } from "../../registry"
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!adminActor(req)) return res.status(401).json({ message: "Vyžaduje sa prihlásenie správcu." })
  const parsed = deactivateInput.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: "Na potvrdenie zadajte kód kupónu." })
  try {
    const record = await getRecord(req.scope, req.params.id)
    if (!record) return res.status(404).json({ message: "QR kód sa nenašiel." })
    if (parsed.data.confirmation !== record.coupon_code) return res.status(409).json({ message: "Potvrdenie nezodpovedá kupónu. Nič sa nezmenilo." })
    const service = req.scope.resolve(Modules.PROMOTION)
    const matches = await service.listPromotions({ code: record.coupon_code }, { take: 2 })
    if (matches.length !== 1) return res.status(409).json({ message: "Kupón sa nedá jednoznačne dohľadať. Nič sa nezmenilo." })
    const p = matches[0]
    if (p.status !== "inactive") {
      await service.updatePromotions({ id: p.id, status: "inactive" })
      await auditAdminChange(req, "qr.coupon_deactivated", "promotion", p.id, { status: p.status }, { status: "inactive" })
    }
    return res.json({ ok: true, message: "Kupón je vypnutý pre všetky odkazy, ktoré ho používajú. Doterajšie čerpanie zostáva zachované." })
  } catch { return res.status(503).json({ message: "Stav kupónu sa nepodarilo potvrdiť. Obnovte detail pred ďalším pokusom." }) }
}
