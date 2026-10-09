import { defineMiddlewares } from "@medusajs/framework/http"
import { entitlementStoreMiddlewares } from "./store/entitlements/middlewares"
import { bookingStoreMiddlewares } from "./store/bookings/middlewares"

export default defineMiddlewares({
  routes: [...entitlementStoreMiddlewares, ...bookingStoreMiddlewares],
})
