import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { voucherPdf } from "../../../../../../modules/gift-voucher/delivery"
import { customerOf, ownedVouchers } from "../../owned"

/** GET /store/gift-vouchers/mine/:id/pdf: PDF poukazu na tlač, len pre vlastníka. Cudzí poukaz je 404. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = customerOf(req)
  if (!customerId) return res.status(401).json({ type: "unauthorized", message: "Prihlásenie je povinné" })
  try {
    const id = String(req.params?.id || "")
    const voucher = (await ownedVouchers(req.scope, customerId)).find((v) => v.id === id)
    if (!voucher || voucher.status === "void") return res.status(404).json({ type: "not_found", message: "Poukaz neexistuje" })
    const pdf = await voucherPdf(voucher)
    res.setHeader("Cache-Control", "private, no-store")
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `attachment; filename="darcekovy-poukaz-${voucher.code_last4}.pdf"`)
    return res.status(200).send(pdf)
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("GET /store/gift-vouchers/mine/:id/pdf zlyhalo", error as Error)
    return res.status(500).json({ type: "unexpected_state", message: "PDF poukazu sa nepodarilo pripraviť" })
  }
}
