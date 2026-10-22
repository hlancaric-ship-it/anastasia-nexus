import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { legalActor, legalPage, legalService, sendLegalError } from "../../legal-helpers"

/** GET /admin/contract-withdrawals – záznamy online odstúpenia od zmluvy (časť C právnych textov). */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  try {
    legalActor(req, "user")
    const [withdrawals, count] = await legalService(req).listAndCountLegalContractWithdrawals({}, legalPage(req.query))
    return res.json({ withdrawals, count })
  } catch (error) {
    return sendLegalError(req, res, error)
  }
}
