import { model } from "@medusajs/framework/utils"
import { DELIVERY_METHODS, SCOPE_TYPES } from "../policy"

/** Jediný řádek s klíčem "default": konfigurace z adminu. Vystavený poukaz si nese vlastní snapshot. */
const GiftVoucherSettings = model
  .define("gift_voucher_settings", {
    id: model.id({ prefix: "gvset" }).primaryKey(),
    key: model.text(),
    enabled: model.boolean().default(true),
    values_minor: model.json(),
    validity_months: model.number(),
    scope_type: model.enum([...SCOPE_TYPES]),
    category_ids: model.json(),
    partial_redemption: model.boolean(),
    delivery_method: model.enum([...DELIVERY_METHODS]),
    updated_by: model.text().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([{ on: ["key"], unique: true }])

export default GiftVoucherSettings
