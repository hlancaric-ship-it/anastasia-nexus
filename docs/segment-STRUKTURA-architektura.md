# ANASTASIA ekosystém — STRUKTURA & ARCHITEKTURA (podklad pro návrh migrace)

**Datum:** 7. 10. 2026 · **Zdroj:** zdrojáky všech tří webů (statická inventura). Kompletní mapa endpointů, datových modelů, modulů, závislostí a integračních bodů — základ pro projektování cílové architektury.

---

## A) anastasiaoz.eu — E-SHOP (Umbraco/.NET)

### Platforma
- **.NET Framework 4.7.2** (Windows/IIS), **Umbraco 8.17.1** CMS (EOL od 24.2.2025), **MS SQL Server**, ORM **NPoco 3.9.4**, DI **LightInject**, search **Lucene.Net/Examine**, logy **Serilog**.
- Řešení: 3 projekty — `dufeksoft.ecommerce.web` (web), `dufeksoft.ecommerce-lib` (byznys logika), `dufeksoft.ecommerce.import` (dev-seed import nástroj).

### Moduly / controllery (39 celkem)
- **Katalog:** Product, ProductPublic, ProductApi, Category, CategoryPublic, CategoryApi, Product2Category(+Api), Producer, ProductPrice, Availability, ProductRelation.
- **Objednávka/košík:** Quote, QuoteApi, QuoteAdmin, QuoteAdminProduct, QuoteLink (QR/ambasador), QuoteState, User2Product, Product2Quote.
- **Zákazník:** Customer(Admin/Data/Register), Member, EcMember, User2Quote, UserProp.
- **Platba/doprava:** **TatraCardPay**, PaymentState, PaymentType, TransportType, Country.
- **Slevy:** Coupon.
- **Dotazníky:** Questionnaire(+Form/Item/FormItem).
- **Web/ostatní:** Contact, Cookies, Website(Api), SysConst, FileUpload(Api).
- **Báze:** `_BaseApiController` (dědí všechny API — **bez `[Authorize]`** = kořenová vada), `_BaseController`.

### Datový model — byznysové tabulky `ec*` (21) + Umbraco CMS tabulky (`umbraco*`, `cms*`)
Klíčové:
- **ecProduct** (PK `uniqueidentifier`): productCode, productName, productDescription(ntext), productImg/Url, productMeta*, producerKey, availabilityKey, productIsVisible/New/Action/Sale(bit), **availablePcs(decimal)**, electronicProductWeb. → pozn.: cena NENÍ zde, je v ecProductPrice.
- **ecProductPrice:** cenová tabulka (ceny vždy z DB — správně).
- **ecQuote** (objednávka, PK `uniqueidentifier`): dateCreate/Finished, sessionId, finishedSessionId, **quoteYear+quoteNumber** (číslování), quotePriceNoVat/WithVat, quoteState, quotePriceState, note. → pozn.: identita přes sessionId (ne server session) = kořen „důvěra klientovi".
- **ecCoupon:** couponCode, discountPerc, discountAmount, validFrom/Until, **useMultiple(bit)**, quotePriceMin/Max, productCodes. → pozn.: jednorázovost přes `useMultiple`, není per-zákazník = double-dipping.
- Další: ecCategory, ecCustomer, ecUser, ecUserProp, ecCountry, ecCoupon, ecPaymentState/Type, ecTransportType, ecProducer, ecAvailability, ecSysConst, ecQuestionnaire*.

### Integrace
- **Platba:** Tatra banka CardPay (`TatraCardPayController` + `dufeksoft.lib` DLL — jen binárka).
- **Mail:** SMTP přes Active24 (`ContactController`).
- **Search:** interní Lucene/Examine.
- Žádné externí CRM/marketing/analytics napojení v kódu.

### Závislosti se známými CVE (z .csproj)
- Newtonsoft.Json 12.0.0 (CVE-2024-21907), ICSharpCode.SharpZipLib 0.86 (CVE-2018-1002208), Microsoft.Owin 4.0.1 (CVE-2020-1045), + celá Umbraco 8 EOL bez záplat.

---

## B) anastasia.academy + aianastasia.com — DVOJČATA (React + FastAPI, MGX šablona)

### Platforma (shodná pro oba)
- **Frontend:** React + Vite SPA. **Backend:** **FastAPI** (Python), **SQLAlchemy 2.0 async** + **asyncpg** (PostgreSQL), migrace **alembic**, auth **python-jose** (JWT) + OIDC/PKCE.
- **Deploy:** `mangum` → **AWS Lambda handler** (`lambda_handler.py`), hostováno na atoms.dev za Cloudflare.
- **AI:** `openai==2.16.0` SDK proti Atoms AI Hub (deepseek/gpt-5/gemini/claude).
- **Společné moduly:** `auth` (OIDC login/callback/token/me/logout), `admin/settings` (7 endpointů, čte/píše `.env`), `storage` (8, OSS bucket přes presigned URL), `users` (profile), `database/health`, `aihub`.
- **Dead code v obou:** `stripe` v requirements + `services/payment.py` (ze šablony, nenapojené — žádný checkout).

