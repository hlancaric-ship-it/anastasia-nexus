# Bezpečnostní audit ANASTASIA × NEXUS (27. 10. 2026)

Zadání je v `docs/ZADANI-ZABEZPECENI-UTOKY.md`. Práce probíhala na větvi `claude/security-audit-2026-10`. Nic se nenasazovalo, na produkci ani na `anastasiaoz.eu` se nesahalo. Stripe ani produkční API se nevolaly. Pasivně se ověřily jen DNS záznamy a hlavičky (`dig`, `curl -I`) na `*.l-code-dynamics.com`.

**Stavy:**
- **OPRAVENO** znamená, že je oprava v kódu a pokrývá ji spuštěný unit test.
- **OPRAVENO – NEOVĚŘENO E2E** znamená, že unit test prošel, ale proti nasazenému testovacímu webu se neověřovalo.
- **RUČNĚ** je nastavení mimo repo, postup je v `docs/BEZPECNOST-RUCNI-KROKY.md`.
- **ZBYTKOVÉ** je známé riziko, které záměrně zůstává (s důvodem).
- **OK** znamená, že ochrana existovala už před auditem a byla ověřena čtením kódu.

Ověřeno: `npx tsc --noEmit` (backend) prošel. `npm run test:unit` (backend) prošel na 1660 testech, 1 selhal. Selhání je mimo tento audit: `admin-function-map` odkazuje na migraci newsletteru přejmenovanou v `7b715f4`. Cílené testy jsou uvedené u řádků. Testy storefrontu, adminu a media workeru jsou v sekci 9.

## 1. Hesla a převzetí účtu

