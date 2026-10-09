# C3 — QR kupóny a zachování URL

## Stav a hranice

**PARTIAL / integrační BLOCKED.** Implementovány admin/store routy, slovenská admin
stránka, lokální SVG/PNG adaptér a mapa všech 39 URL z GSC + 4 variant QR vstupu.
Samotné vytvoření obrázku ani úspěšný preflight neznamenají aktivovanou slevu.
Smlouva čl. 2 a příloha č. 1 vyžadují celý průchod do košíku se slevou; ten zatím
není VERIFIED ani ACCEPTED.

Blokující závislost: `backend/NEXUS-INTEGRATION.md` a
`src/api/store/nexus-cart/route.ts` potvrzují, že NEXUS nemá kontrakt pro kupóny
na položkách a nastavuje `is_discountable: false`. Obejití přes Medusa promotions
by buď nefungovalo, nebo porušilo hranici pricingu. C3 proto ceny nemění.
K8/K1 musí dodat autoritativní serverovou aktivaci a K4 ji propojit s budoucím
storefrontem. C3 nesmí měnit `nexus/`, globální middleware ani cizí balíky.

## Zdroje a ověřená legacy sémantika

Čteno lokálně bez produkčních volání:
- `~/Downloads/anozeu/dufeksoft.ecommerce.web/dufeksoft.ecommerce-lib/Controllers/Ecommerce/QuoteLinkController.cs`
  (`AddProductWithCoupon`, `GetPiecesToAdd`, zprávy a pending coupon cookie).
- `dufeksoft.ecommerce-lib/EcommerceApp.cs`, registrace `EcommerceQuoteLink`.
- `~/Desktop/ANASTASIA-audit/segment-INFRA-domeny-SEO.md`.
- `~/Downloads/anastasiaoz.eu-Performance-on-Search-2026-10-07.zip`, pouze `Stránky.csv` (39 řádků).
- Smlouva `SMLOUVA-ANASTASIA-FINAL.html`, čl. 2 / příloha č. 1; rozpad fáze 1.

Přesný vstup: `/eshop/kosik?produkt={ProductCode}&kupon={CouponCode}&ks={quantity}`.
Kód produktu je SKU (např. syntetické `KO.001`), nikoli handle nebo Medusa ID.
Controller trimuje produkt a kupón, vyhledá viditelný produkt, přidá jej do
session košíku a serverově zkusí kupón. Pak dočasně přesměruje na lokalizované
`~/kosik`. Chybějící kupón nebrání přidání produktu. Neplatný produkt nic nepřidá.
`ks` je Int32: chybějící, nečíselné, desetinné, <1 nebo overflow → 1; >999 → 999.
`legacyQuantity` reprodukuje tuto sémantiku; generátor nových odkazů přijímá pouze
celá čísla 1–999. Odkaz s neplatným kupónem ve starém systému stále přidá produkt;
nový preflight sám košík nemění. Opakovaný skutečný klik ve starém systému přidává
znovu. Pending/sticky kupón se znovu vyhodnocuje při změnách košíku až 900 sekund;
zpráva má 120 sekund / po prvním zobrazení 20 sekund. Cookie není důkaz nároku.
Tyto návaznosti jsou požadavky pro integrační test, nikoliv zde hotový storefront.

## Implementované kontrakty

`POST /admin/coupon-links` (Medusa user session/bearer):

```json
{"produkt":"KO.001","kupon":"TEST","ks":1,"format":"svg"}
```

`format` svg/png, default svg; `ks` default 1. Odpověď obsahuje `url`,
`qr: {mime_type, base64}` a `activation_status: PENDING_PRICING_INTEGRATION`.
Origin se bere pouze ze serverové konfigurace `COUPON_LINK_STOREFRONT_ORIGIN`
(HTTPS origin bez userinfo, cesty, query, fragmentu). Doporučený návrh dle závěru
SEO auditu: `https://www.anastasiaoz.eu`. Nic se nečte z Host hlavičky ani klienta.
Konfigurace `.env` nebyla čtena ani měněna. Chybějící konfigurace/QR závislost → 503.

