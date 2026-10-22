import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { newsletterSecret } from "../../../../../../modules/newsletter/policy"
import { newsletterService, publicCampaign, requireAdmin, sendNewsletterError } from "../../shared"

/**
 * POST /admin/newsletter/campaigns/:id/send
 * Zafrontuje kampaň: vytvorí snapshot doručení pre všetky subscribed súhlasy.
 * Bez NEWSLETTER_UNSUBSCRIBE_SECRET sa nefrontuje nič (e-mail by nemal funkčný odkaz).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!requireAdmin(req, res)) return
  try {
    newsletterSecret()
    const campaign = await newsletterService(req).queueCampaign(String(req.params.id))
    return res.json({ campaign: publicCampaign(campaign) })
  } catch (error) {
    return sendNewsletterError(req, res, error)
  }
}