| Útok | Stav před auditem | Riziko | Oprava | Ověřeno |
|---|---|---|---|---|
| Zákazník si založí účet na e-mail admina a přes „změnit heslo“ přepíše heslo admina | Šlo to. `POST /store/customers` bral e-mail z těla a `/store/customers/me/password` přepsal emailpass identitu admina. | **KRITICKÉ** | `store/customers/create-guard.ts`: zákazník vznikne jen na e-mail, který ověřila jeho identita. Password route vrátí pro e-mail admina 409 `ADMIN_EMAIL_USE_ADMIN_FLOW` a nastaví heslo jen identitě, která e-mail ověřila (`e06c8d0`). | OPRAVENO: `customer-create-guard`, `customer-password-admin` |
| `healSharedAdminLogin` připojí admin účet k cizí identitě | Při přihlášení admina se ke každé emailpass identitě se stejným e-mailem automaticky připsal `user_id`. | VYSOKÉ | Middleware odstraněn (`e06c8d0`). | OPRAVENO |
| Registrace admin hesla bez pozvánky (účet předem založený na e-mail budoucího admina) | Na `/auth/user/emailpass/register` se dalo zaregistrovat bez omezení. | VYSOKÉ | Registrace jde jen na e-mail s platnou nevyužitou pozvánkou, s limitem 10/h na IP. Pozvánku lze přijmout jen na pozvaný e-mail (`requireInviteEmail`). | OPRAVENO: `auth-magic-link-*`, `role-guard` |
| Obejití blokace přes `%73` (`emailpas%73`) | Matcher byl doslovný. | VYSOKÉ | Guard kontroluje dekódované `req.params` (provider a aktéra). Neznámý poskytovatel nebo aktér se odmítne (fail closed). | OPRAVENO: test s `%73` |
| Hrubá síla a credential stuffing na hesla adminů | Limit neexistoval. | VYSOKÉ | Admin: 20/15 min na IP a 5/15 min na e-mail. Zákazník: 30 a 10. Počítadla jsou oddělená. | OPRAVENO |
| E-mail bombing přes reset admin hesla | Limit neexistoval. | STŘEDNÍ | Limit 10/h na IP a 3/h na adresu. | OPRAVENO |
| Magic link bombing | Limit už existoval: 60/15 min na IP a 3/15 min na e-mail. | NÍZKÉ | – | OK |
| Slabé heslo admina | 12 znaků se hlídalo jen v UI. | STŘEDNÍ | Server vynucuje 12–200 znaků při registraci i změně hesla. | OPRAVENO |
| ReDoS v kontrole e-mailu (jeden požadavek zaměstná CPU na minuty) | `EMAIL_RE` měl kvadratickou složitost a délka se kontrolovala až po regexu. | **KRITICKÉ** | Regex je ohraničený a délka ≤ 254 se kontroluje před ním. Tělo požadavků na `/auth/*` má limit 4 kB. Stejně se opravily kopie v Resend a ZeptoMail. | OPRAVENO: test s 60 000znakovým vstupem |
| Enumerace účtů | Odpovědi register a `POST /store/customers` prozrazovaly, zda účet existuje. | STŘEDNÍ | Register je jen přes pozvánku. Zákazník se zakládá jen na ověřený e-mail. Magic link vrací vždy `LINK_SENT`. | OPRAVENO. Časový rozdíl při přihlášení heslem zůstává jako ZBYTKOVÉ (nízké). |
| 2FA admina se dá obejít ukradenou relací | Záložní kódy šlo vygenerovat bez TOTP. Vypnutí 2FA kód neověřovalo (Medusa `disable_policy=session`). | VYSOKÉ | Záložní kódy i vypnutí vyžadují platný TOTP kód. Faktor musí patřit přihlášené identitě. | OPRAVENO: `admin-2fa` (11 testů) |
| 2FA není povinná | Je volitelná. | STŘEDNÍ | Doporučení: povinně zapnout pro všechny adminy. | RUČNĚ (krok A4) |
| Odhlášení nezruší token (zákazník) | Revokace už existovala na `/store/*` a refresh. | STŘEDNÍ | – | OK |
| Odhlášení nezruší token (admin) | Odhlášení mazalo jen `localStorage`. Token platil dál. | STŘEDNÍ | `POST /admin/nexus-auth/logout` zapíše revokaci. `/admin/*` revokovaný token odmítne fail closed (503 při výpadku DB). | OPRAVENO: `auth-revoke` (12 testů) |
| Ukradený zákaznický token se dá obnovovat 30 dní, revokace se netýká ostatních zařízení | Revokuje se jen předložený token. | STŘEDNÍ | Návrh: `session_epoch` v identitě a v JWT, revokace starého tokenu při refreshi. | ZBYTKOVÉ, další balík (zasahuje do přihlášení všech zákazníků) |
| Token v `localStorage` (dopad případné XSS) | Je tam. CSP `script-src 'self'` drží. | STŘEDNÍ | Návrh: HttpOnly cookie, nebo Cloudflare Access před adminem. | RUČNĚ (krok C5) / další balík |

## 2. Zahlcení a DoS

