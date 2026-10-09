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
  if (!url || !apiKey) throw new SafeOrderError("SAFEORDER_NOT_CONFIGURED")
  if (!Number.isFinite(input.orderSum) || input.orderSum < 0) throw new SafeOrderError("SAFEORDER_UNAVAILABLE")

  let response: Response
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(input),
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
  const score = Number(body?.score)
  const factors: string[] = Array.isArray(body?.factors) ? body.factors.map(String) : []
  if (body?.ok !== true || !Number.isFinite(score)) throw new SafeOrderError("SAFEORDER_UNAVAILABLE")
  if (body.decision === "ALLOW") return { score, factors }
  if (body.decision === "REVIEW") throw new SafeOrderError("SAFEORDER_REVIEW_REQUIRED", score, factors)
  if (body.decision === "BLOCK") throw new SafeOrderError("SAFEORDER_BLOCKED", score, factors)
  throw new SafeOrderError("SAFEORDER_UNAVAILABLE")
}
