import { defineMiddlewares } from "@medusajs/framework/http"
import { entitlementStoreMiddlewares } from "./store/entitlements/middlewares"
import { bookingStoreMiddlewares } from "./store/bookings/middlewares"
import { couponLinkMiddlewares } from "./admin/coupon-links/middlewares"
import { giftVoucherAdminMiddlewares } from "./admin/vouchers/middlewares"
import { giftVoucherStoreMiddlewares } from "./store/gift-vouchers/middlewares"
import { bookingAdminMiddlewares } from "./admin/booking/middlewares"
import { chatMiddlewares } from "./chat-middlewares"
import { opsAdminMiddlewares } from "./admin/ops/middlewares"
import { emailTemplateAdminMiddlewares } from "./admin/email-templates/middlewares"
import { legalMiddlewares } from "./legal-middlewares"
import { customerPrivacyMiddlewares } from "./customer-privacy-middlewares"
import { requestIdMiddleware } from "../lib/observability/request-id"

export default defineMiddlewares({
  routes: [
    // Korelace: musí být první, aby request_id měly i chyby autentizace a validace.
    { matcher: "/*", middlewares: [requestIdMiddleware] },
    // Podpis dávky z NEXUS Workeru se ověřuje nad surovým tělem.
    { matcher: "/hooks/ops/edge-events", method: ["POST"], bodyParser: { preserveRawBody: true, sizeLimit: "300kb" } },
    // Tombstone vymazané zákaznice musí platit dřív než jakýkoli endpoint (X2).
    ...customerPrivacyMiddlewares,
    ...entitlementStoreMiddlewares,
    ...bookingStoreMiddlewares,
    ...couponLinkMiddlewares,
    ...giftVoucherAdminMiddlewares,
    ...giftVoucherStoreMiddlewares,
    ...bookingAdminMiddlewares,
    ...chatMiddlewares,
    ...opsAdminMiddlewares,
    ...emailTemplateAdminMiddlewares,
    ...legalMiddlewares,
  ],
})