| Útok | Stav před auditem | Riziko | Oprava | Ověřeno |
|---|---|---|---|---|
| Nekonečné stránkování (`limit=100000`) | Horní mez chyběla. | STŘEDNÍ | `GET /store/*`: `limit` nejvýše 100, `offset` nejvýše 10 000, jinak 400. | OPRAVENO: `abuse-guard` |
| Nesmyslné množství v košíku | Horní mez chyběla. | NÍZKÉ | Množství 1–99, nejvýše 50 položek při založení košíku. | OPRAVENO |
| Obsazení termínů roboty (`/store/booking-guest`) | Limit chyběl. | VYSOKÉ | Založení 10/10 min na IP, storno 20/10 min. | OPRAVENO |
| E-mail bombing třetích osob přes formuláře rezervace a odstoupení od smlouvy | Limit byl jen na IP. | VYSOKÉ | Navíc limit na cílový e-mail: 3/h. | OPRAVENO |
| Přihlášený zákazník bez limitu na nexus-cart a checkout | Limit měli jen hosté. | STŘEDNÍ | Checkout 20/10 min na účet, košík 120/min na účet. | OPRAVENO |
| Souhlasy, mazání poukazů, příjemci poukazů | Limit chyběl. | NÍZKÉ | 30/min na IP. | OPRAVENO |
| Kontakt, newsletter, chat, privacy | Limity už existovaly. | NÍZKÉ | – | OK |
| Cloudflare WAF, Rate Limiting, Bot Fight, Turnstile | Testovací API je za Cloudflare (ověřeno `curl`), pravidla v repu nejsou. Turnstile v kódu chybí. | VYSOKÉ | Pravidla podle kroku C1–C3. Turnstile je další balík: vyžaduje klíč a ověření `siteverify` na serveru. | RUČNĚ |
| Obchvat Cloudflare přes `workers.dev` a preview URL | Testovací konfigurace web a admin to měly vypnuté, media worker neměl `preview_urls:false`. | STŘEDNÍ | Doplněno `preview_urls:false` (`ops/test-predani/media.wrangler.jsonc`). `nexus/` se podle pravidel jen četl, postup je v kroku C4. | OPRAVENO (media) / RUČNĚ (nexus) |
| Range požadavek na edge načte celý soubor do paměti | Načítal se celý soubor. | STŘEDNÍ | Viz sekce 9 (storefront edge worker). | viz sekce 9 |
| `cacheEverything` 24 h zacachuje i chyby | Zacachovaly se. | NÍZKÉ | `cacheTtlByStatus` a timeout (sekce 9). | viz sekce 9 |
| Výpadek backendu: storefront ukáže detail chyby | – | NÍZKÉ | Timeout volání API (sekce 9). Chybové hlášky jsou obecné, bez stack trace. | viz sekce 9 |
| NEXUS validate: limit 300/min na tenanta dovolí zablokovat všechny zákazníky | Platí. | STŘEDNÍ | Návrh: limit na IP přes `ratelimits` binding a limit na tenanta jen sledovat. `nexus/` je pouze ke čtení. | ZBYTKOVÉ, předáno vlastníkovi `nexus/` |
| Gemini klíč v URL `?key=` (NEXUS AI) | Platí. | NÍZKÉ | Posílat ho v hlavičce `x-goog-api-key`. | ZBYTKOVÉ, předáno vlastníkovi `nexus/` |
| Upload: multer drží soubory v paměti bez limitu velikosti | Limit chybí. Náš guard běží až po načtení souboru. | NÍZKÉ (jen admin) | Velikost hlídá guard (20/200 MB). Limit multeru je v core Medusy, jinak ho nastavit nejde. | ZBYTKOVÉ |

## 3. Doména a DNS (`l-code-dynamics.com`, pasivně)

| Kontrola | Stav (dig, 27. 10.) | Riziko | Oprava | Ověřeno |
|---|---|---|---|---|
| NS | Cloudflare (`emily`, `viddy`) | – | – | OK |
| DNSSEC | DS záznam existuje (alg 13) | – | – | OK |
| SPF | `v=spf1 include:zohomail.eu ~all` | NÍZKÉ | Zvážit `-all`. Pokud se z domény posílá přes Resend, doplnit jeho include. | RUČNĚ (D2) |
| DKIM | Selektory `resend` a `zmail` existují | – | – | OK |
| DMARC | `p=quarantine` s reporty | NÍZKÉ | Po měsíci čistých reportů přejít na `p=reject`. | RUČNĚ (D2) |
| CAA | **Chybí** | NÍZKÉ | Povolit jen CA, které používá Cloudflare. | RUČNĚ (D3) |
| Zámek u registrátora, 2FA Websupport a Cloudflare | Z repa nejde ověřit | VYSOKÉ (převzetí domény) | Postup v D1. | RUČNĚ |
| Převzetí subdomén (visící CNAME, zrušené Workers a buckety) | Z repa nejde ověřit celý výpis zóny | STŘEDNÍ | Projít výpis zóny podle D4. | RUČNĚ |
| `anastasiaoz.eu` | Neřešeno, podle pravidel bez schválení nesahat | – | Totéž projít až po schválení Lucií. | RUČNĚ |
| HSTS | `max-age=31536000` bez `includeSubDomains` (web, admin). Testovací API HSTS nevrací. | NÍZKÉ | `includeSubDomains` v buildu (sekce 9). Pro API zapnout HSTS v Cloudflare (C6). | viz sekce 9 / RUČNĚ |

