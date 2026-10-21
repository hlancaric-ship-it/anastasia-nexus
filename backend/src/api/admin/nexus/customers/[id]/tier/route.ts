import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { adminActor, auditAdminChange } from "../../../../../../lib/observability/audit"
import { requireAdminCapability } from "../../../../../../lib/admin/guard"
import { applyLoyaltyAssignment, loyaltyTierGroups, readLoyaltyAssignment } from "../../../../../../lib/loyalty/assignment"
import { LOYALTY_TIER_CODE_RE } from "../../../../../../lib/loyalty/policy"

/**
 * POST /admin/nexus/customers/:id/tier – ručné zaradenie zákazníka do vernostnej úrovne.
 *
 * `tier_code: "ZR3"`  → ručné zaradenie s zámkom (automatické zaradenie ho neprepiše).
 * `tier_code: "automatic"` → zámok sa ruší a úroveň sa prepočíta podľa útraty.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store")
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: "Prihláste sa do administrácie." })
  // Úroveň určuje zľavu, preto ju mení iba vlastník administrácie.
  if (!(await requireAdminCapability(req, res, "pricing"))) return

  const raw = (req.body ?? {}) as { tier_code?: unknown }
  const tierCode = typeof raw.tier_code === "string" ? raw.tier_code.trim().toUpperCase() : ""
  if (!tierCode) return res.status(400).json({ message: "Vyberte úroveň alebo „automaticky“." })
  if (tierCode !== "AUTOMATIC" && !LOYALTY_TIER_CODE_RE.test(tierCode)) {
    return res.status(400).json({ message: "Neplatná úroveň. Použite napr. ZR1 až ZR4 alebo „automatic“." })
  }

  try {
    const customerId = req.params.id
    const before = await readLoyaltyAssignment(req.scope, customerId)
    if (!before.tier_code && !before.locked) {
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
      const { data } = await query.graph({ entity: "customer", fields: ["id"], filters: { id: customerId } })
      if (!data?.length) return res.status(404).json({ message: "Zákazník sa nenašiel." })
    }
    const automatic = tierCode === "AUTOMATIC"
    if (!automatic) {
      // Úroveň musí existovať medzi zákazníkmi skupinami (ZR1..ZR4 z bootstrapu).
      const known = await loyaltyTierGroups(req.scope)
      if (!known.some((tier) => tier.code === tierCode)) {
        return res.status(400).json({ message: `Úroveň ${tierCode} neexistuje. Dostupné: ${known.map((tier) => tier.code).join(", ") || "žiadne"}.` })
      }
    }
    const applied = await applyLoyaltyAssignment(req.scope, {
      customerId,
      tierCode: automatic ? null : tierCode,
      locked: !automatic,
    })
    await auditAdminChange(req, "admin.loyalty.customer.tier.update", "customer", customerId,
      { tier_code: before.tier_code, source: before.source, locked: before.locked },
      { tier_code: applied.tier_code, source: applied.source, locked: applied.locked })
    return res.status(200).json({ customer_id: customerId, ...applied })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("POST /admin/nexus/customers/:id/tier zlyhal", error as Error)
    return res.status(503).json({ message: "Úroveň sa nepodarilo nastaviť. Skúste to znova." })
  }
}
