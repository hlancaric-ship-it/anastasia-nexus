import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { resolveCustomerTier } from "./tier"

/**
 * Zaradenie zákazníka do vernostnej úrovně.
 *
 * Zdroj pravdy je skupina zákazníka (Bronze/Silver/Gold/VIP mají
 * `metadata.nexus_tier` = ZR1..ZR4) – rovnako ju číta cenový adapter pri
 * výpočtu ceny. Skupinu nevie zákazník zmeniť (store API skupiny neponúka),
 * takže si zákazník úroveň neudelí sám.
 *
 * Ručný zámok (správca nastavil úroveň ručne a automatické zaradenie ju nesmie
 * prebiť) je vlastná skupina `Věrnost – ruční zámok`. Zámok sa tak nedá
 * prejsť cez metadáta zákazníka, ktoré vie zákazník zapisovať.
 */

export const LOYALTY_LOCK_GROUP_NAME = "Věrnost – ruční zámok"
export const LOYALTY_LOCK_METADATA_KEY = "loyalty_lock"
export const LOYALTY_TIER_METADATA_KEY = "nexus_tier"

export type LoyaltyTierGroup = { id: string; name: string; code: string; rank: number }
export type LoyaltyAssignment = {
  tier_code: string | null
  tier_name: string | null
  source: "manual" | "auto"
  locked: boolean
}

const customerService = (scope: MedusaContainer) => scope.resolve(Modules.CUSTOMER) as any

/** Všechny skupiny, ktoré znamenajú vernostnú úroveň (majú `metadata.nexus_tier`). */
export async function loyaltyTierGroups(scope: MedusaContainer): Promise<LoyaltyTierGroup[]> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data } = await query.graph({
    entity: "customer_group",
    fields: ["id", "name", "metadata"],
    filters: {},
  })
  const groups: LoyaltyTierGroup[] = []
  for (const group of (data ?? []) as Array<{ id: string; name: string; metadata?: Record<string, unknown> | null }>) {
    const code = typeof group.metadata?.nexus_tier === "string" ? String(group.metadata.nexus_tier).trim().toUpperCase() : ""
    if (!code) continue
    const rank = Number(group.metadata?.rank)
    groups.push({ id: group.id, name: group.name, code, rank: Number.isFinite(rank) ? rank : Number(code.replace(/\D/g, "")) || 0 })
  }
  return groups.sort((a, b) => a.rank - b.rank || a.code.localeCompare(b.code))
}

/** Skupina ručného zámoku (ak ešte neexistuje, vráti null). */
export async function loyaltyLockGroup(scope: MedusaContainer): Promise<{ id: string; name: string } | null> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data } = await query.graph({
    entity: "customer_group",
    fields: ["id", "name", "metadata"],
    filters: {},
  })
  for (const group of (data ?? []) as Array<{ id: string; name: string; metadata?: Record<string, unknown> | null }>) {
    if (group.metadata?.[LOYALTY_LOCK_METADATA_KEY] === true) return { id: group.id, name: group.name }
  }
  return null
}

/**
 * Skupina ručného zámku musí existovať, inak by sa zámok nedal zapísať.
 * Beží bootstrap (`anastasia-bootstrap.ts`); tady ju založíme, ak by chýbala
 * (napr. staršia databáza), aby ručné zaradenie fungovalo vždy.
 */
export async function ensureLoyaltyLockGroup(scope: MedusaContainer): Promise<{ id: string; name: string }> {
  const existing = await loyaltyLockGroup(scope)
  if (existing) return existing
  const customers = customerService(scope)
  const created = await customers.createCustomerGroups({
    name: LOYALTY_LOCK_GROUP_NAME,
    metadata: { [LOYALTY_LOCK_METADATA_KEY]: true },
  })
  return { id: String(created?.id ?? ""), name: LOYALTY_LOCK_GROUP_NAME }
}

