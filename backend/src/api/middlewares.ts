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
import { orderSelfCancelMiddlewares } from "./order-self-cancel-middlewares"
import { authMagicLinkMiddlewares } from "./auth-magic-link-middlewares"
import { requestIdMiddleware } from "../lib/observability/request-id"
import { nexusCartMiddlewares } from "./store/nexus-cart/middlewares"
import { membershipStoreMiddlewares } from "./store/memberships/middlewares"
import { contactStoreMiddlewares } from "./store/contact/middlewares"
import { feedAdminMiddlewares } from "./admin/feeds/middlewares"
import { carrierAdminMiddlewares } from "./admin/carriers/middlewares"
import { pageAdminMiddlewares } from "./admin/pages/middlewares"
import { mediaAdminMiddlewares } from "./admin/media/middlewares"
import { contentAdminMiddlewares } from "./admin/content/middlewares"

export default defineMiddlewares({
  routes: [
    // Korelace: musí být první, aby request_id měly i chyby autentizace a validace.
    { matcher: "/*", middlewares: [requestIdMiddleware] },
    // Podpis dávky z NEXUS Workeru se ověřuje nad surovým tělem.
    { matcher: "/hooks/ops/edge-events", method: ["POST"], bodyParser: { preserveRawBody: true, sizeLimit: "300kb" } },
    { matcher: "/hooks/nexus/booking-order", method: ["POST"], bodyParser: { preserveRawBody: true, sizeLimit: "8kb" } },
    // Tombstone vymazané zákaznice musí platit dřív než jakýkoli endpoint (X2).
    ...customerPrivacyMiddlewares,
    ...authMagicLinkMiddlewares,
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
    ...orderSelfCancelMiddlewares,
    ...nexusCartMiddlewares,
    ...contactStoreMiddlewares,
    // Klub: všechny /store/memberships* jen přihlášená zákaznice (session/bearer).
    ...membershipStoreMiddlewares,
    // Produktové feedy a dopravci: len přihlášený správce.
    ...feedAdminMiddlewares,
    ...carrierAdminMiddlewares,
    // Texty stránok, knihovna obrázkov a obsah webu: len přihlášený správce.
    ...pageAdminMiddlewares,
    ...mediaAdminMiddlewares,
    ...contentAdminMiddlewares,
  ],
})
