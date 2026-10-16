import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ShoppingBag } from "@medusajs/icons"
import Shop from "./Shop"
export const config = defineRouteConfig({ label: "Správa obchodu", icon: ShoppingBag })
export default Shop
