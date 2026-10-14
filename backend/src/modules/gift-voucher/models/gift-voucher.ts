import { model } from "@medusajs/framework/utils"
import { DELIVERY_METHODS, DELIVERY_STATUSES, VOUCHER_STATUSES } from "../policy"

/**
 * Vystavený dárkový poukaz. Částky v centech; invarianty (0 <= balance <= initial_amount,
 * unikátní kód a issue_key) vynucuje databáze, viz migrace.
 */
const GiftVoucher = model
  .define("gift_voucher", {
    id: model.id({ prefix: "gv" }).primaryKey(),
    code: model.text(),
    code_last4: model.text(),
    currency_code: model.text().default("eur"),
    initial_amount: model.number(),
    balance: model.number(),
    status: model.enum([...VOUCHER_STATUSES]).default("active"),
    issued_at: model.dateTime(),
    expires_at: model.dateTime(),
    issue_key: model.text(),
    source_order_id: model.text().nullable(),
    source_variant_id: model.text().nullable(),
    scope: model.json(),
    partial_redemption: model.boolean(),
    delivery_method: model.enum([...DELIVERY_METHODS]),
    delivery_status: model.enum([...DELIVERY_STATUSES]).default("pending"),
    delivered_at: model.dateTime().nullable(),
    delivery_attempts: model.number().default(0),
    recipient_name: model.text().nullable(),
    recipient_email: model.text().nullable(),
    message: model.text().nullable(),
    delivery_date: model.text().nullable(),
    purchaser_email: model.text().nullable(),
    voided_at: model.dateTime().nullable(),
    void_reason: model.text().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([
    { on: ["code"], unique: true },
    { on: ["issue_key"], unique: true },
    { on: ["source_order_id"] },
    { on: ["status", "expires_at"] },
  ])

export default GiftVoucher
