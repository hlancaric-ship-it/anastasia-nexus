import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compileEdgeRedirects, EdgeRedirectManifestError, resolveEdgeRedirect } from '../../workers/api/edgeRedirects.js';
import { EDGE_REDIRECT_MANIFEST } from '../../workers/api/edgeRedirectsManifest.js';

const base = { version: 1, canonical_origin: 'https://www.anastasiaoz.eu', alias_hosts: ['anastasiaoz.eu'], methods: ['GET', 'HEAD'] } as const;
const entry = (from: string, to: string) => ({ from, to, status: 301, preserve_query: true });
const compiled = compileEdgeRedirects({
    ...base,
    redirects: [entry('/eshop/produkt/Stary-Nazov', '/eshop/produkt/novy-nazov'), entry('/eshop/kategoria/Bio/Stara', '/eshop/kategoria/bio/nova')],
});
const go = (url: string, method = 'GET') => resolveEdgeRedirect(new Request(url, { method }), compiled);

function codeOf(fn: () => unknown): string | undefined {
    try {
        fn();
    } catch (error) {
        return error instanceof EdgeRedirectManifestError ? error.code : 'OTHER';
    }
    return undefined;
}

// Jednoduchý CSV parser stačí: mapa z GSC nemá v polích čárky ani uvozovky (ověřuje test níže).
function readGscMap() {
    const file = resolve(dirname(fileURLToPath(import.meta.url)), '../../../backend/docs/wp/redirects-map.csv');
    const [header, ...lines] = readFileSync(file, 'utf8').trim().split(/\r?\n/);
    expect(header).toBe('source_url,target_url,action,status_code,query_policy,evidence,target_status');
    return lines.map((line) => {
        const cols = line.split(',');
        expect(cols).toHaveLength(7);
        return { source: cols[0]!, target: cols[1]!, action: cols[2]!, status: Number(cols[3]), query: cols[4]! };
    });
}

describe('edge 301 – mapa z GSC (redirects-map.csv)', () => {
    const rows = readGscMap();
    const live = compileEdgeRedirects(EDGE_REDIRECT_MANIFEST);

    it('pokrývá všech 43 řádků mapy', () => {
        expect(rows).toHaveLength(43);
        expect(rows.filter((r) => r.action === 'REDIRECT')).toHaveLength(16);
    });

    it.each(readGscMap().map((r) => [r.action, r.source, r] as const))('%s %s', (_action, _source, row) => {
        const response = resolveEdgeRedirect(new Request(row.source), live);
        if (row.action === 'KEEP') {
            expect(row.status).toBe(200);
            expect(response).toBeNull();
            return;
        }
        expect(row.action).toBe('REDIRECT');
        expect(response?.status).toBe(row.status);
        expect(response?.headers.get('Location')).toBe(row.target);
        // PRESERVE: query projde beze změny i na každé přesměrované adrese.
        const withQuery = resolveEdgeRedirect(new Request(`${row.source}?utm_source=qr&kupon=Jar%2026`), live);
        expect(withQuery?.headers.get('Location')).toBe(`${row.target}?utm_source=qr&kupon=Jar%2026`);
    });

    it('bundlovaný manifest je platný a zatím bez hádaných cest', () => {
        expect(live.canonicalOrigin).toBe('https://www.anastasiaoz.eu');
        expect([...live.hosts]).toEqual(['www.anastasiaoz.eu', 'anastasiaoz.eu']);
        expect(live.paths.size).toBe(EDGE_REDIRECT_MANIFEST.redirects.length);
    });
});

