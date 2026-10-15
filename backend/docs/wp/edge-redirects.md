# C-2 Edge 301 přesměrování starých URL

## Co dělá

NEXUS Worker (`nexus/workers/api/edgeRedirects.ts`, zapojeno v `workers/api/index.ts` před kontrolou bindingů)
vrací **301** pro požadavky na web `anastasiaoz.eu`:

| Vstup | Cíl |
|---|---|
| `http://…` nebo holá doména `anastasiaoz.eu` | `https://www.anastasiaoz.eu` + stejná cesta + stejná query |
| stará cesta produktu/kategorie z importu (`metadata.legacy_path`) | nová cesta podle handle, jedním skokem i při změně hostu |

- Jen **GET/HEAD**; POST a další metody jdou beze změny do routeru.
- Jen hosty z manifestu (`www.anastasiaoz.eu`, `anastasiaoz.eu`); API host se nikdy nepřesměruje.
- Cíl je vždy kanonický origin + relativní cesta z manifestu; z Host hlavičky ani query se cíl neskládá.
- Query (QR `produkt`, `kupon`, `ks`, UTM) se přenáší **beze změny**. Do logu jde jen cesta, ne query (kód kupónu).
- Koncové lomítko: stará cesta se najde i ve tvaru s `/` na konci.
- `Cache-Control: public, max-age=3600`, aby šla chyba v manifestu opravit bez dlouhé cache.
- Neplatný manifest: Worker nepřesměruje nic, zaloguje `worker.edge_redirects_invalid` (alert), API běží dál.

## Zdroj dat

1. GSC `Stránky.csv` → `docs/wp/redirects-map.csv` (43 řádků: 27 KEEP, 16 REDIRECT host/schéma).
   `nexus/tests/unit/EdgeRedirects.test.ts` ověřuje **každý řádek** mapy proti skutečnému manifestu Workeru
   (KEEP = bez přesměrování, REDIRECT = přesný `Location` i s query).
2. Cesty produktů a kategorií po importu katalogu:
   ```
   cd backend && npx medusa exec ./src/scripts/export-edge-redirects.ts file=ci-evidence/edge-redirects.json
   cd ../nexus && node tools/sync-edge-redirects.mjs ../backend/ci-evidence/edge-redirects.json
   npm test -- tests/unit/EdgeRedirects.test.ts && npm run test:workers
   ```
   Generuje `nexus/workers/api/edgeRedirectsManifest.ts` (commitnout). Dnes je mapa cest prázdná – katalog
   s `legacy_path` ještě není importovaný, žádné cíle se nehádají.

## Testy

- Node: `nexus/tests/unit/EdgeRedirects.test.ts` – GSC mapa, QR query, HEAD, metody, cizí hosty, `//evil`,
  port, validace manifestu (verze, origin, alias, metody, cesty, self/konflikt/řetěz/smyčka).
- workerd: `nexus/tests/workers/edgeRedirects.test.ts` – celý `fetch` Workeru bez bindingů (301 nezávisí na DB),
  request-id na odpovědi, POST a API host projdou do routeru.

## Před ostrým provozem (mimo kód)

Worker musí dostat route `www.anastasiaoz.eu/*` a `anastasiaoz.eu/*` (nebo stejnou logiku převezme storefront
Worker – modul je bez závislostí). Ostatní domény klientky (4 další z Websupportu) zatím nemají potvrzený cíl,
proto v manifestu nejsou. Nic nenasazeno.
