import { model } from "@medusajs/framework/utils"

/** Kampaň newslettera. `body_html` je vždy už sanitizovaný (whitelist v policy.ts). */
const NewsletterCampaign = model
  .define("newsletter_campaign", {
    id: model.id({ prefix: "nlc" }).primaryKey(),
    subject: model.text(),
    preheader: model.text().nullable(),
    body_html: model.text(),
    status: model.enum(["draft", "queued", "sending", "sent", "cancelled"]),
    queued_at: model.dateTime().nullable(),
    sent_at: model.dateTime().nullable(),
    recipients_count: model.number().default(0),
    sent_count: model.number().default(0),
    failed_count: model.number().default(0),
  })
  .indexes([{ on: ["status"] }, { on: ["created_at"] }])

export default NewsletterCampaign