describe('edge 301 – cesty z importu katalogu', () => {
    it('přesměruje starou cestu produktu a zachová QR query beze změny', () => {
        const response = go('https://www.anastasiaoz.eu/eshop/produkt/Stary-Nazov?produkt=KO.001&kupon=Leto&ks=2');
        expect(response?.status).toBe(301);
        expect(response?.headers.get('Location')).toBe('https://www.anastasiaoz.eu/eshop/produkt/novy-nazov?produkt=KO.001&kupon=Leto&ks=2');
        expect(response?.headers.get('Cache-Control')).toBe('public, max-age=3600');
    });

    it('jedním skokem sjednotí host, schéma i cestu (žádný řetěz 301 -> 301)', () => {
        expect(go('http://anastasiaoz.eu/eshop/kategoria/Bio/Stara/?a=1')?.headers.get('Location')).toBe('https://www.anastasiaoz.eu/eshop/kategoria/bio/nova?a=1');
    });

    it('HEAD se přesměruje stejně, bez těla', async () => {
        const response = go('https://www.anastasiaoz.eu/eshop/produkt/Stary-Nazov', 'HEAD');
        expect(response?.status).toBe(301);
        expect(await response?.text()).toBe('');
    });

    it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])('%s se nepřesměruje', (method) => {
        expect(go('http://anastasiaoz.eu/eshop/produkt/Stary-Nazov', method)).toBeNull();
    });

    it('kanonická adresa bez mapované cesty projde dál', () => {
        expect(go('https://www.anastasiaoz.eu/eshop/produkt/novy-nazov?ks=1')).toBeNull();
        expect(go('https://www.anastasiaoz.eu/api/nexus/pricing')).toBeNull();
    });

    it('cizí hosty (API Worker, podvržený Host) se nikdy nepřesměrují', () => {
        expect(go('https://nexus-api.example.workers.dev/eshop/produkt/Stary-Nazov')).toBeNull();
        expect(go('https://evil.test/eshop/produkt/Stary-Nazov')).toBeNull();
        expect(go('https://www.anastasiaoz.eu.evil.test/')).toBeNull();
    });

    it('cíl je vždy kanonický origin – ani cesta typu //evil nevede ven', () => {
        const location = go('http://anastasiaoz.eu//evil.test/x')?.headers.get('Location');
        expect(location).toBe('https://www.anastasiaoz.eu//evil.test/x');
        expect(new URL(location!).origin).toBe('https://www.anastasiaoz.eu');
    });

    it('nestandardní port na kanonickém hostu se sjednotí', () => {
        expect(go('https://www.anastasiaoz.eu:8443/kontakt')?.headers.get('Location')).toBe('https://www.anastasiaoz.eu/kontakt');
    });
});

describe('edge 301 – validace manifestu', () => {
    it.each([
        ['UNSUPPORTED_MANIFEST_VERSION', { ...base, version: 2, redirects: [] }],
        ['INVALID_CANONICAL_ORIGIN', { ...base, canonical_origin: 'http://www.anastasiaoz.eu', redirects: [] }],
        ['INVALID_CANONICAL_ORIGIN', { ...base, canonical_origin: 'https://www.anastasiaoz.eu/sk', redirects: [] }],
        ['INVALID_CANONICAL_ORIGIN', { ...base, canonical_origin: 'https://user@www.anastasiaoz.eu', redirects: [] }],
        ['INVALID_ALIAS_HOST', { ...base, alias_hosts: ['https://anastasiaoz.eu'], redirects: [] }],
        ['INVALID_ALIAS_HOST', { ...base, alias_hosts: ['www.anastasiaoz.eu'], redirects: [] }],
        ['INVALID_METHODS', { ...base, methods: ['GET', 'POST'], redirects: [] }],
        ['INVALID_REDIRECTS', { ...base }],
        ['INVALID_REDIRECT_ENTRY', { ...base, redirects: [{ ...entry('/a', '/b'), status: 302 }] }],
        ['INVALID_REDIRECT_ENTRY', { ...base, redirects: [{ ...entry('/a', '/b'), preserve_query: false }] }],
        ['INVALID_REDIRECT_PATH', { ...base, redirects: [entry('/a', 'https://evil.test/')] }],
        ['INVALID_REDIRECT_PATH', { ...base, redirects: [entry('/a', '//evil.test/')] }],
        ['INVALID_REDIRECT_PATH', { ...base, redirects: [entry('/a?kupon=X', '/b')] }],
        ['INVALID_REDIRECT_PATH', { ...base, redirects: [entry('/a/../b', '/c')] }],
        ['INVALID_REDIRECT_PATH', { ...base, redirects: [entry('/a\\b', '/c')] }],
        ['SELF_REDIRECT', { ...base, redirects: [entry('/a', '/a')] }],
        ['CONFLICTING_REDIRECT_TARGET', { ...base, redirects: [entry('/a', '/b'), entry('/a', '/c')] }],
        ['REDIRECT_CHAIN_OR_CYCLE', { ...base, redirects: [entry('/a', '/b'), entry('/b', '/c')] }],
        ['REDIRECT_CHAIN_OR_CYCLE', { ...base, redirects: [entry('/a', '/b/'), entry('/b', '/a')] }],
    ])('%s', (code, manifest) => {
        expect(codeOf(() => compileEdgeRedirects(manifest))).toBe(code);
    });

    it('stejný záznam dvakrát je v pořádku (idempotentní export)', () => {
        expect(compileEdgeRedirects({ ...base, redirects: [entry('/a', '/b'), entry('/a', '/b')] }).paths.size).toBe(1);
    });
});
