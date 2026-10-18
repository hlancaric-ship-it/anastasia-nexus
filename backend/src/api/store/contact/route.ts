import { createHash } from "node:crypto"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sendEmail } from "../../../lib/email/send"
import { CONTACT_LIMIT, parseContact } from "./policy"

type Database = { raw(sql: string, bindings: unknown[]): Promise<{ rows: { attempts: number }[] }> }

/**
 * Limit na adresu klienta. Zdieľa tabuľku gift_voucher_rate_limit (subject je hash s vlastnou predponou),
 * takže netreba novú migráciu a platí naprieč inštanciami. IP sa neukladá.
 */
export async function claimContactAttempt(database: Database, address: string) {
  const subject = createHash("sha256").update(`contact-form:${address}`).digest("hex")
  const { rows } = await database.raw(`
    INSERT INTO gift_voucher_rate_limit (subject, attempts, expires_at)
    VALUES (?, 1, now() + make_interval(secs => ?))
    ON CONFLICT (subject) DO UPDATE SET
      attempts = CASE WHEN gift_voucher_rate_limit.expires_at <= now() THEN 1
        ELSE LEAST(gift_voucher_rate_limit.attempts + 1, ?) END,
      expires_at = CASE WHEN gift_voucher_rate_limit.expires_at <= now()
        THEN now() + make_interval(secs => ?) ELSE gift_voucher_rate_limit.expires_at END
    RETURNING attempts
  `, [subject, CONTACT_LIMIT.windowSeconds, CONTACT_LIMIT.attempts + 1, CONTACT_LIMIT.windowSeconds])
  if (rows.length !== 1) throw new Error("CONTACT_RATE_LIMIT_UNAVAILABLE")
  return rows[0].attempts <= CONTACT_LIMIT.attempts
}

/** POST /store/contact { name, email, subject, message, consent: true, website: "" } → e-mail správkyni (CONTACT_NOTIFY_EMAIL). */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const parsed = parseContact(req.body)
  // Robot dostane rovnakú odpoveď ako človek, nič sa neodošle.
  if (parsed.ok === "spam") return res.json({ ok: true, message: "Ďakujeme, správa bola odoslaná. Ozveme sa vám čo najskôr." })
  if (parsed.ok === false) return res.status(400).json({ ok: false, error: "CONTACT_INVALID", errors: parsed.errors, message: "Skontrolujte meno, e-mail a text správy (aspoň 10 znakov) a potvrďte informácie o súkromí." })
  const to = (process.env.CONTACT_NOTIFY_EMAIL || process.env.CHAT_ADMIN_NOTIFY_EMAIL || "").trim()
  if (!to) {
    logger.error("[contact] chýba CONTACT_NOTIFY_EMAIL – správa z webu sa nedá doručiť")
    return res.status(503).json({ ok: false, error: "CONTACT_UNAVAILABLE", message: "Formulár je dočasne nedostupný. Skúste to prosím neskôr." })
  }
  try {
    const allowed = await claimContactAttempt(req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION), req.ip || req.socket.remoteAddress || "unknown-peer")
    if (!allowed) return res.status(429).json({ ok: false, error: "CONTACT_RATE_LIMITED", message: "Odoslali ste viac správ za krátky čas. Skúste to prosím o pár minút." })
  } catch {
    logger.error("[contact] ochrana proti zneužitiu nie je dostupná")
    return res.status(503).json({ ok: false, error: "CONTACT_UNAVAILABLE", message: "Formulár je dočasne nedostupný. Skúste to prosím neskôr." })
  }
  try {
    await sendEmail(req.scope, { to, template: "contact-form-admin", data: parsed.value, resource_type: "contact_form" })
    return res.json({ ok: true, message: "Ďakujeme, správa bola odoslaná. Ozveme sa vám čo najskôr." })
  } catch {
    logger.error("[contact] odoslanie e-mailu zlyhalo")
    return res.status(502).json({ ok: false, error: "CONTACT_SEND_FAILED", message: "Správu sa nepodarilo odoslať. Skúste to prosím znova o chvíľu." })
  }
}
