// GENEROVÁNO `node tools/sync-edge-redirects.mjs <edge-redirects.json>` -- ručně neupravovat.
// Zdroj cest: backend `npx medusa exec ./src/scripts/export-edge-redirects.ts` (po importu katalogu).
// Dokud katalog s `metadata.legacy_path` není importovaný, mapa cest je prázdná a Worker
// sjednocuje jen schéma a host (http:// a holá doména -> https://www.anastasiaoz.eu).
import type { EdgeRedirectManifest } from './edgeRedirects.js';

export const EDGE_REDIRECT_MANIFEST: EdgeRedirectManifest = {
    "version": 1,
    "canonical_origin": "https://www.anastasiaoz.eu",
    "alias_hosts": [
        "anastasiaoz.eu"
    ],
    "methods": [
        "GET",
        "HEAD"
    ],
    "redirects": [
        {
            "from": "/eshop/kategoria/Podkategoria31",
            "to": "/eshop/kategoria/podkategoria31",
            "status": 301,
            "preserve_query": true
        },
        {
            "from": "/eshop/kategoria/Podkategoria41",
            "to": "/eshop/kategoria/podkategoria41",
            "status": 301,
            "preserve_query": true
        },
        {
            "from": "/eshop/produkt/Mineralny-ochranny-krem-pre-citlivu-pokozku",
            "to": "/eshop/produkt/mineralny-ochranny-krem-pre-citlivu-pokozku",
            "status": 301,
            "preserve_query": true
        }
    ]
};
