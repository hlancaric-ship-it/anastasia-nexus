import { defineLink } from "@medusajs/framework/utils"
import CustomerModule from "@medusajs/medusa/customer"
import EntitlementModule from "../modules/entitlement"

/** Read-only link přes pole customer_id (bez spojovací tabulky): query.graph({ entity: "entitlement", fields: ["customer.*"] }) */
export default defineLink(
  { linkable: EntitlementModule.linkable.entitlement, field: "customer_id" },
  CustomerModule.linkable.customer,
  { readOnly: true }
)