## 4. Platby

| Útok | Stav před auditem | Riziko | Oprava | Ověřeno |
|---|---|---|---|---|
| Jednorázový kupón opakovaně: podvržení `promotion_id` v metadatech košíku | Šlo. | VYSOKÉ | Promotion se dohledá podle kódu, nikdy podle metadat. Nativní API `cart.metadata.nexus_coupon` odmítne (400). | OPRAVENO (`af048f8`): `coupon-usage`, `safeorder-completion` |
| Jednorázový kupón opakovaně: platba přímo přes Stripe (webhook dokončí košík bez nexus-checkout) | Použití se nezapsalo. | VYSOKÉ | Použití se zapisuje v subscriberu `order.placed`, idempotentně podle objednávky. | OPRAVENO |
| Souběh: N checkoutů se stejným kupónem naráz | Limit se jen čte. | STŘEDNÍ | Návrh: rezervace použití před dokončením košíku a uvolnění při selhání. | ZBYTKOVÉ: v nejhorším jedna sleva navíc při souběhu, dopad je omezený |
| Hádání kódů kupónů (`/store/coupon-links`) | Limit chyběl. | STŘEDNÍ | 20/min na IP a limit pro přihlášené zákazníky. | OPRAVENO |
| Card testing (PaymentIntent) | Limit chyběl. Radar a Turnstile chyběly. | VYSOKÉ | Platební relace 10/10 min na IP i na účet. Radar a 3DS podle S1–S2. | OPRAVENO (limit) / RUČNĚ (Radar) |
| Podpis Stripe webhooku | Nativní provider, `constructEvent` nad raw body, v produkci se vyžaduje `whsec_` | – | – | OK |
| Sdílený `STRIPE_WEBHOOK_SECRET` pro dva providery | Platí | NÍZKÉ (provozní) | Oddělené secrety pro dva endpointy. Týká se `medusa-config.ts`, který se v tomto balíku nemění. | RUČNĚ (S3) |
| Cena nebo sleva z klienta | Přepočítá se na serveru, validate hook porovná částku | – | – | OK |
| Podvržený stav platby, dobírka a převod | Ruční platby se jen autorizují, `isOrderPaid` podmiňuje vydání obsahu | – | – | OK |
| Dárkové poukazy (hádání, dvojí čerpání) | 80 bitů entropie, 20/min, atomické čerpání | – | – | OK |
| Únik odpovědi NEXUS do logu | `JSON.stringify(result)` | NÍZKÉ | Loguje se jen chybový kód. | OPRAVENO |

## 5. Přístup k datům (IDOR)

| Útok | Stav | Riziko | Oprava | Ověřeno |
|---|---|---|---|---|
| Cizí objednávka a faktura (`/store/orders/:id`, `/invoice`) | `authenticate` + `ownOrderOnly`, odpověď 404 bez prozrazení existence | – | – | OK |
| `/admin/orders/:id/invoice` | Jen přihlášený admin | – | – | OK |
| Knihovna a entitlementy | Přihlášení, nárok a vazba klíče na produkt | – | – | OK |
| Cizí košík | Vlastnictví se kontroluje. Host bez účtu se ke košíku dostane jen se znalostí ULID (model Medusy). | NÍZKÉ | – | OK |
| Enumerace čísel objednávek | Žádná veřejná route nehledá podle `display_id` | – | – | OK |
| Gift-voucher apply/remove bez `authenticate` (domnělé N7) | Medusa přidává volitelné `authenticate` na `/store` globálně, takže `auth_context` existuje | – | – | OK: falešně pozitivní |
| Admin role: asistent mění ceny, kupóny, poukazy a klíče přímo přes API | Role se kontrolovala jen v UI | VYSOKÉ | Hranice rolí na serveru (`admin-capability-middlewares.ts`). Nový admin dostane roli `assistant`. Roli a pozvánky smí měnit jen vlastník. | OPRAVENO (`0c1d6da`): `admin-capability`, `role-guard` |
| Klíče chráněných souborů ve Store API | `metadata.protected_media[].key` byl veřejný | VYSOKÉ (podmíněně) | Store API vrací jen `title` a `ext`. | OPRAVENO: `protected-media-redaction` |

