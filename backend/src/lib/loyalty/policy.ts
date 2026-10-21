/**
 * Vernostné úrovne – čistá logika bez infrastruktury (plně testovatelná).
 *
 * Zdroj pravdy o zľavách je databáza (tabuľka `loyalty_tier`),aby ich Lucia
 * mohla meniť v administrácii. Percentá sa nikdy nepočítajú na klientovi:
 * backend posiela Workeru iba kód úrovne (ZR1..ZR4) a Worker použije mapu
 * `loyaltyTiers`, ktorú dostal z databázy.
 */

export const LOYALTY_TIER_CODE_RE = /^ZR[1-9]\d?$/
/** Strop zľavy: vyššia hodnota je v politike NEXUS odmietnutá. */
export const MAX_LOYALTY_DISCOUNT_PERCENT = 50
export const MAX_LOYALTY_TIERS = 12
export const MAX_LOYALTY_THRESHOLD_EUR = 1_000_000

export type LoyaltyTier = {
  /** Kód úrovne (ZR1..ZR4) – zhoduje s kľúčom `loyaltyTiers` v politike NEXUS. */
  code: string
  /** Názov pre zákazníka a administráciu (Bronze, Silver, Gold, VIP). */
  name: string
  /** Zľava v percentách (0–50). */
  discount_percent: number
  /** Prah celkovej útraty v € pre automatické zaradenie; null = bez prahu. */
  spend_threshold_eur: number | null
  /** Vypnutá úroveň sa nedá získať automaticky ani nepoužije zľavu. */
  enabled: boolean
  /** Poradie úrovní (1 = najnižšie). */
  rank: number
}

export type LoyaltyPolicy = { tiers: LoyaltyTier[] }

/** Normalizovaný vstup z administrácie (percentá, kódy, prahy). */
export function normalizeTier(input: {
  code: string
  name: string
  discount_percent: number
  spend_threshold_eur?: number | null
  enabled?: boolean
  rank?: number
}): LoyaltyTier | { error: string } {
  const code = String(input.code ?? "").trim().toUpperCase()
  if (!LOYALTY_TIER_CODE_RE.test(code)) return { error: `Neplatný kód úrovne: ${code || "(prázdny)"}` }
  const name = String(input.name ?? "").trim()
  if (!name || name.length > 60) return { error: `Názov úrovne ${code} musí mať 1–60 znakov.` }
  const discount = Number(input.discount_percent)
  if (!Number.isFinite(discount) || discount < 0 || discount > MAX_LOYALTY_DISCOUNT_PERCENT) {
    return { error: `Zľava úrovne ${code} musí byť medzi 0 a ${MAX_LOYALTY_DISCOUNT_PERCENT} %.` }
  }
  const thresholdRaw = input.spend_threshold_eur as number | null | undefined | ""
  const threshold = thresholdRaw === null || thresholdRaw === undefined || thresholdRaw === "" ? null : Number(thresholdRaw)
  if (threshold !== null && (!Number.isFinite(threshold) || threshold < 0 || threshold > MAX_LOYALTY_THRESHOLD_EUR)) {
    return { error: `Prah úrovne ${code} musí byť nenegatívna suma v € (max ${MAX_LOYALTY_THRESHOLD_EUR}).` }
  }
  const rank = Number.isFinite(Number(input.rank)) ? Math.trunc(Number(input.rank)) : 0
  return {
    code,
    name,
    discount_percent: Math.round(discount * 100) / 100,
    spend_threshold_eur: threshold === null ? null : Math.round(threshold * 100) / 100,
    enabled: input.enabled !== false,
    rank: Math.min(Math.max(rank, 0), 99),
  }
}

/**
 * Normalizuje celú politiku. Kódy musia byť jedinečné a prahy zapnutých úrovní
 * musú v poradí úrovní rásť – inak by automatické zaradení nebolo jednoznačné.
 */
export function normalizePolicy(input: unknown): { ok: true; policy: LoyaltyPolicy } | { ok: false; message: string } {
  const raw = (input ?? {}) as { tiers?: unknown }
  if (!Array.isArray(raw.tiers)) return { ok: false, message: "Politika musí obsahovať zoznam úrovní." }
  if (raw.tiers.length > MAX_LOYALTY_TIERS) return { ok: false, message: `Politika môže mať najviac ${MAX_LOYALTY_TIERS} úrovní.` }
  const tiers: LoyaltyTier[] = []
  const seen = new Set<string>()
  for (const item of raw.tiers) {
    const tier = normalizeTier((item ?? {}) as any)
    if ("error" in tier) return { ok: false, message: tier.error }
    if (seen.has(tier.code)) return { ok: false, message: `Duplicitná úroveň ${tier.code}.` }
    seen.add(tier.code)
    tiers.push(tier)
  }
  const ordered = [...tiers].sort((a, b) => a.rank - b.rank || a.code.localeCompare(b.code))
  let previous: number | null = null
  for (const tier of ordered) {
    if (!tier.enabled || tier.spend_threshold_eur === null) continue
    if (previous !== null && tier.spend_threshold_eur <= previous) {
      return { ok: false, message: `Prahy úrovní musú v poradí rásť (${tier.code}).` }
    }
    previous = tier.spend_threshold_eur
  }
  return { ok: true, policy: { tiers: ordered.map((tier, index) => ({ ...tier, rank: index + 1 })) } }
}

/**
 * Úroveň podľa celkovej útraty: najvyššia zapnutá úroveň, ktorej prah
 * útratu ešte nedosahuje. Bez prahu sa automaticky nezíska.
 */
export function tierForSpend(tiers: LoyaltyTier[], spend: number): LoyaltyTier | null {
  const amount = Number(spend)
  if (!Number.isFinite(amount) || amount < 0) return null
  let best: LoyaltyTier | null = null
  let bestThreshold = -1
  for (const tier of tiers) {
    if (!tier.enabled || tier.spend_threshold_eur === null) continue
    if (amount + 1e-9 >= tier.spend_threshold_eur && tier.spend_threshold_eur > bestThreshold) {
      best = tier
      bestThreshold = tier.spend_threshold_eur
    }
  }
  return best
}

/**
 * Map pre NEXUS Worker: kód úrovne -> zľava ako podiel (0–1).
 * Vypnuté úrovne a úrovne bez zľavy sa neposielajú – Worker pre ne nemá pravidlo.
 */
export function workerLoyaltyTiers(tiers: LoyaltyTier[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const tier of tiers) {
    if (!tier.enabled) continue
    if (!tier.discount_percent || tier.discount_percent <= 0) continue
    result[tier.code] = Math.round((tier.discount_percent / 100) * 1e6) / 1e6
  }
  return result
}

/** Súčet zachytených platieb objednávok zákazníka (refundy odpočítané). */
export function netSpendFromOrders(orders: Array<{ status?: string | null; total?: unknown; captured?: number; refunded?: number }>): number {
  let sum = 0
  for (const order of orders ?? []) {
    if (order?.status === "canceled") continue
    const captured = Number(order?.captured ?? 0)
    if (!Number.isFinite(captured) || captured <= 0) continue
    const refunded = Number(order?.refunded ?? 0)
    const net = Number.isFinite(refunded) && refunded > 0 ? captured - refunded : captured
    if (net > 0) sum += net
  }
  return Math.round(sum * 100) / 100
}
