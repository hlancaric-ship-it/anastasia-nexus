import { model } from "@medusajs/framework/utils"

const CouponUsageReservation = model.define("coupon_usage_reservation", {
  id: model.id({ prefix: "cur" }).primaryKey(),
  promotion_id: model.text(),
  coupon_code: model.text(),
  cart_id: model.text(),
  order_id: model.text().nullable(),
  status: model.enum(["reserved", "confirmed", "released"]),
  counted: model.boolean(),
  reserved_at: model.dateTime(),
  confirmed_at: model.dateTime().nullable(),
  released_at: model.dateTime().nullable(),
}).indexes([
  { on: ["cart_id"], unique: true },
  { on: ["order_id"], unique: true },
  { on: ["promotion_id", "status"] },
])

export default CouponUsageReservation
