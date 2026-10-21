# Chráněná média (A-07): návrh a stav

Stav: backend `IMPLEMENTED_UNVERIFIED` (unit testy), doručovací Worker `NOT_IMPLEMENTED`.

## Princip
1. Placená média jsou v **soukromém** R2 bucketu bez veřejné adresy. Veřejné jsou jen fotky a bezplatná ukázka.
2. Přehrávač zavolá `POST /store/media-access { product_id, media_key }` (přihlášená zákaznice). Backend ověří nárok (`entitlement.findActiveAccess`), že `media_key` je v `product.metadata.protected_media`, a vydá odkaz `MEDIA_DELIVERY_BASE_URL/v1/<key>?t=<token>`.
3. Token = HMAC-SHA256, obsahuje zákaznici, produkt, klíč média, expiraci (max 900 s) a nonce. Implementace: `src/modules/entitlement/media/token.ts`.
4. Odpověď obsahuje `watermark` (e-mail zákaznice) pro viditelný vodoznak v přehrávači.

## Kontrakt doručovacího Workeru (k implementaci, zásah do `nexus/` vyžaduje schválení)
- Ověří token stejným algoritmem (WebCrypto HMAC), `exp`, shodu `k` s požadovaným objektem; jinak 403.
- Stream z R2 s podporou `Range`; `Cache-Control: private, no-store`; žádný `Content-Disposition: attachment`.
- Video jako HLS (krátké segmenty); každý segment ověřuje token. Žádný přímý `.mp4`.
- Limit souběžných přehrávání na zákaznici (Durable Object nebo KV podle `nonce`), záznam přístupů.
- CORS jen na naší doméně.

## PDF (dokument) – náhľad, ne stahování
- PDF se doručuje **stejným podepsaným krátkodobým odkazem** jako video (max. 900 s) a **jen s oprávněním** (entitlement + `media_key` v registru produktu).
- `Content-Type: application/pdf` a `Content-Disposition: inline` → prohlížeč otevře náhled. Bez `application/pdf` by prohlížeč soubor **stáhl** (`application/octet-stream`).
- Chyba v Workeri (2026-10-21): `contentType()` v `nexus/workers/api/routes/mediaDelivery.ts` neznal `pdf`, takže se PDF z knihovnice stáhlo jako neznámý binární soubor. Opravené + test `nexus/tests/unit/MediaDocumentDelivery.test.ts` (náhled, HEAD bez těla, bez podpisu 403, podpis na jiný objekt 403, vypršený podpis 403).
- Test na straně backendu: `backend/src/api/store/media-access/__tests__/document-access.unit.spec.ts` (registr PDF jako `document`, odkaz s vodoznakem, bez oprávnění 403, mimo registru 403, bez přihlášení 401).

## Hranice ochrany
Zabrání veřejné adrese, stahování jedním odkazem a sdílení odkazu. Nezabrání natáčení obrazovky ani kamerou; k tomu je jen DRM (Widevine/FairPlay), které je volitelný placený krok po ocenění. Komunikovat jako „ochrana proti neoprávněnému přístupu a sdílení“.

## Konfigurace
`MEDIA_TOKEN_SECRET` (min. 32 znaků, sdílené s Workerem), `MEDIA_DELIVERY_BASE_URL`. Route vrací 503, pokud chybí.
