import { model } from "@medusajs/framework/utils"

const CouponLinkRecord = model.define("coupon_link_record", {
  id: model.id({ prefix: "qrl" }).primaryKey(),
  tenant_id: model.text(),
  url: model.text(),
  sku: model.text(),
  coupon_code: model.text(),
  quantity: model.number(),
  source: model.enum(["generated", "legacy"]),
  issued_at: model.dateTime().nullable(),
  created_by: model.text(),
}).indexes([{ on: ["tenant_id", "created_at"] }])
export default CouponLinkRecord
