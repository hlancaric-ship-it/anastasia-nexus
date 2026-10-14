import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { fromMinor, parseSettingsInput, type GiftVoucherSettings } from "../../../../modules/gift-voucher/policy"
import { syncGiftVoucherProduct } from "../../../../modules/gift-voucher/product-sync"
import { requireAdmin, vouchersService } from "../shared"
import { auditAdminChange } from "../../../../lib/observability/audit"

/** Nastavenie v eurách pre admin (v DB centy). */
export function settingsResponse(settings: GiftVoucherSettings) {
  return { ...settings, values: settings.values_minor.map(fromMinor) }
}

/** GET /admin/vouchers/settings */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!requireAdmin(req, res)) return
  try {
    return res.json({ settings: settingsResponse(await vouchersService(req).getSettings()) })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("[gift-voucher] načítanie nastavení selhalo", error as Error)
    return res.status(500).json({ type: "unexpected_state", message: "Nastavenie sa nepodarilo načítať." })
  }
}

/**
 * POST /admin/vouchers/settings { enabled, values: [eur], validity_months, scope_type, category_ids, partial_redemption, delivery_method }
 * Uloží nastavenie a zosúladí produkt „Darčekový poukaz“ (varianty = hodnoty). Už vydané poukazy
 * si držia vlastný snapshot pravidiel, zmena platí len pre nové.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const actorId = requireAdmin(req, res)
  if (!actorId) return
  const parsed = parseSettingsInput(req.body)
  if (!parsed.ok) return res.status(400).json({ type: "invalid_data", errors: parsed.errors, message: "Skontrolujte nastavenie poukazov." })
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const settings = await vouchersService(req).saveSettings(parsed.value, actorId)
    // Persist the applied snapshot even when subsequent product synchronization fails.
    await auditAdminChange(req, "gift_voucher.settings.update", "gift_voucher_settings", "default", null, { ...settings })
    let product: Awaited<ReturnType<typeof syncGiftVoucherProduct>> | null = null
    try {
      product = await syncGiftVoucherProduct(req.scope, settings)
    } catch (error) {
      // Nastavenie je uložené; produkt sa dá zosúladiť opätovným uložením.
      logger.error("[gift-voucher] zosúladenie produktu selhalo", error as Error)
      return res.status(502).json({ type: "unexpected_state", settings: settingsResponse(settings), message: "Nastavenie je uložené, ale produkt poukazu sa nepodarilo upraviť. Uložte nastavenie znova." })
    }
    return res.json({ settings: settingsResponse(settings), product })
  } catch (error) {
    logger.error("[gift-voucher] uloženie nastavení selhalo", error as Error)
    return res.status(500).json({ type: "unexpected_state", message: "Nastavenie sa nepodarilo uložiť." })
  }
}
