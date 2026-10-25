import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { customerOf, ownedVouchers, ownerView } from "./owned"

/** GET /store/gift-vouchers/mine: darčekové poukazy prihláseného zákazníka. Bez prihlásenia 401. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = customerOf(req)
  if (!customerId) return res.status(401).json({ type: "unauthorized", message: "Prihlásenie je povinné" })
  try {
    const rows = await ownedVouchers(req.scope, customerId)
    res.setHeader("Cache-Control", "private, no-store")
    return res.status(200).json({ vouchers: rows.map(ownerView), count: rows.length })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("GET /store/gift-vouchers/mine zlyhalo", error as Error)
    return res.status(500).json({ type: "unexpected_state", message: "Poukazy sa nepodarilo načítať" })
  }
}
