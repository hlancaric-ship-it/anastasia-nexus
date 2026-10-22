import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { legalActor, legalService, sendLegalError } from "../../../legal-helpers"
import { auditAdminChange } from "../../../../lib/observability/audit"

/** GET /admin/contract-withdrawals/:id – detail jedného odstúpenia od zmluvy. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  try {
    legalActor(req, "user")
    const [withdrawal] = await legalService(req).listLegalContractWithdrawals({ id: req.params.id }, { take: 1 })
    if (!withdrawal) return res.status(404).json({ message: "Odstúpenie od zmluvy sa nenašlo." })
    return res.json({ withdrawal })
  } catch (error) {
    return sendLegalError(req, res, error)
  }
}

/** POST /admin/contract-withdrawals/:id – zmena stavu záznamu (received → processed → closed). */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  try {
    const actor = legalActor(req, "user")
    const { row, before, replayed } = await legalService(req).transitionContractWithdrawal(req.params.id, (req.body as any)?.status, actor)
    if (!replayed) await auditAdminChange(req, "contract_withdrawal.status", "legal_contract_withdrawal", row.id, { status: before }, { status: row.status })
    return res.json({ withdrawal: row })
  } catch (error) {
    return sendLegalError(req, res, error)
  }
}
