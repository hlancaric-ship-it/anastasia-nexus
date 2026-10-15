import { requestIdHeaders } from "../../../lib/observability/log"

export type SafeOrderDecision = "ALLOW" | "REVIEW" | "BLOCK"

export type SafeOrderInput = {
  orderSum: number
  paymentMethod: string
  customerEmail: string
}

export class SafeOrderError extends Error {
  constructor(public code: "SAFEORDER_BLOCKED" | "SAFEORDER_REVIEW_REQUIRED" | "SAFEORDER_UNAVAILABLE" | "SAFEORDER_NOT_CONFIGURED", public score?: number, public factors: string[] = []) {
    super(code)
  }
}

/** URL SafeOrderu: explicitní NEXUS_SAFEORDER_URL, jinak odvozená z NEXUS_PRICING_URL (/pricing -> /safeorder). */
export function resolveSafeOrderUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  if (env.NEXUS_SAFEORDER_URL) return env.NEXUS_SAFEORDER_URL
  const pricing = env.NEXUS_PRICING_URL
  return pricing && /\/pricing\/?$/.test(pricing) ? pricing.replace(/\/pricing\/?$/, "/safeorder") : undefined
}

/**
 * Pre-checkout rizikové vyhodnocení (fail-closed): cokoliv jiného než jednoznačné ALLOW
 * (chyba sítě, neplatná odpověď, neznámé rozhodnutí, REVIEW, BLOCK) checkout zastaví.
 */
export async function assertSafeOrderAllows(input: SafeOrderInput, env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): Promise<{ score: number; factors: string[] }> {
  const url = resolveSafeOrderUrl(env)
  const apiKey = env.NEXUS_PRICING_API_KEY
  const tenantId = env.NEXUS_TENANT_ID
  if (!url || !apiKey || !tenantId) throw new SafeOrderError("SAFEORDER_NOT_CONFIGURED")
  // Send the credential only over TLS, except isolated loopback development.
  let endpoint: URL
  try { endpoint = new URL(url) } catch { throw new SafeOrderError("SAFEORDER_NOT_CONFIGURED") }
  if (endpoint.username || endpoint.password || (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname)))) {
    throw new SafeOrderError("SAFEORDER_NOT_CONFIGURED")
  }
  if (!Number.isFinite(input.orderSum) || input.orderSum < 0) throw new SafeOrderError("SAFEORDER_UNAVAILABLE")

  let response: Response
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}`, ...requestIdHeaders() },
      body: JSON.stringify({ ...input, tenantId, currency: "eur" }),
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    throw new SafeOrderError("SAFEORDER_UNAVAILABLE")
  }
  if (!response.ok) throw new SafeOrderError("SAFEORDER_UNAVAILABLE")

  let body: any
  try {
    body = await response.json()
  } catch {
    throw new SafeOrderError("SAFEORDER_UNAVAILABLE")
  }
  const score = body?.score
  const factors = body?.factors
  if (body?.ok !== true || body.tenantId !== tenantId || body.currency !== "eur" || body.orderSum !== input.orderSum || typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100 || !Array.isArray(factors) || factors.some((factor: unknown) => typeof factor !== "string")) throw new SafeOrderError("SAFEORDER_UNAVAILABLE")
  if (body.decision === "ALLOW" && score < 40) return { score, factors }
  if (body.decision === "REVIEW") throw new SafeOrderError("SAFEORDER_REVIEW_REQUIRED", score, factors)
  if (body.decision === "BLOCK") throw new SafeOrderError("SAFEORDER_BLOCKED", score, factors)
  throw new SafeOrderError("SAFEORDER_UNAVAILABLE")
}
