import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MAX_PREHEADER, MAX_SUBJECT, renderCampaignEmail, sanitizeCampaignHtml } from "../../../../modules/newsletter/policy"
import { requireAdmin } from "../campaigns/shared"

/**
 * POST /admin/newsletter/preview – náhľad e-mailu presne zo serverovej šablóny (rovnaký kód ako pri odoslaní).
 * Nič neukladá ani neposiela. Obsah prejde rovnakou sanitizáciou ako pri uložení konceptu.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!requireAdmin(req, res)) return
  const body = (req.body ?? {}) as { subject?: unknown; preheader?: unknown; body_html?: unknown }
  const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "")
  const { html } = renderCampaignEmail({
    subject: text(body.subject, MAX_SUBJECT) || "Newsletter",
    preheader: text(body.preheader, MAX_PREHEADER),
    bodyHtml: sanitizeCampaignHtml(typeof body.body_html === "string" ? body.body_html : ""),
    unsubscribeUrl: "#",
  })
  return res.json({ html })
}
