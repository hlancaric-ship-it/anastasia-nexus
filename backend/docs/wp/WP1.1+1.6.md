# WP1.1 + 1.6: konfigurace a platby

## Soubory balíku
- `medusa-config.ts` - Stripe, file, notification, Redis moduly (původní produkční kontroly zachovány)
- `src/scripts/anastasia-bootstrap.ts` - bootstrap e-shopu (idempotentní)
- `src/scripts/__tests__/anastasia-bootstrap.unit.spec.ts` - unit testy čisté konfigurace
- `.env.template` - šablona bez hodnot
- `docs/DEPLOY.md` - nasazení

## medusa-config.ts
- **Stripe** (`@medusajs/medusa/payment-stripe`, provider `pp_stripe_stripe`, webhook `/hooks/payment/stripe_stripe`) se registruje jen při nastaveném `STRIPE_API_KEY`. `automaticPaymentMethods: true` = Payment Element (karty, Apple Pay, Google Pay). Mimo produkci je `sk_live_`/`rk_live_` klíč odmítnut; v produkci je live klíč a `whsec_` povinný.
- **File**: lokální disk, při kompletním `S3_*` S3/R2.
- **Notification**: `notification-local` (log), kanály `email`, `feed`. SMTP/Resend je nutné doplnit vlastním providerem (viz DEPLOY.md).
- **Redis** (event bus, cache, workflow engine, locking) jen při `REDIS_URL`; jinak in-memory. V produkci bez Redisu varování.

## Bootstrap
Spuštění: `npx medusa exec ./src/scripts/anastasia-bootstrap.ts`. Vytvoří store (EUR), sales channel "ANASTASIA e-shop", publishable klíč, region Slovensko (EUR, `is_tax_inclusive: true`), daňový region SK s DPH 23 % (výchozí), 19 %, 5 %, sklad, profily (fyzický + digitální), fulfillment sety, možnosti dopravy (Kuriér 6 EUR, Digitální bez dopravy 0 EUR) a skupiny Bronze, Silver, Gold, VIP.

DPH: ze starého DB.sql (`ecProductPrice`): 27 cen 23 %, 2 ceny 20 %, 1 cena 19 %; ceny jsou koncové včetně DPH (`price_1_WithVat`); doprava kurýr 6 EUR s DPH, dobírka 2 EUR (dobírka nezřízena). Sazby 23/19/5 platí v SR od 2025 a je třeba je potvrdit s účetní.

## Pozor: věrnostní úrovně a NEXUS
`src/api/store/nexus-cart/route.ts` rozpoznává tier jen z názvu skupiny `^ZR\d+$`. Skupiny Bronze/Silver/Gold/VIP proto mají v `metadata.nexus_tier` kód ZR1..ZR4, ale adapter je zatím nevyužije, dokud integrátor neupraví čtení tieru (např. z `groups.metadata.nexus_tier`) a nenastaví shodné klíče `loyaltyTiers` v `MEDUSA_PRICING_POLICY_JSON`.

## Závislosti
`@medusajs/payment-stripe`, `@medusajs/file-s3` jsou v node_modules (tranzitivně přes `@medusajs/medusa`), doporučeno přidat explicitně na 2.19.0. Ostatní moduly jsou součástí `@medusajs/medusa`.

## Ověřeno
`tsc --noEmit` bez chyb v mých souborech, 6 unit testů prochází, načtení configu ověřeno s/bez Stripe a Redisu a odmítnutí live klíče mimo produkci. Bootstrap nebyl spuštěn proti reálné DB (není infrastruktura).
