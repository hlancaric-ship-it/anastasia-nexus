import { model } from "@medusajs/framework/utils"

export const ENTITLEMENT_STATUSES = ["active", "revoked"] as const
export const ENTITLEMENT_SOURCES = ["order", "admin", "migration"] as const

/**
 * Přístup zákaznice k digitálnímu produktu.
 * Jedna aktivní záznamová řada na (objednávka, produkt) je zaručena unikátním dedupe_key.
 */
const Entitlement = model
  .define("entitlement", {
    id: model.id({ prefix: "ent" }).primaryKey(),
    customer_id: model.text(),
    product_id: model.text(),
    variant_id: model.text().nullable(),
    order_id: model.text().nullable(),
    status: model.enum([...ENTITLEMENT_STATUSES]).default("active"),
    source: model.enum([...ENTITLEMENT_SOURCES]).default("order"),
    granted_at: model.dateTime(),
    expires_at: model.dateTime().nullable(),
    revoked_at: model.dateTime().nullable(),
    revoke_reason: model.text().nullable(),
    granted_by: model.text().nullable(),
    dedupe_key: model.text(),
    metadata: model.json().nullable(),
  })
  .indexes([
    { on: ["dedupe_key"], unique: true, where: "deleted_at IS NULL" },
    { on: ["customer_id", "status"] },
    { on: ["order_id"] },
    { on: ["product_id"] },
  ])

export default Entitlement
