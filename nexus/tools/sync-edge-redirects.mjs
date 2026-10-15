#!/usr/bin/env node
// Převezme manifest z backendu (`export-edge-redirects.ts`) do NEXUS Workeru.
//
//   node tools/sync-edge-redirects.mjs ../backend/ci-evidence/edge-redirects.json
//
// Zapíše workers/api/edgeRedirectsManifest.ts. Plnou validaci (cesty, řetězy, konflikty)
// dělá `compileEdgeRedirects` -- ověří ji `npm test` (tests/unit/EdgeRedirects.test.ts)
// i workerd testy; tady se kontroluje jen tvar, aby se do repa nedostal cizí soubor.
// `alias_hosts` backend nezná, proto se drží z aktuálního manifestu Workeru.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'workers/api/edgeRedirectsManifest.ts');
const DEFAULT_ALIASES = ['anastasiaoz.eu'];

async function main() {
    const source = process.argv[2];
    if (!source || !source.endsWith('.json')) {
        console.error('Použití: node tools/sync-edge-redirects.mjs <edge-redirects.json>');
        process.exit(2);
    }
    let input;
    try {
        input = JSON.parse(await readFile(resolve(source), 'utf8'));
    } catch (error) {
        console.error(`Manifest nejde načíst: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
    if (input?.version !== 1 || typeof input.canonical_origin !== 'string' || !Array.isArray(input.redirects)) {
        console.error('Neplatný manifest: čekám version 1, canonical_origin a pole redirects.');
        process.exit(1);
    }
    const manifest = {
        version: 1,
        canonical_origin: input.canonical_origin,
        alias_hosts: Array.isArray(input.alias_hosts) ? input.alias_hosts : DEFAULT_ALIASES,
        methods: ['GET', 'HEAD'],
        redirects: input.redirects.map(({ from, to, status, preserve_query }) => ({ from, to, status, preserve_query })),
    };
    const body = `// GENEROVÁNO \`node tools/sync-edge-redirects.mjs <edge-redirects.json>\` -- ručně neupravovat.
// Zdroj cest: backend \`npx medusa exec ./src/scripts/export-edge-redirects.ts\` (po importu katalogu).
// Dokud katalog s \`metadata.legacy_path\` není importovaný, mapa cest je prázdná a Worker
// sjednocuje jen schéma a host (http:// a holá doména -> https://www.anastasiaoz.eu).
import type { EdgeRedirectManifest } from './edgeRedirects.js';

export const EDGE_REDIRECT_MANIFEST: EdgeRedirectManifest = ${JSON.stringify(manifest, null, 4)};
`;
    await writeFile(target, body);
    console.log(`Zapsáno ${manifest.redirects.length} přesměrování do ${target}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