`POST /store/coupon-links` přijímá stejné tři legacy položky, bez `format`.
Vyžaduje Medusa publishable key s prodejním kanálem. Vyhledá právě jednu variantu
podle SKU, publikovaný produkt dostupný v kanálu a právě jeden aktivní neautomatický
Medusa promotion code. Kontroluje limit použití a interval kampaně [start,end).
Odpověď `code_valid: true` znamená výhradně `validation_scope: CODE_AVAILABILITY_ONLY`:
nekontroluje pravidla celého košíku, rozpočet kampaně, zákaznický nárok ani atomické
čerpání. Vždy `discount_applied: false`; vrací ID produktu/varianty, quantity a
`destination: /kosik`. Nevrací částku slevy, nemění košík ani stav kupónu. 400 = chybný
vstup, 401 = chybějící přístup, 422 = nedostupný produkt/kód, 503 = závislost selhala.
Obě routy odmítají neznámá pole (cena, tenant, libovolný redirect), používají no-store,
nepropouštějí interní chybové zprávy. Produkt/kupón chyby jsou společné.
Kódy se nenormalizují na uppercase; shoda je přesná. Migrace musí potvrdit případnou
legacy case-insensitive kolaci; bez toho nelze tvrdit úplnou sémantickou shodu.

Export `couponLinkMiddlewares` v `src/api/admin/coupon-links/middlewares.ts`
obsahuje auth a 8kb body limit. **K4 musí přidat jeho spread do globálního
`defineMiddlewares({routes: [...]})`.** Globální soubor C3 nemění. Handler má navíc
kontrolu admin identity, store kontrolu kanálu. Pro veřejný preflight přidat v edge
omezení frekvence dle schválené politiky; nejsou vymyšlené lokální in-memory limity.
Backend je instančně izolovaný Medusa; není přidán klientský tenant přepínač.

Závislost pro integrátora: **`qrcode` runtime** (rozhraní `QrRenderer` umožňuje výměnu).
V aktuálním symlinkovaném node_modules existuje; package.json/lock se nemění.
Žádná externí QR služba. SVG se vykresluje přes img/data URL, ne přes vložené HTML.
UI používá Medusa komponenty, popisky, stav odesílání, chyby a zneplatní starý výsledek
po změně vstupu. Preview a stažení jsou dostupné; upozornění brání záměně za hotovou kampaň.

## 301 mapa a návrh edge

`redirects-map.csv`: všech 39 řádků GSC bez vymyšlených slugů, navíc 4 varianty QR
vstupu. `KEEP/200` znamená zachovat URL na novém originu, nikoliv vytvořit self-redirect.
`REDIRECT/301` sjednocuje schéma a host na https://www; query se zachovává celá.
Cesty, trailing slash, obsahové stránky, produkty a kategorie zůstávají 1:1.
Cíle jsou požadavkem na storefront, jejich HTTP dostupnost nebyla ověřena.
Žádná stránka se automaticky nemění na prodejní ani nesměruje na homepage.
Konkrétních 5 historických 404 audit nejmenuje: doplnit samostatný export a obsahově
odpovídající cíle před spuštěním. Nedělat plošný fallback 404 → homepage.

Následující čistá funkce je návrh pro Worker; vrácené `null` znamená předat požadavek
stávajícímu origin handleru. Nepoužívat `fetch(request)` do stejné Worker trasy,
pokud by způsobovalo smyčku. Napojení originu/TLS pro www patří K4, zde bez nasazení.

```js
function canonicalRedirect(request) {
  const source = new URL(request.url)
  if (!["anastasiaoz.eu", "www.anastasiaoz.eu"].includes(source.hostname)) return null
  if (!["GET", "HEAD"].includes(request.method)) return null
  if (source.protocol === "https:" && source.host === "www.anastasiaoz.eu") return null
  const target = new URL(source.href)
  target.protocol = "https:"
  target.host = "www.anastasiaoz.eu"
  target.port = ""
  return new Response(null, { status: 301, headers: { Location: target.href } })
}
```

301 je pouze kanonizace, nikdy aktivace slevy. `/eshop/kosik` na kanonickém hostu
musí obsluhovat budoucí landing handler se zachovanými `produkt`, `kupon`, `ks`;
nesmí se trvale cachovat úspěch konkrétní zákaznice. Ten přeloží kódy serverem,
založí/ověří vlastní košík, přidá produkt, zavolá K8/K1 aktivaci a zobrazí `/kosik`
s výsledkem serveru. Navigační redirect po mutaci má být 303/no-store, ne 301.
Deduplikaci transportních retry a souběh řešit per košík v persistentním workflow;
GET prefetch nesmí přidávat opakovaně. Nedefinovat novou serverovou cenu v klientu.
Zachovat informaci o odmítnutém kupónu a přepočítat jej při změně košíku; konečná
cena i omezení čerpání se znovu ověřují při checkoutu. Bez tohoto propojení nelze
považovat zachování funkce vytištěných QR za dokončené.

