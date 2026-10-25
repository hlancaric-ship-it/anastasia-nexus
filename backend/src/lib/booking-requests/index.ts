import { createHash } from "node:crypto"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { sendEmail } from "../email/send"
import { resolveStorefrontOrigin } from "../feeds/policy"
import { REQUEST_LIMIT } from "../../modules/booking/request-policy"

type Database = { raw(sql: string, bindings: unknown[]): Promise<{ rows: { attempts: number }[] }> }
type Scope = Pick<MedusaContainer, "resolve">

/** Limit žiadostí na adresu klienta (tabuľka gift_voucher_rate_limit, vlastná predpona, IP sa neukladá). */
export async function claimRequestAttempt(database: Database, address: string) {
  const subject = createHash("sha256").update(`booking-request:${address}`).digest("hex")
  const { rows } = await database.raw(`
    INSERT INTO gift_voucher_rate_limit (subject, attempts, expires_at)
    VALUES (?, 1, now() + make_interval(secs => ?))
    ON CONFLICT (subject) DO UPDATE SET
      attempts = CASE WHEN gift_voucher_rate_limit.expires_at <= now() THEN 1
        ELSE LEAST(gift_voucher_rate_limit.attempts + 1, ?) END,
      expires_at = CASE WHEN gift_voucher_rate_limit.expires_at <= now()
        THEN now() + make_interval(secs => ?) ELSE gift_voucher_rate_limit.expires_at END
    RETURNING attempts
  `, [subject, REQUEST_LIMIT.windowSeconds, REQUEST_LIMIT.attempts + 1, REQUEST_LIMIT.windowSeconds])
  if (rows.length !== 1) throw new Error("BOOKING_REQUEST_RATE_LIMIT_UNAVAILABLE")
  return rows[0].attempts <= REQUEST_LIMIT.attempts
}

export async function productTitle(scope: Scope, productId: string): Promise<string | null> {
  const { data } = await scope.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "product", fields: ["id", "title", "handle"], filters: { id: productId } })
  return data?.[0]?.title ?? null
}

export async function productHandle(scope: Scope, productId: string): Promise<string | null> {
  const { data } = await scope.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "product", fields: ["id", "handle"], filters: { id: productId } })
  return data?.[0]?.handle ?? null
}

export const requestPayUrl = (id: string, token: string) => {
  const origin = resolveStorefrontOrigin()
  return origin ? `${origin}/konzultacie/rezervacia?ziadost=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}` : null
}

export const adminRequestsUrl = () => {
  const base = (process.env.ADMIN_URL || process.env.CHAT_ADMIN_URL || "").trim().replace(/\/+$/, "")
  return base ? `${base}/#/konzultacie` : null
}

/** E-mail nesmie zhodiť žiadosť ani schválenie: chyba sa zapíše do logu, v adminu je všetko vidieť. */
export async function notifySafe(scope: Scope, input: Parameters<typeof sendEmail>[1]) {
  try {
    await sendEmail(scope as any, input)
    return true
  } catch (error) {
    scope.resolve(ContainerRegistrationKeys.LOGGER).error(`[booking-request] e-mail ${input.template} zlyhal`, error as Error)
    return false
  }
}

export const publicRequest = (r: any) => ({ id: r.id, product_id: r.product_id, status: r.status, starts_at: r.starts_at, ends_at: r.ends_at, created_at: r.created_at })
