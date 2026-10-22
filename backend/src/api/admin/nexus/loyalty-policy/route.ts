import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { adminActor, auditAdminChange } from "../../../../lib/observability/audit"
import { requireAdminCapability } from "../../../../lib/admin/guard"
import { normalizePolicy } from "../../../../lib/loyalty/policy"
import { readLoyaltySettingsFromStore, saveLoyaltySettingsToStore } from "../../../../lib/loyalty/settings"
import { syncLoyaltyPolicyToWorker } from "../../../../lib/nexus/loyalty-policy-sync"

/**
 * GET /admin/nexus/loyalty-policy – politika vernostných úrovní (zľavy, prahy, zapnutie).
 * PUT /admin/nexus/loyalty-policy – uloženie politiky a jej odoslanie do NEXUS Workera.
 *
 * Percentá sa nikdy nepočítajú v prehliadači: Worker ich dostane podepsaným
 * webhookom a použije ich pri výpočtu ceny.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store")
  if (!adminActor(req)) return res.status(401).json({ message: "Prihláste sa do administrácie." })
  try {
    const settings = await readLoyaltySettingsFromStore(req.scope)
    return res.status(200).json(settings)
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("GET /admin/nexus/loyalty-policy zlyhal", error as Error)
    return res.status(503).json({ message: "Politiku vernostných úrovní sa nepodarilo načítať. Skúste to znova." })
  }
}

export async function PUT(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store")
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: "Prihláste sa do administrácie." })
  // Cenovú politiku (zľavy a prahy) mení iba vlastník administrácie.
  if (!(await requireAdminCapability(req, res, "pricing"))) return
  const parsed = normalizePolicy((req.body ?? {}) as { tiers?: unknown })
  if (!parsed.ok) return res.status(400).json({ message: parsed.message })
  try {
    const before = await readLoyaltySettingsFromStore(req.scope)
    const settings = await saveLoyaltySettingsToStore(req.scope, parsed.policy.tiers, actor)
    await auditAdminChange(req, "admin.loyalty.policy.update", "store", "loyalty_policy",
      { tiers: before.tiers }, { tiers: settings.tiers })
    const sync = await syncLoyaltyPolicyToWorker(settings.tiers)
    return res.status(200).json({ ...settings, worker_sync: sync })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("PUT /admin/nexus/loyalty-policy zlyhal", error as Error)
    return res.status(503).json({ message: "Politiku sa nepodarilo uložiť. Skúste to znova." })
  }
}
