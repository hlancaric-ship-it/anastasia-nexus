import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { adminActor, auditAdminChange } from "../../../../../lib/observability/audit"
import { applyLoyaltyAssignment, loyaltyTierGroups } from "../../../../../lib/loyalty/assignment"
import { LOYALTY_TIER_CODE_RE } from "../../../../../lib/loyalty/policy"

/**
 * POST /admin/nexus/customers/tiers – hromadné zaradenie zákazníčiek.
 *
 * Tvar A: { tier_code: "ZR3", customer_ids: ["cus_1", "cus_2"] }  – jedna úroveň pre viac zákazníčiek.
 * Tvar B: { assignments: [{ customer_id: "cus_1", tier_code: "ZR3" }] } – každý zákazník iná úroveň.
 * Hodnota "AUTOMATIC" v tvare B znamená "zrušiť ručný zámok a nechať prepočítať".
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store")
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: "Prihláste sa do administrácie." })

  const body = (req.body ?? {}) as { tier_code?: unknown; customer_ids?: unknown; assignments?: unknown }
  const requested: Array<{ customer_id: string; tier_code: string }> = []
  if (Array.isArray(body.assignments)) {
    for (const item of body.assignments) {
      const entry = (item ?? {}) as { customer_id?: unknown; tier_code?: unknown }
      const customerId = typeof entry.customer_id === "string" ? entry.customer_id.trim() : ""
      const tierCode = typeof entry.tier_code === "string" ? entry.tier_code.trim().toUpperCase() : ""
      if (!customerId || !tierCode) return res.status(400).json({ message: "Každé priradenie musí mať zákazníka a úroveň." })
      if (tierCode !== "AUTOMATIC" && !LOYALTY_TIER_CODE_RE.test(tierCode)) {
        return res.status(400).json({ message: `Neplatná úroveň ${tierCode}.` })
      }
      requested.push({ customer_id: customerId, tier_code: tierCode })
    }
  }
  const sharedTier = typeof body.tier_code === "string" ? body.tier_code.trim().toUpperCase() : ""
  if (Array.isArray(body.customer_ids)) {
    if (!sharedTier) return res.status(400).json({ message: "Pri hromadnom zaradení vyberte úroveň." })
    if (sharedTier !== "AUTOMATIC" && !LOYALTY_TIER_CODE_RE.test(sharedTier)) {
      return res.status(400).json({ message: `Neplatná úroveň ${sharedTier}.` })
    }
    for (const customerId of body.customer_ids) {
      if (typeof customerId !== "string" || !customerId.trim()) continue
      requested.push({ customer_id: customerId.trim(), tier_code: sharedTier })
    }
  }
  if (!requested.length) return res.status(400).json({ message: "Vyberte aspoň jedného zákazníka." })
  if (requested.length > 200) return res.status(400).json({ message: "Naraz zaraďte najviac 200 zákazníčok naraz." })

  try {
    const known = await loyaltyTierGroups(req.scope)
    const unknown = requested.find((item) => item.tier_code !== "AUTOMATIC" && !known.some((tier) => tier.code === item.tier_code))
    if (unknown) {
      return res.status(400).json({ message: `Úroveň ${unknown.tier_code} neexistuje. Dostupné: ${known.map((tier) => tier.code).join(", ") || "žiadne"}.` })
    }
    const results: Array<{ customer_id: string; tier_code: string | null; source: string; locked: boolean }> = []
    for (const item of requested) {
      const automatic = item.tier_code === "AUTOMATIC"
      const applied = await applyLoyaltyAssignment(req.scope, {
        customerId: item.customer_id,
        tierCode: automatic ? null : item.tier_code,
        locked: !automatic,
      })
      results.push({ customer_id: item.customer_id, ...applied })
      await auditAdminChange(req, "admin.loyalty.customer.tier.update", "customer", item.customer_id,
        null, { tier_code: applied.tier_code, source: applied.source, locked: applied.locked })
    }
    return res.status(200).json({ updated: results.length, results })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("POST /admin/nexus/customers/tiers zlyhal", error as Error)
    return res.status(503).json({ message: "Zaradenie sa nepodarilo uložiť. Skúste to znova." })
  }
}
