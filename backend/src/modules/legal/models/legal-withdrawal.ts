import { model } from "@medusajs/framework/utils"
const LegalWithdrawal = model.define("legal_withdrawal", {
  id: model.id({ prefix: "lgl" }).primaryKey(),
  order_id: model.text(),
  customer_id: model.text(),
  items: model.json(),
  reason: model.text().nullable(),
  status: model.enum(["received", "accepted", "rejected", "refunded"]).default("received"),
  changed_by: model.text().nullable(),
}).indexes([{ on: ["order_id"], unique: true, where: "deleted_at IS NULL" }])
export default LegalWithdrawal
