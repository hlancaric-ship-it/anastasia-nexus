import { defineMiddlewares } from "@medusajs/framework/http"
import { entitlementStoreMiddlewares } from "./store/entitlements/middlewares"

export default defineMiddlewares({
  routes: [...entitlementStoreMiddlewares],
})
