import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { normalizePolicy, type LoyaltyTier } from "./policy"

/**
 * Úložiště vernostnej politiky v nastaveniach obchodu (tabuľka `store`, sloupec
 * `metadata`). Stejný vzor používajú dopravci – žádný nový modul, žádná migrácia.
 *
 * Pred launchom je politika prázdna (žiadne úrovne, 0 %); percentá si Lucia
 * nastaví v administrácii. Kľúč `loyalty_policy` v metadátach obchodu drží:
 *   { tiers: [{ code, name, discount_percent, spend_threshold_eur, enabled, rank }], updated_at, updated_by }
 */

export const LOYALTY_POLICY_KEY = "loyalty_policy"

export type LoyaltySettings = {
  tiers: LoyaltyTier[]
  updated_at: string | null
  updated_by: string | null
}

export const EMPTY_LOYALTY_SETTINGS: LoyaltySettings = { tiers: [], updated_at: null, updated_by: null }

function readTier(value: unknown): LoyaltyTier | null {
  if (!value || typeof value !== "object") return null
  const tier = value as Record<string, unknown>
  const code = typeof tier.code === "string" ? tier.code.trim().toUpperCase() : ""
  if (!code) return null
  const threshold = tier.spend_threshold_eur
  return {
    code,
    name: typeof tier.name === "string" ? tier.name : code,
    discount_percent: Number.isFinite(Number(tier.discount_percent)) ? Number(tier.discount_percent) : 0,
    spend_threshold_eur: threshold === null || threshold === undefined ? null : Number(threshold),
    enabled: tier.enabled !== false,
    rank: Number.isFinite(Number(tier.rank)) ? Number(tier.rank) : 0,
  }
}

/** Prečíta politiku z metadát obchodu; poškodené úrovne zahodí (nie sú dôvod na pád). */
export function readLoyaltySettings(metadata: unknown): LoyaltySettings {
  const source = (metadata && typeof metadata === "object" ? metadata : {}) as Record<string, unknown>
  const raw = source[LOYALTY_POLICY_KEY]
  if (!raw || typeof raw !== "object") return { ...EMPTY_LOYALTY_SETTINGS }
  const value = raw as Record<string, unknown>
  const tiers = Array.isArray(value.tiers)
    ? value.tiers.map(readTier).filter((tier): tier is LoyaltyTier => tier !== null)
    : []
  return {
    tiers: tiers.sort((a, b) => a.rank - b.rank || a.code.localeCompare(b.code)),
    updated_at: typeof value.updated_at === "string" ? value.updated_at : null,
    updated_by: typeof value.updated_by === "string" ? value.updated_by : null,
  }
}

export function writeLoyaltySettings(metadata: unknown, settings: LoyaltySettings): Record<string, unknown> {
  const source = (metadata && typeof metadata === "object" ? metadata : {}) as Record<string, unknown>
  return { ...source, [LOYALTY_POLICY_KEY]: settings }
}

const storeService = (scope: MedusaContainer) => scope.resolve(Modules.STORE) as any

/** Aktuálna politika z databázy (prázdna = politika ešte nenastavená). */
export async function readLoyaltySettingsFromStore(scope: MedusaContainer): Promise<LoyaltySettings> {
  const [store] = await storeService(scope).listStores({}, { take: 1 })
  if (!store) return { ...EMPTY_LOYALTY_SETTINGS }
  return readLoyaltySettings(store.metadata)
}

/**
 * Uloží politiku (normalizovanú) a po zápise ju znovu prečíta – uložené hodnoty
 * sú jediná pravda pre ďalšie výpočty zľav.
 */
export async function saveLoyaltySettingsToStore(
  scope: MedusaContainer,
  tiers: LoyaltyTier[],
  actor: string | null,
): Promise<LoyaltySettings> {
  const normalized = normalizePolicy({ tiers })
  if (!normalized.ok) throw new Error(normalized.message)
  const [store] = await storeService(scope).listStores({}, { take: 1 })
  if (!store) throw new Error("LOYALTY_STORE_MISSING")
  const settings: LoyaltySettings = {
    tiers: normalized.policy.tiers,
    updated_at: new Date().toISOString(),
    updated_by: actor,
  }
  const metadata = writeLoyaltySettings(store.metadata, settings)
  await storeService(scope).updateStores(store.id, { metadata })
  const verified = readLoyaltySettings((await storeService(scope).retrieveStore(store.id)).metadata)
  if (verified.tiers.length !== settings.tiers.length) throw new Error("LOYALTY_READBACK_MISMATCH")
  return verified
}
