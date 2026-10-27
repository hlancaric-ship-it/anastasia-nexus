import { defineMiddlewares } from "@medusajs/framework/http"
import { entitlementStoreMiddlewares } from "./store/entitlements/middlewares"
import { resetJournalStoreMiddlewares } from "./store/reset-journal/middlewares"
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
import { authRevokeMiddlewares } from "./auth-revoke-middlewares"
import { nexusAuthStoreMiddlewares } from "./store/nexus-auth/middlewares"
import { requestIdMiddleware } from "../lib/observability/request-id"
import { nexusCartMiddlewares } from "./store/nexus-cart/middlewares"
import { requireNexusCheckoutForCouponCart } from "./store/carts/complete-guard"
import { rejectServerOwnedCartMetadata } from "./store/carts/metadata-guard"
import { customerCreateMiddlewares } from "./store/customers/create-guard"
import { adminCapabilityMiddlewares } from "./admin-capability-middlewares"
import { membershipStoreMiddlewares } from "./store/memberships/middlewares"
import { contactStoreMiddlewares } from "./store/contact/middlewares"
import { feedAdminMiddlewares } from "./admin/feeds/middlewares"
import { carrierAdminMiddlewares } from "./admin/carriers/middlewares"
import { protectAdminRoleMetadata, protectAdminUserCreation, requireInviteEmail } from "../lib/admin/role-guard"
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
    // Tombstone vymazaného zákazníka musí platit dřív než jakýkoli endpoint (X2).
    ...customerPrivacyMiddlewares,
    // Odhlásený zákazník nesmie používať svoj JWT (Medusa tokeny sú bezstavové).
    ...authRevokeMiddlewares,
    ...authMagicLinkMiddlewares,
    // Zákazník sa zakladá len na e-mail, ktorý jeho identita overila (inak prevzatie účtu správcu).
    ...customerCreateMiddlewares,
    // Odhlásenie: iba platný Bearer token zákazníka, odhlásenie ho zneplatní na serveri.
    ...nexusAuthStoreMiddlewares,
    ...entitlementStoreMiddlewares,
    // Zrkadielko a štruktúra programu RESET 40+: len prihlásený zákazník s aktívnym prístupom.
    ...resetJournalStoreMiddlewares,
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
    // Natívne dokončenie košíka s kupónom sa zakáže (409 USE_NEXUS_CHECKOUT): použitie kupónu
    // zapisuje len /store/nexus-checkout, inak by sa jednorazový kupón dal použiť opakovane.
    {
      matcher: "/store/carts/:id/complete",
      method: ["POST"],
      middlewares: [requireNexusCheckoutForCouponCart],
    },
    // `cart.metadata.nexus_coupon` zapisuje len server – natívne API ho od klienta neprijme.
    { matcher: "/store/carts", method: ["POST"], middlewares: [rejectServerOwnedCartMetadata] },
    { matcher: "/store/carts/:id", method: ["POST"], middlewares: [rejectServerOwnedCartMetadata] },
    ...contactStoreMiddlewares,
    // Klub: všechny /store/memberships* jen přihlášený zákazník (session/bearer).
    ...membershipStoreMiddlewares,
    // Produktové feedy a dopravci: len přihlášený správce.
    ...feedAdminMiddlewares,
    ...carrierAdminMiddlewares,
    // Texty stránok, knihovna obrázkov a obsah webu: len přihlášený správce.
    ...pageAdminMiddlewares,
    ...mediaAdminMiddlewares,
    ...contentAdminMiddlewares,
    // Serverová hranica rolí: asistent nemení ceny, kupóny, poukazy, prístupy ani API kľúče.
    ...adminCapabilityMiddlewares,
    // Rola administrátora (metadata.anastasia_role) a zakladanie nových účtov:
    // iba vlastník. Bez toho by asistent prepísal metadáta a zvýšil si práva.
    {
      matcher: "/admin/users/:id",
      method: ["POST"],
      middlewares: [protectAdminRoleMetadata],
    },
    {
      matcher: "/admin/users",
      method: ["POST"],
      middlewares: [protectAdminUserCreation],
    },
    // Pozvánka založí účet s predvolenou rolou `owner` a zmazaním by asistent
    // mohol odstrániť vlastníka – oboje iba vlastník (accept rieši pozvaný sám).
    // Pozvánka sa prijíma len na pozvaný e-mail (natívna trasa by prijala ľubovoľný).
    {
      matcher: "/admin/invites/accept",
      method: ["POST"],
      middlewares: [requireInviteEmail],
    },
    {
      matcher: "/admin/invites",
      method: ["POST"],
      middlewares: [protectAdminUserCreation],
    },
    {
      matcher: "/admin/invites/:id",
      method: ["POST", "DELETE"],
      middlewares: [protectAdminUserCreation],
    },
    {
      matcher: "/admin/invites/:id/resend",
      method: ["POST"],
      middlewares: [protectAdminUserCreation],
    },
    {
      matcher: "/admin/users/:id",
      method: ["DELETE"],
      middlewares: [protectAdminUserCreation],
    },
  ],
})
