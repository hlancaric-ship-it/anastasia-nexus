import { model } from "@medusajs/framework/utils"
const NewsletterConsent = model.define("newsletter_consent", {
  id: model.id({ prefix: "lgl" }).primaryKey(),
  email: model.text(),
  source: model.text(),
  text_version: model.text(),
  status: model.enum(["subscribed", "unsubscribed"]),
  token_hash: model.text(),
  consented_at: model.dateTime(),
  unsubscribed_at: model.dateTime().nullable(),
}).indexes([{ on: ["email"], unique: true, where: "deleted_at IS NULL" }])
export default NewsletterConsent