## 6. Placený obsah

| Útok | Stav před auditem | Riziko | Oprava | Ověřeno |
|---|---|---|---|---|
| Media worker hledá placený soubor nejdřív ve veřejném bucketu | `withFallback(MEDIA_BUCKET → PROTECTED)` | VYSOKÉ (podmíněně) | Pořadí opraveno (sekce 9). Obsah bucketu `anastasia-media` je potřeba zkontrolovat (R1). | viz sekce 9 / RUČNĚ |
| Upload placeného obsahu omylem do veřejného bucketu | Env proměnná to dovolila | VYSOKÉ | `protectedStorageFromEnv` odmítne bucket shodný s veřejným (`852e4ca`). | OPRAVENO: `storage` |
| Podpis, expirace, path traversal, Range, CORS | HMAC v konstantním čase, TTL nejvýše 900 s, přesná shoda klíče | – | – | OK |
| Sdílení odkazu s tokenem, stažení videa přes `curl` s hlavičkou `Origin` | Token je bearer v URL na 600 s | NÍZKÉ | Návrh: TTL 120–300 s a vazba na relaci. Nepopisovat to jako ochranu proti stažení. | ZBYTKOVÉ |
| Presigned PUT bez podepsané velikosti | Platí (jen admin) | NÍZKÉ | – | ZBYTKOVÉ |

## 7. Webové zranitelnosti

| Útok | Stav před auditem | Riziko | Oprava | Ověřeno |
|---|---|---|---|---|
| Upload SVG/HTML přes `/admin/uploads` (stored XSS) | Allowlist chyběl | STŘEDNÍ | Povolené jsou jen jpeg/png/gif/webp/avif (20 MB) a mp4/m4v/webm (200 MB). MIME, přípona a magic bytes musí sedět. Nejvýše 20 souborů. (`134f4b3`) | OPRAVENO: `admin-upload-guard` |
| Odkaz `//evil.tld`, `/\evil.tld` nebo `java\tscript:` v obsahu | `isSafeHref` je propustil | NÍZKÉ | Protocol-relative cesty a řídicí znaky se odmítnou. | OPRAVENO: `sanitize` |
| CSV formula injection v exportu objednávek | `csvCell` neprefixoval | STŘEDNÍ | Viz sekce 9 (admin). | viz sekce 9 |
| Neescapovaný `p.image` v kartách produktů | Platí | STŘEDNÍ | Viz sekce 9 (storefront). | viz sekce 9 |
| Country v meta na edge | Neescapované | NÍZKÉ | Viz sekce 9. | viz sekce 9 |
| Stored XSS v adminu a storefrontu (objednávky, chat, popisy) | Vše jde přes `esc` / `textContent`, CSP bez `unsafe-inline` pro skripty | – | – | OK |
| E-mailové šablony | Proměnné se escapují, náhledy běží v sandboxu | – | – | OK |
| CSRF | Bearer tokeny bez cookies | – | – | OK |
| Podvržené IČO, DIČ a IČ DPH na faktuře (metadata košíku z prohlížeče) | Server hodnoty neověřoval, na daňový doklad šel libovolný text. | STŘEDNÍ | Guard na `POST /store/carts(/:id)`: jen řetězec v SK/CZ formátu, název firmy nejvýše 120 znaků, jinak 400 `INVALID_COMPANY_ID`. Faktura tiskne jen platné hodnoty. (`a8ca898`) | OPRAVENO – NEOVĚŘENO E2E: `metadata-guard`, `invoice` |
| CORS media worker | Přesná shoda origin, bez credentials | – | – | OK |
| SSRF | Feedy berou `Host` jen při chybějícím `BACKEND_PUBLIC_URL` (jen admin) | NÍZKÉ | Nastavit `BACKEND_PUBLIC_URL` v prostředí. | RUČNĚ (C7) |
| `frame-ancestors` storefrontu odvozený z API originu | Odvozený | NÍZKÉ | Nastavit `ANASTASIA_ADMIN_ORIGIN` v buildu. | RUČNĚ (C7) |
| QR SVG přes blacklist `safeSvg` | Platí. CSP `javascript:` blokuje. | NÍZKÉ | Návrh: `<img src="data:image/svg+xml…">`. | ZBYTKOVÉ |

