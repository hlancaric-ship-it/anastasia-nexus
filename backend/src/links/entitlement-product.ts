import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import EntitlementModule from "../modules/entitlement"

/** Read-only link přes pole product_id: query.graph({ entity: "entitlement", fields: ["product.*"] }) */
export default defineLink(
  { linkable: EntitlementModule.linkable.entitlement, field: "product_id" },
  ProductModule.linkable.product,
  { readOnly: true }
)
