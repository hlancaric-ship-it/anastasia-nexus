import { createHmac } from "node:crypto"
import { workerLoyaltyTiers, type LoyaltyTier } from "../loyalty/policy"

/**
 * Synchronizácia cenovej politiky do NEXUS Workera.
 *
 * Worker je autorita na výpočet zľav (pozri `nexus/workers/api/routes/nexusPricing.ts`):
 * backend mu posiela iba kód úrovne (`ZR1..ZR4`), percentá si Worker vezme z mapy
 * `loyaltyTiers`. Túto mapu posíláme do Workera podepsaným webhookom – klient
 * nikdy neposiela percentá a cenový výpočet zostáva na serveri.
 *
 * Podpis je rovnaký ako pri medusa webhooku (HMAC-SHA256 cez `t<čas>.v1<mac>`),
 * aby sa na strane Workera neduplikoval podpisový mechanismus.
 */

export type LoyaltyPolicySyncResult = {
  synced: boolean
  status: number | null
  error?: string
}

export type LoyaltyPolicySyncConfig = {
  url: URL
  secret: string
  tenantId: string
}

export function loyaltyPolicySyncConfig(env: NodeJS.ProcessEnv = process.env): LoyaltyPolicySyncConfig | null {
  const raw = String(env.NEXUS_PRICING_POLICY_URL ?? "").trim()
  const secret = String(env.NEXUS_MEDUSA_WEBHOOK_SECRET ?? "").trim()
  const tenantId = String(env.NEXUS_TENANT_ID ?? "").trim()
  if (!raw || !secret || !/^[a-z0-9_-]{2,32}$/i.test(tenantId)) return null
  let url: URL
  try { url = new URL(raw) } catch { return null }
  const local = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if (url.protocol !== "https:" && !local) return null
  if (url.username || url.password || url.search || url.hash) return null
  return { url, secret, tenantId }
}

/** Telo, ktoré sa posiela Workeru: kód úrovne -> zľava ako podiel (0–1). */
export function loyaltyPolicyPayload(tiers: LoyaltyTier[], tenantId: string) {
  return { tenantId, loyaltyTiers: workerLoyaltyTiers(tiers) }
}

/**
 * Pošle politiku do Workera. Chyba sieťe alebo neprijatie politiky NIE JE
 * chyba uloženia v DB – politika zostáva uložená a odoslanie sa dá zopakovať.
 */
export async function syncLoyaltyPolicyToWorker(
  tiers: LoyaltyTier[],
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<LoyaltyPolicySyncResult> {
  const config = loyaltyPolicySyncConfig(env)
  if (!config) return { synced: false, status: null, error: "NEXUS_PRICING_POLICY_NOT_CONFIGURED" }
  const body = JSON.stringify(loyaltyPolicyPayload(tiers, config.tenantId))
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = createHmac("sha256", config.secret).update(`${timestamp}.${body}`).digest("hex")
  try {
    const response = await fetchImpl(config.url.toString(), {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      headers: {
        "content-type": "application/json",
        "x-medusa-signature": `t=${timestamp},v1=${signature}`,
      },
      body,
    })
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      return { synced: false, status: response.status, error: `NEXUS_POLICY_SYNC_${response.status}` }
    }
    const raw = await response.text()
    let ack: unknown = null
    try { ack = JSON.parse(raw) } catch { ack = null }
    if (!ack || typeof ack !== "object" || (ack as { accepted?: unknown }).accepted !== true) {
      return { synced: false, status: response.status, error: "NEXUS_POLICY_SYNC_NOT_ACCEPTED" }
    }
    return { synced: true, status: response.status }
  } catch {
    return { synced: false, status: null, error: "NEXUS_POLICY_SYNC_UNAVAILABLE" }
  }
}
