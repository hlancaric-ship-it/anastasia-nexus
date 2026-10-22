import type { MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { adminActor } from "../../../../lib/observability/audit"
import { NEWSLETTER_MODULE } from "../../../../modules/newsletter"
import { NewsletterError } from "../../../../modules/newsletter/policy"

/** Spoločné pravidlá admin trás newslettera: prihlásený správca, výber polí, slovenské chyby. */

export const CAMPAIGN_FIELDS = [
  "id", "subject", "preheader", "body_html", "status", "queued_at", "sent_at",
  "recipients_count", "sent_count", "failed_count", "created_at", "updated_at",
]

export const newsletterService = (req: any): any => req.scope.resolve(NEWSLETTER_MODULE)

export const legalService = (req: any): any => req.scope.resolve("legal")

export const publicCampaign = (row: any) => Object.fromEntries(CAMPAIGN_FIELDS.map(key => [key, row?.[key] ?? null]))

export function requireAdmin(req: any, res: MedusaResponse): boolean {
  if (adminActor(req)) return true
  res.status(401).json({ message: "Vyžaduje sa prihlásenie správcu." })
  return false
}

export function campaignPage(query: any) {
  return {
    take: Math.min(100, Math.max(1, Number(query?.limit) || 50)),
    skip: Math.max(0, Number(query?.offset) || 0),
    order: { created_at: "DESC" as const },
    select: CAMPAIGN_FIELDS,
  }
}

const MESSAGES: Record<string, string> = {
  CAMPAIGN_NOT_FOUND: "Kampaň sa nenašla.",
  CAMPAIGN_NOT_EDITABLE: "Upravovať alebo zmazať sa dá len koncept kampane.",
  CAMPAIGN_STATE_CONFLICT: "Kampaň sa medzitým zmenila. Načítajte ju znova.",
  CAMPAIGN_NO_RECIPIENTS: "Nie je komu poslať. Zatiaľ nemáte žiadneho prihláseného odberateľa.",
  INVALID_CAMPAIGN_SUBJECT: "Predmet chýba alebo je príliš dlhý (najviac 200 znakov).",
  INVALID_CAMPAIGN_PREHEADER: "Náhľadový text je príliš dlhý (najviac 300 znakov).",
  INVALID_CAMPAIGN_BODY: "Obsah e-mailu je prázdny. Napíšte aspoň jeden odsek.",
  INVALID_TEST_EMAIL: "Zadajte platný e-mail.",
  NEWSLETTER_NOT_CONFIGURED: "Odosielanie nie je nastavené. Chýba NEWSLETTER_UNSUBSCRIBE_SECRET (aspoň 32 znakov).",
}

export function sendNewsletterError(req: any, res: MedusaResponse, error: unknown) {
  if (error instanceof NewsletterError) {
    return res.status(error.status).json({ error: error.code, message: MESSAGES[error.code] ?? "Požiadavku sa nepodarilo vybaviť." })
  }
  req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("[newsletter] operácia zlyhala")
  return res.status(503).json({ error: "NEWSLETTER_UNAVAILABLE", message: "Newsletter sa teraz nepodarilo vybaviť. Skúste to neskôr." })
}
