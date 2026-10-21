import type { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { GET as getPolicy, PUT as putPolicy } from "../api/admin/nexus/loyalty-policy/route"
import { POST as setTier } from "../api/admin/nexus/customers/[id]/tier/route"
import { GET as listCustomers } from "../api/admin/nexus/loyalty-customers/route"
import { assignCustomerTierAutomatically } from "../lib/loyalty/auto-assign"
import { readLoyaltyAssignment } from "../lib/loyalty/assignment"
import { readLoyaltySettingsFromStore } from "../lib/loyalty/settings"

/**
 * Overenie toku „vernostná úroveň od nuly“ na lokálnej DB.
 *
 *   npx medusa exec ./src/scripts/e2e-loyalty-tiers.ts
 *
 * Postup: uloží politiku, ručne priradí zákazníčku úroveň (so zámkom), overí
 * členstvo v skupine, overí, že automatické priradenie zámok neprepisuje, a
 * overí, že zámok zrušený priradí úroveň podľa útraty. Na konci obnoví
 * pôvodnú politiku a zákazníčku zmaze.
 */

const ADMIN = { actor_type: "user", actor_id: "user_e2e" } as const
const CUSTOMER_EMAIL = "e2e.loyalty.tiers@example.invalid"

const makeRes = () => {
  const state: { status?: number; body?: any } = {}
  const res: any = {
    setHeader: () => res,
    status: (code: number) => { state.status = code; return res },
    json: (body: any) => { state.body = body; return res },
  }
  return { res, state }
}

export default async function e2eLoyaltyTiers({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as any
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const customers = container.resolve(Modules.CUSTOMER) as any
  const steps: string[] = []
  const fail = (message: string) => { throw new Error(message) }
  const check = (ok: boolean, label: string) => { if (!ok) fail(label); steps.push(`OK  ${label}`) }

  const original = await readLoyaltySettingsFromStore(container)
  let customerId = ""
  try {
    // 1) Politika: prázdna -> uložená (validácia zľavy a prahov).
    const empty = makeRes()
    await getPolicy({ body: {}, query: {}, params: {}, auth_context: ADMIN, scope: container } as any, empty.res)
    check(empty.state.body?.tiers?.length === original.tiers.length, "politika sa načíta")

    const policy = {
      tiers: [
        { code: "ZR1", name: "Bronze", discount_percent: 2, spend_threshold_eur: 0, enabled: true },
        { code: "ZR3", name: "Gold", discount_percent: 10, spend_threshold_eur: 500, enabled: true },
      ],
    }
    const saved = makeRes()
    await putPolicy({ body: policy, query: {}, params: {}, auth_context: ADMIN, scope: container } as any, saved.res)
    check(saved.state.status === 200, "politika sa uloží")
    check(saved.state.body?.tiers?.length === 2, "uložené sú dve úrovne")

    const invalid = makeRes()
    await putPolicy({ body: { tiers: [{ code: "ZR1", name: "Bronze", discount_percent: 80, spend_threshold_eur: null, enabled: true }] }, query: {}, params: {}, auth_context: ADMIN, scope: container } as any, invalid.res)
    check(invalid.state.status === 400, "zľava nad 50 % sa odmietne")

    // 2) Ručné priradenie zákazníčke.
    const created = await customers.createCustomers([{ email: CUSTOMER_EMAIL, first_name: "E2E", last_name: "Loyalty" }])
    customerId = created[0].id
    const assigned = makeRes()
    await setTier({ body: { tier_code: "ZR3" }, query: {}, params: { id: customerId }, auth_context: ADMIN, scope: container } as any, assigned.res)
    check(assigned.state.status === 200, "ručné priradenie zákazníčke prejde")
    check(assigned.state.body?.locked === true && assigned.state.body?.tier_code === "ZR3", "ručné priradenie má zámok")

    const assignment = await readLoyaltyAssignment(container, customerId)
    check(assignment.tier_code === "ZR3" && assignment.locked, "úroveň a zámok sa prečítajú")

    const { data: customerRows } = await query.graph({
      entity: "customer",
      fields: ["id", "groups.name", "groups.metadata"],
      filters: { id: customerId },
    } as any)
    const groups = (customerRows?.[0]?.groups ?? []) as Array<{ name?: string; metadata?: Record<string, unknown> | null }>
    check(groups.some((g) => g.metadata?.nexus_tier === "ZR3"), "zákazníčka je v skupine úrovne (cenový adapter ju uvidí)")
    check(groups.some((g) => g.metadata?.loyalty_lock === true), "zákazníčka je v skupine ručného zámoku")

    // 3) Automatické priradenie ručný zámok neprepisie.
    const automatic = await assignCustomerTierAutomatically(container, customerId)
    check(automatic.assigned === false && automatic.reason === "MANUAL_LOCK", "automatika ručný zámok neprepisie")

    // 4) Po zrušení zámku sa úroveň prepočíta podľa útraty (zákazníčka nemá objednávky).
    const released = makeRes()
    await setTier({ body: { tier_code: "automatic" }, query: {}, params: { id: customerId }, auth_context: ADMIN, scope: container } as any, released.res)
    check(released.state.status === 200 && released.state.body?.locked === false, "zámok sa dá zrušiť")
    const afterRelease = await assignCustomerTierAutomatically(container, customerId)
    check(afterRelease.assigned === true && afterRelease.tier_code === "ZR1", "po zrušení zámku sa úroveň prepočíta podľa útraty (bez útraty = základná úroveň)")

    // 5) Zoznam zákazníčiek s úrovňou (serverový filter).
    const list = makeRes()
    await listCustomers({ body: {}, query: { tier: "ZR3", limit: "50", offset: "0" }, params: {}, auth_context: ADMIN, scope: container } as any, list.res)
    check(list.state.status === 200, "zoznam zákazníčiek s úrovňou funguje")
    check(Array.isArray(list.state.body?.customers), "zoznam vracia zákazníčky")

    console.log("E2E_LOYALTY_TIERS " + JSON.stringify({ status: "PASS", steps }, null, 1))
  } finally {
    if (customerId) await customers.deleteCustomers([customerId]).catch(() => undefined)
    // Pôvodná politika sa obnoví (launch má mať prázdnu politiku).
    const store = container.resolve(Modules.STORE) as any
    const [row] = await store.listStores({}, { take: 1 })
    if (row) {
      const metadata = { ...(row.metadata ?? {}) }
      if (original.tiers.length) metadata.loyalty_policy = original
      else delete metadata.loyalty_policy
      await store.updateStores(row.id, { metadata }).catch(() => undefined)
    }
    logger.info("[e2e-loyalty-tiers] pôvodná politika obnovená")
  }
}
