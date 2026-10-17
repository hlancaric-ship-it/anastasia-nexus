# NEXUS Commerce Admin — audit repozitáře (fáze 0)

**Datum:** 17. 10. 2026 · **Větev:** `feat/anastasia-admin` · **Zadání:** MASTER IMPLEMENTATION BRIEF (NEXUS Commerce Admin)

Značení: **[OVĚŘENO]** = viděno v kódu nebo ve výpisu souborů v tomto průchodu. **[ODVOZENO]** = usuzováno ze struktury, do hloubky nekontrolováno.
Tento audit doplňuje `docs/ADMIN-SELFSERVICE-AUDIT.md` (13. 10.) a `docs/REQUIREMENTS_MATRIX.md`. Co je zapsané tam, se tu neopakuje.

---

## A. Současná architektura

```
 Prohlížeč Lucie                     Prohlížeč zákaznice
 anastasia-admin/ (SPA, vanilla ESM)    storefront-prototype/ (statický build)
        │  JWT admin user                     │  publishable key + customer JWT
        ▼                                     ▼
 ┌──────────────────────── Medusa 2.19 (backend/) ─────────────────────────┐
 │ nativní moduly: product, pricing, promotion, order, customer, inventory,│
 │   stock-location, fulfillment(manual), payment(Stripe), file(S3/R2),    │
 │   auth(emailpass + magic-link), notification(ZeptoMail/log), user       │
 │ vlastní moduly: entitlement, booking, gift-voucher, chat, ops-audit,    │
 │   email-template, legal, customer-privacy, auth-security                │
 │ NEregistrováno: membership (Klub) – dodělává Codex                      │
 │ subscribers (24), jobs (9), workflows (booking/gift-voucher checkout)   │
 └───────────────┬─────────────────────────────────────┬───────────────────┘
                 │ HMAC služební auth                  │ webhooky / ops eventy
                 ▼                                     ▼
 ┌──────────────── NEXUS Worker (nexus/, Cloudflare) ──────────────────────┐
 │ routes: nexusPricing, nexusSafeOrder, voucher, klubSubscribe, aiGateway, │
 │   mediaDelivery, medusaWebhook, shoptetWebhook, issuance, operations     │
 │ core: audit, idempotency, state-machine, tenant, validation, snapshot    │
 │ domains: pricing, safeorder, voucher, campaign, warehouse, billing, …    │
 │ D1 nexus-voucher, Durable Object SecurityCoordinator                     │
 └──────────────────────────────────────────────────────────────────────────┘
```

**[OVĚŘENO]** klíčová fakta:
- Košík a checkout jdou přes `/store/nexus-cart` a `/store/nexus-checkout`. Cenu počítá NEXUS Pricing a riziko SafeOrder (`nexus-checkout/safeorder.ts`). Frontend nic nepočítá, tedy pravidlo „ceny jen na backendu“ je dodržené.
- Admin autentizace je nativní Medusa (admin user + JWT). **RBAC v Meduse 2.19 existuje (`@medusajs/rbac`, `/admin/rbac/roles`), ale je vypnutý** (feature flag `MEDUSA_FF_RBAC`, výchozí `false`). Dnes má každý admin user plná práva.
- Audit admin změn: `lib/observability/audit` (`adminActor`, `auditAdminChange`) a modul `ops-audit` + `/admin/ops/audit`.
- Bezpečná editace základní ceny existuje: `POST /admin/shop-prices/:id` (zod, zámek, optimistická kontrola `expected_amount`, audit, odmítá složité price sety).
- Osobní vzhled adminu je na backendu: `GET/POST /admin/my-theme` (metadata uživatele, zámek, audit).
- **Existují dva admin frontendy:** nový `anastasia-admin/` (SPA, port 4178) a starší rozšíření Medusa adminu `backend/src/admin/routes/*` (sprava-obchodu, vouchers, chat, booking, coupon-links, vzhlad). Podle rozhodnutí z 17. 10. je Medusa `/app` jen skrytý fallback pro vývoj.
- CI: `.github/workflows/` obsahuje `admin-c5.yml`, `admin-theme.yml`, `membership-state.yml` a `wave1-p0.yml`. Integrační HTTP testy jsou v `backend/integration-tests/http/` (24 souborů), NEXUS má vlastní vitest sady.
- Zálohy: `backend/src/scripts/backup-local.mjs`, `restore-local.mjs`, `db-recovery.cjs` a postup v `backend/docs/DEPLOY.md`.

## B. Gap analýza (vůči briefu)

