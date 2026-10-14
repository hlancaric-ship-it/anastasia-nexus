import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { fromMinor, toMinor } from "../../../../modules/gift-voucher/policy"
import { requireAdmin, sendAdminError, vouchersService } from "../shared"

/**
 * POST /admin/vouchers/refund { order_id, amount, idempotency_key, note? }
 * Vratka (aj čiastočná) časti objednávky zaplatenej poukazom späť na poukaz. Strop = čiastka
 * čerpaná objednávkou − už vrátené. `idempotency_key` chráni pred dvojitým kliknutím.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const actorId = requireAdmin(req, res)
  if (!actorId) return
  const body = (req.body ?? {}) as Record<string, unknown>
  const orderId = typeof body.order_id === "string" && /^order_[A-Za-z0-9]{1,64}$/.test(body.order_id) ? body.order_id : null
  const amount = typeof body.amount === "number" ? toMinor(body.amount) : NaN
  const key = typeof body.idempotency_key === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(body.idempotency_key) ? body.idempotency_key : null
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : null
  if (!orderId || !key) return res.status(400).json({ type: "invalid_data", message: "Chýba objednávka alebo idempotentný kľúč." })
  if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ type: "invalid_data", message: "Zadajte kladnú sumu v eurách." })
  try {
    const refunds = await vouchersService(req).refundOrderToVoucher({ order_id: orderId, amount_minor: amount, idempotency_key: `admin:${key}`, actor_id: actorId, note })
    return res.json({ refunds: refunds.map((r) => ({ voucher_id: r.voucher_id, amount: fromMinor(r.amount_minor), balance: fromMinor(r.balance_after) })), replayed: refunds.length === 0 })
  } catch (error) {
    return sendAdminError(req, res, error, "vrátenie na poukaz")
  }
}
