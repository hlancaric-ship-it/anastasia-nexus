import { defineMiddlewares } from "@medusajs/framework/http"
import { entitlementStoreMiddlewares } from "./store/entitlements/middlewares"
import { bookingStoreMiddlewares } from "./store/bookings/middlewares"
import { couponLinkMiddlewares } from "./admin/coupon-links/middlewares"
import { nexusCartMiddlewares } from "./store/nexus-cart/middlewares"

export default defineMiddlewares({
  routes: [...entitlementStoreMiddlewares, ...bookingStoreMiddlewares, ...couponLinkMiddlewares, ...nexusCartMiddlewares],
})