### Mapa endpointů — spojená struktura šablony
Každá „entita" = stejných 9 CRUD endpointů: `GET /`, `GET /all`, `GET /{id}`, `POST /`, `POST /batch`, `PUT /batch`, `PUT /{id}`, `DELETE /batch`, `DELETE /{id}`. **Všechny jen `Depends(get_db)` = bez auth** (kořenová vada).

| | anastasia.academy | aianastasia.com |
|---|---|---|
| Entity (CRUD) | article_categories, articles, contact_messages, media, newsletter_contacts, page_contents, program_topics, programs (**8**) | analytics, articles, consultations, leads, reviews (**5**) |
| AI Hub | gentxt, genimg, **genvideo, genaudio, transcribe, analyzepdf** (**6**) | gentxt, genimg (**2**) |
| Mail | — | `POST /email/contact` |
| Zaměření | vzdělávací obsah (programy, články, média, newsletter) | lékový AI poradce + leady/konzultace/recenze |

### Datový model

**academy (8 tabulek + users/oidc):**
- `articles` (slug, title, excerpt, content, category, author, cover_image, seo_title, meta_description, related_program_slug, status, **language, translation_key**, sort_order…) — vícejazyčnost přes `language`+`translation_key`.
- `article_categories`, `media` (media_type, embed_url, program_slug, transcript, free_preview, captions_url…), `programs`, `program_topics`, `page_contents`, `contact_messages` (name, email, subject, message, status), `newsletter_contacts`.
- `users` (id=OIDC sub, email, name, **role** user/admin, last_login) + `oidc_states` (state, nonce, code_verifier, expires_at).

**pharmacy (5 tabulek + users/oidc):**
- `articles` (+ rating, recommendation, buy_url, product_name — orientace na produktová doporučení).
- `analytics` (page, referrer, user_agent) — vlastní tracking.
- `consultations` (name, email, phone, status) — **kontaktní PII z žádostí o lékovou konzultaci**.
- `leads` (email, phone, source) — **PII**.
- `reviews` (name, rating, text, **approved** default false, email).
- `users` + `oidc_states` (shodné s academy).

### Integrace (oba)
- **OIDC poskytovatel:** atoms.dev issuer (JWKS, PKCE, nonce).
- **AI:** Atoms AI Hub (`app_ai_base_url` + `app_ai_key`).
- **Storage:** OSS bucket (Alibaba/S3-like) přes presigned URL.
- **Mail:** `aiosmtplib` (pharmacy `/email/contact`).
- Žádné platební napojení (stripe je mrtvý).

---

## C) Srovnání pro návrh migrace

| Rozměr | E-SHOP | DVOJČATA |
|---|---|---|
| Architektura | monolit MVC + WebApi, Umbraco CMS | SPA + REST API (serverless Lambda) |
| Datové jádro | MS SQL, 21 ec tabulek, GUID PK | PostgreSQL, 5–8 tabulek, int PK |
| Cena/sklad | v DB (ecProductPrice, availablePcs) | N/A (není prodej) |
| Vícejazyčnost | Umbraco culture | `language`+`translation_key` v tabulkách |
| Identita | Umbraco members + sessionId | OIDC/JWT (atoms.dev) |
| Vendor lock-in | Umbraco 8 EOL + dufeksoft.lib DLL | atoms.dev platforma + MGX šablona |
| Migrační cesta | **rebuild** (Medusa.js) — data z ec* tabulek namapovat | **refactor na místě** nebo sloučení pod 1 backend |

### Doporučené cílové mapování (hrubý návrh, k rozpracování do blueprintu)
- **E-shop → Medusa.js:** produkty (ecProduct/ecProductPrice→Medusa Product/Variant/PriceSet), objednávky (ecQuote→Order), kupóny (ecCoupon→Promotion), zákazníci (ecCustomer→Customer). **Cenotvorba → náš Pricing Engine** (ne Medusa default), objednávkové riziko → **SafeOrder**. QR/ambasador (ecQuoteLink) → zachovat URL 1:1 + doplnit tracking.
- **Dvojčata:** doplnit autorizační vrstvu (jeden guard na router), zúžit CORS, pharmacy guardrail na server. Zvážit **sloučení do jednoho FastAPI backendu** se sdíleným core (identita, storage, aihub) a dvěma sadami entit — šablona je identická, data minimální. Odpojit od atoms.dev lock-inu (vlastní OIDC + storage adapter) dle rozhodnutí.

### Co do návrhu architektury stále chybí (tvrdé bloky)
- Reálná data (objem produktů/objednávek/zákazníků) z DB zálohy → dimenzování.
- Objem návštěv/zátěž (Search Console/analytics) → kapacitní návrh.
- Byznys zadání (B2B? cenové skupiny? věrnost? provize ambasadorů?) → doménový model.
