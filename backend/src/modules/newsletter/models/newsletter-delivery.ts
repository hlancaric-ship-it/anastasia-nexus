import { model } from "@medusajs/framework/utils"

/**
 * Jeden príjemca jednej kampane. Vzniká ako snapshot súhlasov v čase zafrontovania,
 * takže neskorší nový súhlas sa do už zafrontovanej kampane nepridá.
 */
const NewsletterDelivery = model
  .define("newsletter_delivery", {
    id: model.id({ prefix: "nld" }).primaryKey(),
    campaign_id: model.text(),
    consent_id: model.text(),
    email: model.text(),
    status: model.enum(["pending", "sent", "failed", "skipped"]),
    error: model.text().nullable(),
    sent_at: model.dateTime().nullable(),
  })
  .indexes([
    { on: ["campaign_id", "consent_id"], unique: true },
    { on: ["status", "created_at"] },
    { on: ["campaign_id"] },
  ])

export default NewsletterDelivery
