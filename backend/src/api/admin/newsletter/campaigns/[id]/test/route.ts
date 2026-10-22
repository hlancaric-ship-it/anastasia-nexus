import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { normalizeEmail } from "../../../../../../modules/auth-magic-link/policy"
import { listUnsubscribeHeaders, NewsletterError, newsletterSecret, renderCampaignEmail, unsubscribeUrl } from "../../../../../../modules/newsletter/policy"
import { legalService, newsletterService, requireAdmin, sendNewsletterError } from "../../shared"

const TEST_DOMAIN = "@l-code-dynamics.com"

/**
 * POST /admin/newsletter/campaigns/:id/test {email}
 * Pošle jednu testovaciu kópiu. V testovacom režime smie len na @l-code-dynamics.com.
 * Odkaz na odhlásenie sa podpisuje len vtedy, keď pre adresu existuje prihlásený súhlas.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!requireAdmin(req, res)) return
  try {
    const campaign = await newsletterService(req).getCampaignOrThrow(String(req.params.id))
    const email = normalizeEmail((req.body as any)?.email)
    if (!email) throw new NewsletterError("INVALID_TEST_EMAIL")
    if (!email.endsWith(TEST_DOMAIN)) {
      return res.status(403).json({ error: "TEST_NOT_ALLOWED", message: "Testovací e-mail sa posiela len na adresy @l-code-dynamics.com." })
    }

    const secret = newsletterSecret()
    const [consent] = await legalService(req).listNewsletterConsents({ email }, { take: 1, select: ["id", "status"] })
    const link = consent?.status === "subscribed" ? unsubscribeUrl(consent.id, secret) : null
    const rendered = renderCampaignEmail({
      subject: `[TEST] ${campaign.subject}`,
      preheader: campaign.preheader,
      bodyHtml: campaign.body_html,
      unsubscribeUrl: link,
      isTest: true,
    })

    const notification = req.scope.resolve(Modules.NOTIFICATION) as any
    await notification.createNotifications({
      to: email,
      channel: "email",
      template: "newsletter-campaign-test",
      content: { subject: `[TEST] ${campaign.subject}`, html: rendered.html, text: rendered.text },
      data: { campaign_id: campaign.id },
      ...(link ? { provider_data: { headers: listUnsubscribeHeaders(link) } } : {}),
    })
    return res.json({ sent: true, to: email })
  } catch (error) {
    return sendNewsletterError(req, res, error)
  }
}