| Oblast z briefu | Stav | Co existuje / co chybí |
|---|---|---|
| Dashboard | **ČÁSTEČNĚ** | 3 KPI z reálných dat a seznam úkolů. Chybí upozornění z readiness a nedávné položky. |
| Setup Center / onboarding | **CHYBÍ** | Není perzistentní stav kroků. Data pro detekci (regiony, sklady, doprava, platby) jsou dostupná přes nativní API. |
| Store Readiness | **CHYBÍ** | Kontroly lze odvodit z reálných dat: produkty bez obrázku, ceny, skladu nebo kategorie, legal verze, doprava. |
| Produkty | **ČÁSTEČNĚ** | V SPA: seznam, vytvoření, detail, kategorie, popis a akce. Chybí: varianty, obrázky (upload), SEO, duplikace, archiv, hromadné úpravy, plánované zveřejnění a indikátor úplnosti. Import existuje jen jako skript (`import-anastasia-catalog.ts`), ne v UI. |
| Ceny | **ČÁSTEČNĚ – RIZIKO** | Bezpečná route `/admin/shop-prices/:id` existuje, ale **SPA ji nepoužívá**: `app.mjs:273` píše cenu nativním `POST /admin/products/:id/variants/:vid` s `prices[]`. To přepíše celý price set (může smazat jiné měny nebo pravidla) a nezapíše se audit. Sale price list funguje. Chybí simulace a vysvětlení ceny z NEXUS. |
| Promoce | **ČÁSTEČNĚ** | Nativní promotions (kupóny) jsou vidět. Chybí průvodce kampaní a detekce konfliktů. `coupon-links` aktivace = `PENDING_PRICING_INTEGRATION`. |
| Sklad | **ČÁSTEČNĚ** [ODVOZENO] | Nativní inventory a stock-location jsou dostupné, existuje test `stock-availability-http-checks`. V SPA není žádná obrazovka skladu. |
| Objednávky | **ČÁSTEČNĚ** | Seznam a detail jsou v SPA. Chybí akce fulfillment, shipment, refund a return v UI (nativní API existuje). Self-cancel zákaznice existuje. |
| Zákaznice | **IMPLEMENTOVÁNO (základ)** | Seznam a detail jsou v SPA, k tomu poznámky (`/admin/customers/:id/notes`), GDPR výmazy a přístupy (entitlements). |
| Doprava | **ČÁSTEČNĚ** [ODVOZENO] | Fulfillment je manual a existuje test `shipping-settings-http-checks`. V SPA chybí obrazovka i průvodce. |
| Platby | **ČÁSTEČNĚ** | Stripe provider s webhooky a ochranou live/test klíčů. Admin UI pro platby chybí, refund jde jen přes nativní API. |
| Storefront / Visual Builder | **CHYBÍ** | Storefront je statický prototyp. Témata jsou v kódu (`site-themes.mjs`, `center-themes.mjs`). Chybí registr komponent, draft/publish i verze. |
| CMS / stránky | **CHYBÍ** | Mimo `legal` (verze právních textů) a `email-template` neexistuje model stránek. |
| Média | **ČÁSTEČNĚ** | Nativní `/admin/uploads` (S3/R2), chráněná média `store/media-access`. Knihovna médií v UI chybí. |
| Marketing / SEO | **ČÁSTEČNĚ** | Newsletter (admin i store), edge redirecty (`export-edge-redirects.ts`). SEO metadata v UI chybí. |
| Analytika | **CHYBÍ** | V UI nic. Data k objednávkám jsou, konverze ne (bez trackingu se nesmí vymýšlet). |
| Automatizace | **ČÁSTEČNĚ** | 9 jobů a 24 subscriberů (e-maily, entitlementy, vouchery, retence). Chybí UI, log běhů a uživatelská konfigurace. |
| Integrace | **ČÁSTEČNĚ** | NEXUS konektory (accounting, safeorder, pricing, shoptet, …), stav `/admin/ops/nexus` (bez env vrací 503). |
| Uživatelé a role | **CHYBÍ (připraveno)** | Nativní RBAC je za vypnutým flagem. Pozvánky uživatelů jsou nativní, v SPA chybí. |
| Klub / členství | **ČÁSTEČNĚ** | Modul v kódu, neregistrovaný, bez HTTP → **Codex**. |
| Konzultace / chat / vouchery | **IMPLEMENTOVÁNO (API)**, UI částečně | Admin API je kompletní (cancel, types, availability, odpověď, read, block, void, refund). SPA zatím jen vypisuje seznamy. |
| Pomoc / kontextová nápověda | **ČÁSTEČNĚ** | Statická stránka Pomoc, bez kontextu. |
| Globální vyhledávání | **CHYBÍ** | Hledání jen v rámci jedné agendy. |

**Další nálezy:**
1. Vzhled adminu v SPA se ukládá do `localStorage` (`app.mjs:547–565`), i když backend `/admin/my-theme` existuje. Lucia o barvy přijde na jiném zařízení.
2. Dvě admin vrstvy (SPA a Medusa extensions) duplikují vouchery, chat, booking a ceny. Je potřeba určit, která je zdroj pravdy pro UI.
3. Bod 1 z auditu 13. 10. (OKFISH značky v `StaticPricingConfigurationProvider.ts`) je **vyřešený**: grep `DELPHIN` = 0.

