export type CustomerGroupLike = { name?: unknown; metadata?: Record<string, unknown> | null }

const TIER_CODE = /^ZR\d+$/

/**
 * Určí věrnostní tier zákazníka ze skupin.
 * Zdroj pravdy je `metadata.nexus_tier` skupiny (Bronze/Silver/Gold/VIP -> ZR1..ZR4);
 * název skupiny ve tvaru ZR\d+ zůstává jako zpětně kompatibilní záloha.
 * Při více skupinách vyhrává nejvyšší `metadata.rank`, jinak nejvyšší číslo v kódu.
 */
export function resolveCustomerTier(groups: CustomerGroupLike[] | null | undefined): string | undefined {
  const candidates: Array<{ tier: string; rank: number }> = []
  for (const group of groups || []) {
    const fromMeta = typeof group?.metadata?.nexus_tier === "string" ? group.metadata.nexus_tier.trim().toUpperCase() : ""
    const fromName = String(group?.name ?? "").trim().toUpperCase()
    const tier = TIER_CODE.test(fromMeta) ? fromMeta : TIER_CODE.test(fromName) ? fromName : ""
    if (!tier) continue
    const metaRank = Number(group?.metadata?.rank)
    candidates.push({ tier, rank: Number.isFinite(metaRank) ? metaRank : Number(tier.slice(2)) })
  }
  candidates.sort((a, b) => b.rank - a.rank)
  return candidates[0]?.tier
}
