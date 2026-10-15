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
    "redirects": []
};
