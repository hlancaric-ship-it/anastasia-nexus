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

## Hranice ochrany
Zabrání veřejné adrese, stahování jedním odkazem a sdílení odkazu. Nezabrání natáčení obrazovky ani kamerou; k tomu je jen DRM (Widevine/FairPlay), které je volitelný placený krok po ocenění. Komunikovat jako „ochrana proti neoprávněnému přístupu a sdílení“.

## Konfigurace
`MEDIA_TOKEN_SECRET` (min. 32 znaků, sdílené s Workerem), `MEDIA_DELIVERY_BASE_URL`. Route vrací 503, pokud chybí.
