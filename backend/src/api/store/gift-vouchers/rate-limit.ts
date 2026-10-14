import { createHash } from "node:crypto"
import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export const VOUCHER_ATTEMPTS_PER_MINUTE = 20
type Database = { raw(sql: string, bindings: unknown[]): Promise<{ rows: { attempts: number; retry_after: number }[] }> }

/** One atomic statement shared by every backend instance. Neither IP nor code is stored. */
export async function claimVoucherAttempt(database: Database, address: string) {
  const subject = createHash("sha256").update(`gift-voucher-apply:${address}`).digest("hex")
  const { rows } = await database.raw(`
    INSERT INTO gift_voucher_rate_limit (subject, attempts, expires_at)
    VALUES (?, 1, now() + interval '60 seconds')
    ON CONFLICT (subject) DO UPDATE SET
      attempts = CASE WHEN gift_voucher_rate_limit.expires_at <= now() THEN 1
        ELSE LEAST(gift_voucher_rate_limit.attempts + 1, ?) END,
      expires_at = CASE WHEN gift_voucher_rate_limit.expires_at <= now()
        THEN now() + interval '60 seconds' ELSE gift_voucher_rate_limit.expires_at END
    RETURNING attempts, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (expires_at - now()))))::integer AS retry_after
  `, [subject, VOUCHER_ATTEMPTS_PER_MINUTE + 1])
  if (rows.length !== 1) throw new Error("VOUCHER_RATE_LIMIT_UNAVAILABLE")
  return { allowed: rows[0].attempts <= VOUCHER_ATTEMPTS_PER_MINUTE, retryAfter: rows[0].retry_after }
}

export async function limitVoucherAttempts(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  res.setHeader("Cache-Control", "no-store")
  try {
    // Use Express's resolved peer; do not trust a caller-supplied forwarding header.
    const address = req.ip || req.socket.remoteAddress || "unknown-peer"
    const verdict = await claimVoucherAttempt(req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION), address)
    if (verdict.allowed) return next()
    res.setHeader("Retry-After", String(verdict.retryAfter))
    return res.status(429).json({ ok: false, error: "GIFT_VOUCHER_RATE_LIMITED", message: "Príliš veľa pokusov o uplatnenie poukazu. Počkajte chvíľu a skúste to znova." })
  } catch {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("[gift-voucher] ochrana uplatnenia kódu nie je dostupná")
    return res.status(503).json({ ok: false, error: "GIFT_VOUCHER_UNAVAILABLE", message: "Poukaz sa teraz nedá spracovať. Skúste to neskôr." })
  }
}
