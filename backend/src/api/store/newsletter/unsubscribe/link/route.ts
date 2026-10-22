import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { legalService } from "../../../../legal-helpers"
import { LegalError } from "../../../../../modules/legal/policy"
import { NewsletterError, verifyUnsubscribeSignature, newsletterSecret } from "../../../../../modules/newsletter/policy"
import { renderUnsubscribePage } from "./page"

const value = (input: unknown): string => Array.isArray(input) ? String(input[0] ?? "") : typeof input === "string" ? input : ""

function headers(res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  res.setHeader("X-Robots-Tag", "noindex, nofollow")
  res.setHeader("Referrer-Policy", "no-referrer")
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'")
  res.setHeader("Content-Type", "text/html; charset=utf-8")
}

const html = (res: MedusaResponse, status: number, body: string) => res.status(status).send(body)

/**
 * GET /store/newsletter/unsubscribe/link?c=<consent_id>&s=<podpis>
 * Odkaz nič neodhlási – len ukáže tlačidlo. Prefetch ani antivírus tak odber neukončí.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  headers(res)
  const consentId = value(req.query.c)
  const signature = value(req.query.s)
  try {
    const secret = newsletterSecret()
    if (!verifyUnsubscribeSignature(consentId, signature, secret)) {
      return html(res, 404, renderUnsubscribePage({ state: "invalid" }))
    }
    const [row] = await legalService(req).listNewsletterConsents({ id: consentId }, { take: 1, select: ["id", "status"] })
    if (!row) return html(res, 404, renderUnsubscribePage({ state: "invalid" }))
    return html(res, 200, renderUnsubscribePage({
      state: row.status === "unsubscribed" ? "already" : "confirm",
      consentId,
      signature,
    }))
  } catch (error) {
    if (error instanceof NewsletterError && error.code === "NEWSLETTER_NOT_CONFIGURED") {
      return html(res, 503, renderUnsubscribePage({ state: "unavailable" }))
    }
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("[newsletter] odhlasovacia stránka zlyhala")
    return html(res, 503, renderUnsubscribePage({ state: "unavailable" }))
  }
}

/**
 * POST na tú istú adresu. Podporuje aj jednoklikové odhlásenie (RFC 8058):
 * `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, telo sa nevyžaduje.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  headers(res)
  const body = req.body as any
  const consentId = value(req.query.c) || value(body?.c)
  const signature = value(req.query.s) || value(body?.s)
  try {
    const secret = newsletterSecret()
    if (!verifyUnsubscribeSignature(consentId, signature, secret)) {
      return html(res, 404, renderUnsubscribePage({ state: "invalid" }))
    }
    await legalService(req).unsubscribeConsent(consentId)
    return html(res, 200, renderUnsubscribePage({ state: "done" }))
  } catch (error) {
    if (error instanceof LegalError && error.code === "INVALID_UNSUBSCRIBE_LINK") {
      return html(res, 404, renderUnsubscribePage({ state: "invalid" }))
    }
    if (error instanceof NewsletterError && error.code === "NEWSLETTER_NOT_CONFIGURED") {
      return html(res, 503, renderUnsubscribePage({ state: "unavailable" }))
    }
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("[newsletter] odhlásenie zlyhalo")
    return html(res, 503, renderUnsubscribePage({ state: "unavailable" }))
  }
}
