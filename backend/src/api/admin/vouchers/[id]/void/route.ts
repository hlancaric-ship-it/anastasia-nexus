import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { maskedVoucher } from "../../../../../modules/gift-voucher/service"
import { requireAdmin, sendAdminError, vouchersService } from "../../shared"
import { auditAdminChange } from "../../../../../lib/observability/audit"

/** POST /admin/vouchers/:id/void { reason } – ručné zneplatnenie (zostatok → 0, záznam v histórii). */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const actorId = requireAdmin(req, res)
  if (!actorId) return
  const id = req.params?.id
  if (!id || !/^gv_[A-Za-z0-9]{1,64}$/.test(id)) return res.status(400).json({ type: "invalid_data", message: "Chýba ID poukazu." })
  const raw = (req.body as { reason?: unknown } | undefined)?.reason
  const reason = typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 300) : ""
  if (!reason) return res.status(400).json({ type: "invalid_data", message: "Uveďte dôvod zneplatnenia." })
  try {
    const voucher = await vouchersService(req).voidVoucher({ id, reason, actor_id: actorId })
    await auditAdminChange(req, "gift_voucher.void", "gift_voucher", id, null, { status: voucher.status, balance_minor: voucher.balance })
    return res.json({ voucher: maskedVoucher(voucher) })
  } catch (error) {
    return sendAdminError(req, res, error, "zneplatnenie poukazu")
  }
}