## Akceptace po integraci

1. K4 zapojí middleware, dependency a origin; C1 zachová unikátní legacy SKU.
2. K8/K1 dodají kupónový kontrakt včetně pravidel starých kupónů, souběhu a migrace.
3. Storefront obslouží legacy cestu, přidání produktu a serverovou aktivaci; žádná
   homepage náhrada. Zkontrolovat košík s jiným produktem, zamítnutí/expiraci,
   následné odstranění překážející položky, reload, souběh a checkout.
4. Ověřit všech 39 URL, čtyři varianty hostu QR, query s escapováním, mobilní sken
   vytištěného QR, SVG/PNG stažení, session/bearer admin auth a prodejní kanál.
5. Ověřit www certifikát, canonical/sitemap a schválit doménu před nasazením.

## Spuštěné kontroly

Výsledky doplněny po posledním běhu níže. Browser, DB, checkout, fyzický sken ani
Cloudflare runtime nejsou součástí unit důkazu. Nebyla volána produkce ani měněna DB.

Lokálně spuštěno 2026-10-09 (Node v24.14.0, qrcode 1.5.4):

| Příkaz v backend/ | Výsledek |
|---|---|
| `npx tsc --noEmit` | PASS, exit 0 |
| `npx tsc --noEmit -p src/admin/tsconfig.json` | PASS, exit 0 |
| `SWC_NATIVE_BINDING_CACHE=/private/tmp/c3-swc-cache npm run test:unit -- --runTestsByPath src/api/admin/coupon-links/__tests__/links.unit.spec.ts` | PASS, 36/36 |
| `SWC_NATIVE_BINDING_CACHE=/private/tmp/c3-swc-cache npm run test:unit` | PASS, 8/8 sad, 67/67 testů |

Nové C3 testy: 39 (36 URL/kupóny/auth/SVG/PNG + 3 edge/mapa). Ostatních 28 jsou
existující regresní testy. Edge test vykonává přímo JS blok z tohoto dokumentu
v Node VM a kontroluje všechny řádky CSV, zachování query a absenci smyček;
není to nasazený Cloudflare Worker. API testy používají syntetické služby/mock
Medusa scope; integrace s databází ani skutečné přihlášení nejsou ověřeny.

První testovací pokus selhal na SWC cache mimo sandbox. Přesměrování cache do
`/private/tmp` problém odstranilo; node_modules ani konfigurace testů se neměnily.
Dva reálné PNG testy překročily výchozích 5 s v Jest VM; dostaly lokální 30s limit.
Samostatné volání stejného encoderu v Node trvalo přibližně 264 ms. Závěrečná celá
sada prošla za 31,238 s. Toto není zátěžový benchmark produkčního backendu.

**VERIFIED:** výše uvedené lokální kontroly. **IMPLEMENTED_UNVERIFIED:** browser UI,
HTTP integrace rout a jejich middleware. **BLOCKED:** end-to-end aktivace slevy,
plná kompatibilita vytištěných QR po migraci a dostupnost nových cílových stránek.
Potřebná součinnost: K1/K8 kupónový kontrakt + migrované kódy/pravidla, K4 integrace
middleware a storefrontu, lokální integrační prostředí; doménu potvrdit před deployem.

Commit: **BLOCKED oprávněním sandboxu**. `git add` a následný pokus o commit
`feat(qr-redirects): add coupon QR generator and legacy redirect map` skončily
`Unable to create .../.git/worktrees/anastasia-nexus-codex-qr-redirects/index.lock:
Operation not permitted`. Větev zůstává `codex/qr-redirects`, změny jsou uložené,
nezastagované a bez commitu; nic nebylo pushnuto. K dokončení commitu je potřeba
prostředí s povoleným zápisem do indexu tohoto worktree. Symlink node_modules zůstal
zachován, žádné chráněné soubory ani závislostní manifesty nebyly změněny.