## C. Navržená architektura administrace

- **Frontend:** `anastasia-admin/` zůstává jediný merchant admin (SPA bez buildu, karty, slovensky). Medusa extensions se nerozšiřují a po převzetí funkcí do SPA se zmrazí.
- **Zápisy jen přes „aplikační služby“:** citlivé mutace (ceny, sklad, refundy, publikace) jdou přes vlastní `/admin/*` routes se zod validací, zámkem, optimistickou kontrolou a `auditAdminChange`, podle vzoru `shop-prices`. Nativní endpointy jen tam, kde nehrozí tichá ztráta dat.
- **Ceny:** admin ukazuje výsledek z NEXUS Pricing (náhled nebo simulace přes adaptér), sám nic nepočítá.
- **Oprávnění:** zapnout nativní RBAC (`MEDUSA_FF_RBAC`) až po ověření na syntetických datech. Do té doby jeden vlastník.
- **Onboarding a readiness:** nový modul `store-setup` (stav kroků v DB) a `GET /admin/readiness` počítaný z reálných dat. Každá kontrola vrací závažnost, počet a odkaz do SPA.
- **CMS a builder (Fáze 2):** modul `content` (stránka → verze → bloky z uzavřeného registru, draft, publish, rollback). Storefront čte jen publikované verze. Sanitizace na backendu, náhled přes podepsaný token.
- **AI:** jen návrhy přes stejné routes. Nikdy v cestě peněz (mantinel 4).

## D. Roadmapa (podle závislostí, ne podle čísel fází)

| # | Krok | Závislost | Do 23. 10.? |
|---|---|---|---|
| 1 | Oprava zápisu ceny v SPA → `/admin/shop-prices/:id` a vzhled → `/admin/my-theme` | – | **ano** |
| 2 | Produkt end-to-end: obrázky (`/admin/uploads`), sklad, varianty, SEO, archiv, úplnost a validace před zveřejněním | 1 | **ano** |
| 3 | `GET /admin/readiness` a karta „Pripravenosť obchodu“ na dashboardu | 2 | **ano** |
| 4 | Objednávky: fulfillment, shipment, refund (nativní API) s potvrzením | – | ano |
| 5 | Konzultace, chat a vouchery: akce v SPA (API hotové) | – | ano |
| 6 | Klub v SPA | Codexův PR | podle Codexe |
| 7 | Doprava a platby: přehled a průvodce | 3 | po termínu |
| 8 | Onboarding (`store-setup`) | 3, 7 | po termínu |
| 9 | RBAC a pozvánky uživatelů | ověření flagu | po termínu |
| 10 | CMS → Visual Builder → témata s verzemi | 8 | Fáze 2 |
| 11 | Analytika, automatizace UI, globální hledání, kontextová nápověda | 3 | Fáze 2 |

Brief v plném rozsahu (18 modulů, builder, CMS, RBAC, E2E) je realisticky na několik týdnů. Do 23. 10. jsou reálné kroky 1–5 (6 podle Codexe).

## E. Registr rizik

| Riziko | Dopad | Opatření |
|---|---|---|
| Nativní zápis ceny v SPA přepíše price set | ztráta cen nebo měn, bez auditu | krok 1 (route `shop-prices`) |
| Všichni admini mají plná práva | chyba nebo zneužití bez omezení | RBAC flag, citlivé akce s potvrzením |
| Dvě admin vrstvy | nekonzistence, dvojí údržba | SPA = zdroj pravdy, extensions zmrazit |
| Membership neregistrovaný | Klub nefunguje | Codex, nedublovat |
| `coupon-links` jsou PENDING | odkazy s kupónem neaktivují slevu | dořešit napojení na NEXUS Pricing |
| Builder spouští libovolný kód | XSS, rozbitý checkout | uzavřený registr komponent, checkout needitovatelný |
| In-memory moduly bez Redis | nebezpečné v produkci | `REDIS_URL` povinně při deployi (config už varuje) |
| Readiness by „kreslil“ procenta | zavádějící | jen z reálných dotazů, bez dat = „nedá sa overiť“ |

## F. První vertikální řez (doporučení)

**„Produkt od nuly po zveřejnění“** v `anastasia-admin/`:
1. vytvoření (existuje) → **cena přes `/admin/shop-prices/:id`** (audit a ochrana);
2. obrázek přes `/admin/uploads` + přiřazení k produktu;
3. sklad: množství na stock-location přes nativní inventory;
4. kontrola úplnosti (název, cena, obrázek, kategorie, sklad) a zveřejnění zablokované, dokud chybí povinné;
5. stejné kontroly jako backend `GET /admin/readiness` → karta na dashboardu;
6. integrační test v `backend/integration-tests/http/` (syntetická data) a spuštění na GitHub Actions.

Tento řez prověří celou architekturu: SPA → validovaná route → nativní moduly → audit → readiness → test.
