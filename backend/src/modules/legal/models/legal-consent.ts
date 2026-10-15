import { model } from "@medusajs/framework/utils"
const LegalConsent = model.define("legal_consent", {
  id: model.id({ prefix: "lgl" }).primaryKey(),
  cart_id: model.text(),
  customer_id: model.text().nullable(),
  order_id: model.text().nullable(),
  terms_version: model.text(),
  privacy_version: model.text(),
  accepted_at: model.dateTime(),
}).indexes([{ on: ["cart_id"], unique: true, where: "deleted_at IS NULL" }])
export default LegalConsent