## 8. Admin a tajemství

| Kontrola | Stav | Riziko | Oprava | Ověřeno |
|---|---|---|---|---|
| Tajemství v repu a v git historii | Žádné produkční klíče (Stripe, Resend, AWS, GitHub, privátní klíče). Historicky bylo v `ops/test-server/compose.yml` netriviální heslo test-serveru. | STŘEDNÍ (pokud byl test-server nasazen) | Rotovat heslo test-serveru. | RUČNĚ (K1) |
| Produkční secrety v `medusa-config.ts` | Kontrola síly a rozdílnosti JWT a cookie secretu v produkci už existuje | – | – | OK |
| `npm audit` backend | 85 nálezů (23 high, 0 critical): zod, body-parser, multer, lodash, @graphql-tools/utils, @medusajs/* tranzitivně | STŘEDNÍ | Upgrade Medusy na nejbližší patch (2.19.x). Závislosti se v tomto balíku nemění, viz `backend/docs/wp/SECURITY-AUDIT-2026-10.md`. | ZBYTKOVÉ |
| `npm audit` nexus | 11 nálezů (8 high): wrangler, miniflare, vite, sharp, undici, zod (dev nástroje) | NÍZKÉ | Upgrade wrangleru. | ZBYTKOVÉ |
| Zálohy | `ops/db-backup` existuje. Šifrování a obnovu nejde z repa ověřit. | STŘEDNÍ | Zkušební obnova a kontrola šifrování. | RUČNĚ (K3) |
| Rotace klíčů | Žádný proces | NÍZKÉ | Postup v K2. | RUČNĚ |

## 9. Opravy mimo backend (storefront, admin, media worker)

| Útok | Stav před auditem | Riziko | Oprava | Ověřeno |
|---|---|---|---|---|
| CSV formula injection (`=HYPERLINK(...)` ve jméně zákazníka → Excel) | `csvCell` jen escapoval uvozovky | STŘEDNÍ | `anastasia-admin/csv.mjs`: buňky začínající `= + - @`, TAB nebo CR dostanou prefix `'`. Záporné částky zůstanou čísly. (`7cb046c`) | OPRAVENO: `test/csv-export.mjs` (13 kontrol) |
| Neescapovaný `p.image` (XSS z katalogu) | `src="${p.image}"` | STŘEDNÍ | `imageSrc()`: povolí jen https a relativní cestu bez `\`, jinak placeholder (`c686688`) | OPRAVENO: `card-media.test.mjs`, `live-catalog.test.mjs` |
| `/\evil.tld` v médiích | `isMediaUrl` ho propustil | NÍZKÉ | Zpětné lomítko se odmítne | OPRAVENO |
| HTML injection přes `CF-IPCountry` | Hodnota šla do `<meta>` | NÍZKÉ | Jen `^[A-Z]{2}$` | OPRAVENO: `edge-worker.test.mjs` |
| Edge cache drží chyby 24 h | `cacheTtl` 86400 pro všechny stavy | NÍZKÉ | `cacheTtlByStatus` (200: 1 den, 404: 60 s, 5xx: 0). Chyby a 416 mají `no-store`, 206 má `private` bez `etag`. | OPRAVENO: `edge-worker.test.mjs` |
| HSTS bez `includeSubDomains`, chybí Permissions-Policy a COOP v adminu | Platilo | NÍZKÉ | `_headers` webu a adminu i odpovědi Workerů | OPRAVENO (build ověřen lokálně) |
| Zaseknuté API zablokuje stránku | `fetch` bez timeoutu | NÍZKÉ | 15 s pro čtení, 30 s pro zápis, chyba `API_TIMEOUT` | OPRAVENO: `http-adapter.test.mjs` |
| Media worker: veřejný bucket zastíní placený soubor se stejným klíčem | Hledalo se nejdřív v hlavním bucketu | VYSOKÉ (podmíněně) | Nejdřív se čte soukromý bucket. Všude HSTS a CORP, audio a video dostávají CSP `sandbox`. (`dccc5f6`) | OPRAVENO: `worker.test.ts` 11/11 |
| Storefront čte klíče chráněných médií | `m.key` | – | Čte `m.ext` z redigované odpovědi, starý `key` jako záloha (`87daed5`) | OPRAVENO: `http-adapter.test.mjs` 27/27 |
| Logout adminu nevolal server | Platilo | STŘEDNÍ | `app.mjs` volá `POST /admin/nexus-auth/logout` (`79ec6b3`) | OPRAVENO – NEOVĚŘENO E2E |

Testy:
- storefront: `node --test test/*.test.mjs` po lokálním `node build.mjs` bez env prošel na 172/174. Selhaly jen 2 testy `intro-chrome.test.mjs`, které potřebují běžící server na `127.0.0.1:4173` (Playwright).
- admin: `csv-export`, `qr-otp` a `media-upload-accept` prošly. Neběžel `browser-security.mjs`, protože potřebuje testovací heslo admina.
- media worker: vitest 11/11.

## 9a. Provozní chyba nalezená po auditu

| Problém | Dopad | Oprava | Ověřeno |
|---|---|---|---|
| Tři subscribery měly default funkci `handler` (dva přidal tento audit). Medusa bere název funkce jako ID subscriberu. | Server po nasazení nenaběhl („Subscriber with id handler already exists“). Nasazení na Medusa Cloud od `5e47dad` selhávala a na testu běžela starší verze. | Jedinečné názvy funkcí a explicitní `subscriberId`. Test `subscriber-ids` odmítne duplicitní nebo generické ID. (`1e8a697`) | Unit test. Úspěšné nasazení zatím neověřeno, čeká na souhlas s nasazením. |

## 10. Zbytková rizika (shrnutí)

1. **Souběh u kupónu** (sekce 4): při souběžných checkoutech hrozí jedna sleva navíc. Oprava vyžaduje rezervaci použití ve workflow dokončení košíku.
2. **Obnovovaný zákaznický token**: logout nezruší ostatní zařízení. Řeší to návrh `session_epoch`.
3. **Turnstile chybí**: limity v kódu robota zpomalí, ale nezastaví útok z mnoha IP. Potřeba je klíč Turnstile a další balík.
4. **NEXUS** (validate limit tenanta, Gemini klíč v URL, `ratelimits` binding, `workers_dev` v `nexus/wrangler`): `nexus/` je v tomto balíku jen ke čtení, předáno vlastníkovi.
5. **Závislosti s CVE**: upgrade Medusy a wrangleru jako samostatný balík.
6. **Obsah veřejného bucketu `anastasia-media`**: nebyl zkontrolován. Kontrola vyžaduje přístup do Cloudflare (R1).

Pokyny pro testera: `docs/predani/09-INSTRUKCIE-PRE-TESTERA.md`. Ruční kroky: `docs/BEZPECNOST-RUCNI-KROKY.md`.