/** Skupiny zákazníka a jeho aktuálne zaradenie (úroveň + zámok). */
export async function readLoyaltyAssignment(scope: MedusaContainer, customerId: string): Promise<LoyaltyAssignment> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data } = await query.graph({
    entity: "customer",
    fields: ["id", "groups.id", "groups.name", "groups.metadata"],
    filters: { id: customerId },
  })
  const customer = (data ?? [])[0] as { id: string; groups?: Array<{ id: string; name?: string; metadata?: Record<string, unknown> | null }> } | undefined
  if (!customer) return { tier_code: null, tier_name: null, source: "auto", locked: false }
  const groups = customer.groups ?? []
  const locked = groups.some((group) => group.metadata?.[LOYALTY_LOCK_METADATA_KEY] === true)
  const tierCode = resolveCustomerTier(groups) ?? null
  const tierGroup = loyaltyTierGroupsSync(groups)
  return {
    tier_code: tierCode,
    tier_name: tierGroup?.name ?? null,
    source: locked ? "manual" : tierCode ? "auto" : "auto",
    locked,
  }
}

/** Skupina s úrovní priamo zo zoznamu skupín zákazníka (bez dotazu do DB). */
function loyaltyTierGroupsSync(groups: Array<{ id: string; name?: string; metadata?: Record<string, unknown> | null }>) {
  const withTier = groups
    .filter((group) => typeof group.metadata?.nexus_tier === "string" && String(group.metadata.nexus_tier).trim())
    .sort((a, b) => (Number(b.metadata?.rank) || 0) - (Number(a.metadata?.rank) || 0))
  const first = withTier[0]
  return first ? { id: first.id, name: first.name ?? "", code: String(first.metadata?.nexus_tier).trim().toUpperCase() } : null
}

/**
 * Zapíše zaradenie: členstvo v skupine úrovne (to vidí cenový výpočet) a
 * prípadný ručný zámok. Ostatné skupiny úrovní sa odstránia, aby mala
 * zákazník vždy práve jednu úroveň.
 */
export async function applyLoyaltyAssignment(
  scope: MedusaContainer,
  input: { customerId: string; tierCode: string | null; locked: boolean },
): Promise<{ tier_code: string | null; tier_name: string | null; source: "manual" | "auto"; locked: boolean }> {
  const tiers = await loyaltyTierGroups(scope)
  const lockGroup = await ensureLoyaltyLockGroup(scope)
  const customers = customerService(scope)
  const target = input.tierCode ? tiers.find((tier) => tier.code === input.tierCode) ?? null : null
  if (input.tierCode && !target) throw new Error("LOYALTY_TIER_NOT_FOUND")

  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data } = await query.graph({
    entity: "customer",
    fields: ["id", "groups.id"],
    filters: { id: input.customerId },
  })
  const current = new Set((((data ?? [])[0] as { groups?: Array<{ id: string }> } | undefined)?.groups?.map((group) => group.id)) ?? [])

  // Skupiny úrovní: zostať len tá, ktorá patrí k priradenej úrovni.
  for (const tier of tiers) {
    if (target && tier.id === target.id) {
      if (!current.has(tier.id)) await customers.addCustomerToGroup({ customer_id: input.customerId, customer_group_id: tier.id }).catch(() => undefined)
      continue
    }
    if (current.has(tier.id)) await customers.removeCustomerFromGroup({ customer_id: input.customerId, customer_group_id: tier.id }).catch(() => undefined)
  }
  // Ručný zámok: skupina existuje len vtedy, keď je zákazník zamknutý ručne.
  if (lockGroup) {
    if (input.locked) {
      if (!current.has(lockGroup.id)) await customers.addCustomerToGroup({ customer_id: input.customerId, customer_group_id: lockGroup.id }).catch(() => undefined)
    } else if (current.has(lockGroup.id)) {
      await customers.removeCustomerFromGroup({ customer_id: input.customerId, customer_group_id: lockGroup.id }).catch(() => undefined)
    }
  }
  return {
    tier_code: target?.code ?? null,
    tier_name: target?.name ?? null,
    source: input.locked ? "manual" : "auto",
    locked: input.locked,
  }
}
