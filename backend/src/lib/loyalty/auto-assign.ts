import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { netSpendFromOrders, tierForSpend } from "./policy"
import { readLoyaltySettingsFromStore } from "./settings"
import { applyLoyaltyAssignment, readLoyaltyAssignment } from "./assignment"

/**
 * Automatické zaradenie zákazníky do vernostnej úrovne.
 *
 * Po zaplatení objednávky sa prepočíta celková útrata zákazníky a podľa prahov
 * v politike sa priradí úroveň. Ručný zámok (správca nastavil úroveň ručne)
 * sa NEPREPIŠE – automatické zaradenie zákazníčku nikdy nedemóduje.
 */

export type AutoAssignResult = {
  assigned: boolean
  tier_code: string | null
  spend_total_eur: number
  reason: "MANUAL_LOCK" | "POLICY_EMPTY" | "NO_THRESHOLD" | "UNCHANGED" | "ASSIGNED"
}

/** Celková zaplatená útrata zákazníky (zachytené platby mínus refundy). */
export async function customerSpendTotal(scope: MedusaContainer, customerId: string): Promise<number> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "status", "total", "payment_collections.captured_amount", "payment_collections.refunded_amount"],
    filters: { customer_id: customerId },
  })
  const orders = ((data ?? []) as Array<{ status?: string | null; total?: unknown; payment_collections?: Array<{ captured_amount?: unknown; refunded_amount?: unknown }> }>).map((order) => {
    const captured = (order.payment_collections ?? []).reduce((sum, collection) => sum + (Number(collection.captured_amount) || 0), 0)
    const refunded = (order.payment_collections ?? []).reduce((sum, collection) => sum + (Number(collection.refunded_amount) || 0), 0)
    return { status: order.status, total: order.total, captured, refunded }
  })
  return netSpendFromOrders(orders)
}

/** Zákazníčka objednávky (na automatické zaradenie po zaplatení). */
export async function orderCustomerId(scope: MedusaContainer, orderId: string): Promise<string | null> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data } = await query.graph({ entity: "order", fields: ["id", "customer_id"], filters: { id: orderId } })
  const customerId = (data ?? [])[0]?.customer_id
  return typeof customerId === "string" && customerId ? customerId : null
}

/**
 * Přepočítá úroveň zákazníky podľa jej útraty a prahů v politice.
 * Bez nastavenej politiky (prázdné úrovně) sa NIKDY nič nemení.
 */
export async function assignCustomerTierAutomatically(scope: MedusaContainer, customerId: string): Promise<AutoAssignResult> {
  const assignment = await readLoyaltyAssignment(scope, customerId)
  const spend = await customerSpendTotal(scope, customerId)
  if (assignment.locked) {
    return { assigned: false, tier_code: assignment.tier_code, spend_total_eur: spend, reason: "MANUAL_LOCK" }
  }
  const policy = await readLoyaltySettingsFromStore(scope)
  const usable = policy.tiers.filter((tier) => tier.enabled && tier.spend_threshold_eur !== null)
  if (!usable.length) {
    return { assigned: false, tier_code: assignment.tier_code, spend_total_eur: spend, reason: "POLICY_EMPTY" }
  }
  const tier = tierForSpend(policy.tiers, spend)
  if (!tier) {
    if (assignment.tier_code) await applyLoyaltyAssignment(scope, { customerId, tierCode: null, locked: false })
    return { assigned: false, tier_code: null, spend_total_eur: spend, reason: "NO_THRESHOLD" }
  }
  if (assignment.tier_code === tier.code) {
    return { assigned: false, tier_code: tier.code, spend_total_eur: spend, reason: "UNCHANGED" }
  }
  await applyLoyaltyAssignment(scope, { customerId, tierCode: tier.code, locked: false })
  return { assigned: true, tier_code: tier.code, spend_total_eur: spend, reason: "ASSIGNED" }
}
