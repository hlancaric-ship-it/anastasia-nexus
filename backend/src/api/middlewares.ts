import { defineMiddlewares } from "@medusajs/framework/http"
import { entitlementStoreMiddlewares } from "./store/entitlements/middlewares"
import { bookingStoreMiddlewares } from "./store/bookings/middlewares"
import { couponLinkMiddlewares } from "./admin/coupon-links/middlewares"
import { bookingAdminMiddlewares } from "./admin/booking/middlewares"
import { chatMiddlewares } from "./chat-middlewares"

export default defineMiddlewares({
  routes: [...entitlementStoreMiddlewares, ...bookingStoreMiddlewares, ...couponLinkMiddlewares, ...bookingAdminMiddlewares, ...chatMiddlewares],
})
