# Katalog vlastních backend API a modulů

Snapshot: `claude/backend-integration` / `5066672b391a862077f38f99a182517b301a3f51`, 15. 10. 2026.

Přehled vznikl z exportů route souborů v `backend/src/api`. Nejde o OpenAPI specifikaci ani tvrzení o runtime ověření každé metody. Těla, query, chyby a oprávnění určují odkázané implementace a middleware.

Nativní Medusa rozhraní nejsou duplikována tímto výčtem. Patří sem katalog `/store/products`, košíky `/store/carts`, doprava `/store/shipping-options`, payment collections, customer/auth a nativní admin produkty, objednávky, regiony, sklady a doprava. Webhook Stripe obsluhuje registrovaný provider na `/hooks/payment/stripe_stripe`.

Store publishable klíč není customer přihlášení. `/store/customers/me/**`, chat, rezervace a další vlastnické operace mají příslušné guardy; veřejné či guest operace mají odlišný kontrakt. `/admin/**` patří správci (`user`); `/hooks/ops/edge-events` je podepsaný serverový ingest. Jemná oprávnění se nesmějí odvozovat jen z názvu cesty.

## Store API

| Metody | Cesta | Zdroj |
|---|---|---|
| GET | `/store/booking-slots` | [route.ts](../src/api/store/booking-slots/route.ts) |
| POST | `/store/bookings/:id/cancel` | [route.ts](../src/api/store/bookings/[id]/cancel/route.ts) |
| POST | `/store/bookings/:id/cart` | [route.ts](../src/api/store/bookings/[id]/cart/route.ts) |
| GET, POST | `/store/bookings` | [route.ts](../src/api/store/bookings/route.ts) |
| POST | `/store/carts/:id/consents` | [route.ts](../src/api/store/carts/[id]/consents/route.ts) |
| POST | `/store/chat/conversations/:id/messages` | [route.ts](../src/api/store/chat/conversations/[id]/messages/route.ts) |
| POST | `/store/chat/conversations/:id/read` | [route.ts](../src/api/store/chat/conversations/[id]/read/route.ts) |
| GET | `/store/chat/conversations/:id` | [route.ts](../src/api/store/chat/conversations/[id]/route.ts) |
| GET, POST | `/store/chat/conversations` | [route.ts](../src/api/store/chat/conversations/route.ts) |
| GET | `/store/chat/status` | [route.ts](../src/api/store/chat/status/route.ts) |
| POST | `/store/coupon-links` | [route.ts](../src/api/store/coupon-links/route.ts) |
| GET | `/store/custom` | [route.ts](../src/api/store/custom/route.ts) |
| POST | `/store/customers/me/erasure-request` | [route.ts](../src/api/store/customers/me/erasure-request/route.ts) |
| GET | `/store/customers/me/export` | [route.ts](../src/api/store/customers/me/export/route.ts) |
| GET | `/store/entitlements` | [route.ts](../src/api/store/entitlements/route.ts) |
| POST | `/store/gift-vouchers/apply` | [route.ts](../src/api/store/gift-vouchers/apply/route.ts) |
| POST | `/store/gift-vouchers/recipients` | [route.ts](../src/api/store/gift-vouchers/recipients/route.ts) |
| POST | `/store/gift-vouchers/remove` | [route.ts](../src/api/store/gift-vouchers/remove/route.ts) |
| GET | `/store/legal/versions` | [route.ts](../src/api/store/legal/versions/route.ts) |
| POST | `/store/media-access` | [route.ts](../src/api/store/media-access/route.ts) |
| POST | `/store/newsletter` | [route.ts](../src/api/store/newsletter/route.ts) |
| POST | `/store/newsletter/unsubscribe` | [route.ts](../src/api/store/newsletter/unsubscribe/route.ts) |
| POST | `/store/nexus-cart` | [route.ts](../src/api/store/nexus-cart/route.ts) |
| POST | `/store/nexus-checkout` | [route.ts](../src/api/store/nexus-checkout/route.ts) |
| POST | `/store/orders/:id/cancel` | [route.ts](../src/api/store/orders/[id]/cancel/route.ts) |
| POST | `/store/withdrawals` | [route.ts](../src/api/store/withdrawals/route.ts) |

## Admin API

