import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { GIFT_VOUCHER_MODULE } from "../../../modules/gift-voucher"
import type GiftVoucherModuleService from "../../../modules/gift-voucher/service"

/** Spoločná brána admin rout poukazov: prihlásený správca, žiadne cache. Vracia ID správcu alebo null (odpoveď už odoslaná). */
export function requireAdmin(req: AuthenticatedMedusaRequest, res: MedusaResponse): string | null {
  res.setHeader("Cache-Control", "no-store")
  if (!req.auth_context?.actor_id || req.auth_context.actor_type !== "user") {
    res.status(401).json({ message: "Vyžaduje sa prihlásenie správcu." })
    return null
  }
  return req.auth_context.actor_id
}

export const vouchersService = (req: AuthenticatedMedusaRequest) => req.scope.resolve(GIFT_VOUCHER_MODULE) as GiftVoucherModuleService

export const ADMIN_ERRORS: Record<string, [number, string]> = {
  GIFT_VOUCHER_INVALID: [404, "Poukaz neexistuje."],
  GIFT_VOUCHER_VOID: [409, "Poukaz je zneplatnený."],
  GIFT_VOUCHER_NO_REDEMPTION: [404, "Objednávka nebola platená poukazom."],
  GIFT_VOUCHER_REFUND_EXCEEDS_REDEEMED: [409, "Suma presahuje čiastku zaplatenú poukazom (po odpočítaní už vrátených súm)."],
  GIFT_VOUCHER_AMOUNT_INVALID: [400, "Zadajte kladnú sumu v eurách."],
}

export function sendAdminError(req: AuthenticatedMedusaRequest, res: MedusaResponse, error: unknown, context: string) {
  const code = error instanceof Error ? error.message : ""
  const known = ADMIN_ERRORS[code]
  if (known) return res.status(known[0]).json({ type: "invalid_data", code, message: known[1] })
  req.scope.resolve(ContainerRegistrationKeys.LOGGER).error(`[gift-voucher] ${context} selhalo`, error instanceof Error ? error : new Error("unknown"))
  return res.status(500).json({ type: "unexpected_state", message: "Operácia zlyhala. Skúste to znova." })
}
