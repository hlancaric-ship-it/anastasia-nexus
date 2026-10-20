import { model } from "@medusajs/framework/utils"

export const ENTITLEMENT_STATUSES = ["active", "revoked"] as const
export const ENTITLEMENT_SOURCES = ["order", "admin", "migration"] as const

/**
 * Přístup zákaznice k digitálnímu produktu.
 * Jedna aktivní záznamová řada na (tenant, dedupe_key) je zaručena unikátním indexem.
 * Tenant izolace je řešena sloupcem tenant_id v databázi.
 */
const Entitlement = model
  .define("entitlement", {
    id: model.id({ prefix: "ent" }).primaryKey(),
    tenant_id: model.text().default("default"),
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
    { on: ["tenant_id", "dedupe_key"], unique: true, where: "deleted_at IS NULL" },
    { on: ["customer_id", "tenant_id", "status"] },
    { on: ["order_id", "tenant_id"] },
    { on: ["product_id", "tenant_id"] },
    { on: ["tenant_id", "granted_at"] },
  ])

export default Entitlement