| Metody | Cesta | Zdroj |
|---|---|---|
| GET, POST | `/admin/booking/availability` | [route.ts](../src/api/admin/booking/availability/route.ts) |
| GET, POST | `/admin/booking/types/:id` | [route.ts](../src/api/admin/booking/types/[id]/route.ts) |
| GET, POST | `/admin/booking/types` | [route.ts](../src/api/admin/booking/types/route.ts) |
| POST | `/admin/bookings/:id/cancel` | [route.ts](../src/api/admin/bookings/[id]/cancel/route.ts) |
| GET | `/admin/bookings` | [route.ts](../src/api/admin/bookings/route.ts) |
| POST | `/admin/chat/conversations/:id/messages` | [route.ts](../src/api/admin/chat/conversations/[id]/messages/route.ts) |
| POST | `/admin/chat/conversations/:id/read` | [route.ts](../src/api/admin/chat/conversations/[id]/read/route.ts) |
| GET, POST | `/admin/chat/conversations/:id` | [route.ts](../src/api/admin/chat/conversations/[id]/route.ts) |
| GET | `/admin/chat/conversations` | [route.ts](../src/api/admin/chat/conversations/route.ts) |
| POST | `/admin/chat/customers/:id/block` | [route.ts](../src/api/admin/chat/customers/[id]/block/route.ts) |
| POST | `/admin/coupon-links` | [route.ts](../src/api/admin/coupon-links/route.ts) |
| GET | `/admin/custom` | [route.ts](../src/api/admin/custom/route.ts) |
| POST | `/admin/customer-erasures/:id/execute` | [route.ts](../src/api/admin/customer-erasures/[id]/execute/route.ts) |
| GET | `/admin/customer-erasures` | [route.ts](../src/api/admin/customer-erasures/route.ts) |
| POST, DELETE | `/admin/customers/:id/notes/:note_id` | [route.ts](../src/api/admin/customers/[id]/notes/[note_id]/route.ts) |
| GET, POST | `/admin/customers/:id/notes` | [route.ts](../src/api/admin/customers/[id]/notes/route.ts) |
| POST | `/admin/email-templates/:template/preview` | [route.ts](../src/api/admin/email-templates/[template]/preview/route.ts) |
| GET, POST, DELETE | `/admin/email-templates/:template` | [route.ts](../src/api/admin/email-templates/[template]/route.ts) |
| GET | `/admin/email-templates` | [route.ts](../src/api/admin/email-templates/route.ts) |
| POST | `/admin/entitlements/:id/revoke` | [route.ts](../src/api/admin/entitlements/[id]/revoke/route.ts) |
| GET, POST | `/admin/entitlements` | [route.ts](../src/api/admin/entitlements/route.ts) |
| GET | `/admin/newsletter` | [route.ts](../src/api/admin/newsletter/route.ts) |
| GET | `/admin/ops/audit` | [route.ts](../src/api/admin/ops/audit/route.ts) |
| GET | `/admin/ops/events` | [route.ts](../src/api/admin/ops/events/route.ts) |
| GET | `/admin/vouchers/:id/transactions` | [route.ts](../src/api/admin/vouchers/[id]/transactions/route.ts) |
| POST | `/admin/vouchers/:id/void` | [route.ts](../src/api/admin/vouchers/[id]/void/route.ts) |
| POST | `/admin/vouchers/refund` | [route.ts](../src/api/admin/vouchers/refund/route.ts) |
| GET | `/admin/vouchers` | [route.ts](../src/api/admin/vouchers/route.ts) |
| GET, POST | `/admin/vouchers/settings` | [route.ts](../src/api/admin/vouchers/settings/route.ts) |
| POST | `/admin/withdrawals/:id` | [route.ts](../src/api/admin/withdrawals/[id]/route.ts) |
| GET | `/admin/withdrawals` | [route.ts](../src/api/admin/withdrawals/route.ts) |

## Serverové hooky

| Metody | Cesta | Zdroj |
|---|---|---|
| POST | `/hooks/ops/edge-events` | [route.ts](../src/api/hooks/ops/edge-events/route.ts) |

## Doménové moduly

| Modul | Registrace | Modely a služby |
|---|---|---|
| `auth-magic-link` | [index.ts](../src/modules/auth-magic-link/index.ts) | Provider nebo modul bez vlastních modelů v této složce; [service.ts](../src/modules/auth-magic-link/service.ts) |
| `booking` | [index.ts](../src/modules/booking/index.ts) | `booking`, `booking-availability`; [service.ts](../src/modules/booking/service.ts) |
| `chat` | [index.ts](../src/modules/chat/index.ts) | `chat-conversation`, `chat-customer-block`, `chat-message`, `chat-notification-state`; [service.ts](../src/modules/chat/service.ts) |
| `customer-privacy` | [index.ts](../src/modules/customer-privacy/index.ts) | `customer-erasure`, `customer-note`; [service.ts](../src/modules/customer-privacy/service.ts) |
| `email-template` | [index.ts](../src/modules/email-template/index.ts) | `email-template-override`; [service.ts](../src/modules/email-template/service.ts) |
| `entitlement` | [index.ts](../src/modules/entitlement/index.ts) | `entitlement`; [service.ts](../src/modules/entitlement/service.ts) |
| `gift-voucher` | [index.ts](../src/modules/gift-voucher/index.ts) | `gift-voucher`, `gift-voucher-settings`, `gift-voucher-transaction`; [service.ts](../src/modules/gift-voucher/service.ts) |
| `legal` | [index.ts](../src/modules/legal/index.ts) | `legal-consent`, `legal-withdrawal`, `newsletter-consent`, `newsletter-consent-event`; [service.ts](../src/modules/legal/service.ts) |
| `notification-log` | [index.ts](../src/modules/notification-log/index.ts) | Provider nebo modul bez vlastních modelů v této složce; [service.ts](../src/modules/notification-log/service.ts) |
| `notification-zeptomail` | [index.ts](../src/modules/notification-zeptomail/index.ts) | Provider nebo modul bez vlastních modelů v této složce; [service.ts](../src/modules/notification-zeptomail/service.ts) |
| `ops-audit` | [index.ts](../src/modules/ops-audit/index.ts) | `ops-audit-entry`, `ops-event`; [service.ts](../src/modules/ops-audit/service.ts) |

Modely nejsou úplné fyzické SQL schéma: některé moduly vytvářejí pomocné tabulky přímo migrací. Autoritou databázového schématu jsou také `src/modules/*/migrations`, nativní moduly a jejich vazby. Například rate-limit tabulky nejsou všechny samostatné modelové soubory.

## Aktualizace

Při přidání nebo přejmenování route aktualizovat metodu i cestu a příslušnou doménovou dokumentaci. Při bezpečnostní změně číst globální `middlewares.ts` i middleware balíku; export handleru sám nepopisuje celý autentizační řetězec.

Celkem vlastních route souborů v tomto snapshotu: **58**.
