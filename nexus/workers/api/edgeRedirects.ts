// Edge 301 přesměrování starých URL (C-2): kanonický host + mapa cest z importu katalogu.
//
// ZDROJ PRAVDY:
//   - host/schéma: GSC `Stránky.csv` (backend/docs/wp/redirects-map.csv) -- http:// a holá doména
//     `anastasiaoz.eu` vedou 301 na `https://www.anastasiaoz.eu` se stejnou cestou a query,
//   - cesty: manifest z `backend/src/scripts/export-edge-redirects.ts` (jen publikované entity
//     s `metadata.legacy_path`; žádné hádané cíle). Do Workeru se přenáší přes
//     `tools/sync-edge-redirects.mjs` -> `edgeRedirectsManifest.ts`.
//
// PRAVIDLA (bezpečnost):
//   - jen GET/HEAD; ostatní metody jdou dál beze změny (žádné tiché přesměrování POST),
//   - jen hosty uvedené v manifestu -- API host (nexus-api) se tím nikdy nepřesměruje,
//   - cíl je VŽDY kanonický origin + relativní cesta z manifestu; nic z Host hlavičky
//     ani z query se do cílového originu nedostane (žádný open redirect),
//   - query se přenáší beze změny (QR parametry `produkt`, `kupon`, `ks`, UTM),
//   - řetězy a smyčky manifest odmítne při kompilaci; neplatný manifest = žádná cesta
//     se nepřesměruje (fail-closed na úrovni redirectů, API běží dál).

export const EDGE_REDIRECT_METHODS = ['GET', 'HEAD'] as const;

export interface EdgeRedirectEntry {
    readonly from: string;
    readonly to: string;
    readonly status: 301;
    readonly preserve_query: true;
}

export interface EdgeRedirectManifest {
    readonly version: 1;
    readonly canonical_origin: string;
    /** Další hosty téhož webu, které se mají sjednotit na kanonický (např. holá doména). */
    readonly alias_hosts: readonly string[];
    readonly methods: readonly string[];
    readonly redirects: readonly EdgeRedirectEntry[];
}

export interface CompiledEdgeRedirects {
    readonly canonicalOrigin: string;
    readonly canonicalHost: string;
    readonly hosts: ReadonlySet<string>;
    readonly paths: ReadonlyMap<string, string>;
}

export class EdgeRedirectManifestError extends Error {
    constructor(readonly code: string) {
        super(code);
        this.name = 'EdgeRedirectManifestError';
    }
}

const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Stejné pravidlo jako exportér v backendu: absolutní cesta bez query, fragmentu, `..` a řídicích znaků. */
function pathOnly(value: unknown): string {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\?#\u0000- \u007f]/.test(value)) {
        throw new EdgeRedirectManifestError('INVALID_REDIRECT_PATH');
    }
    const parsed = new URL(value, 'https://redirect.invalid');
    if (parsed.origin !== 'https://redirect.invalid' || parsed.pathname !== value) {
        throw new EdgeRedirectManifestError('INVALID_REDIRECT_PATH');
    }
    return value;
}

function canonicalOrigin(value: unknown): URL {
    if (typeof value !== 'string') throw new EdgeRedirectManifestError('INVALID_CANONICAL_ORIGIN');
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        throw new EdgeRedirectManifestError('INVALID_CANONICAL_ORIGIN');
    }
    if (parsed.protocol !== 'https:' || parsed.origin !== value || parsed.port !== '' || !HOST_RE.test(parsed.hostname)) {
        throw new EdgeRedirectManifestError('INVALID_CANONICAL_ORIGIN');
    }
    return parsed;
}

/** Validuje manifest a připraví vyhledávací mapu. Vyhazuje `EdgeRedirectManifestError`. */
export function compileEdgeRedirects(input: unknown): CompiledEdgeRedirects {
    if (typeof input !== 'object' || input === null) throw new EdgeRedirectManifestError('INVALID_MANIFEST');
    const manifest = input as Partial<EdgeRedirectManifest>;
    if (manifest.version !== 1) throw new EdgeRedirectManifestError('UNSUPPORTED_MANIFEST_VERSION');
    const origin = canonicalOrigin(manifest.canonical_origin);

    const methods = manifest.methods ?? EDGE_REDIRECT_METHODS;
    if (!Array.isArray(methods) || methods.some((m) => !(EDGE_REDIRECT_METHODS as readonly string[]).includes(m))) {
        throw new EdgeRedirectManifestError('INVALID_METHODS');
    }

    const hosts = new Set<string>([origin.hostname]);
    const aliases = manifest.alias_hosts ?? [];
    if (!Array.isArray(aliases)) throw new EdgeRedirectManifestError('INVALID_ALIAS_HOST');
    for (const alias of aliases) {
        if (typeof alias !== 'string' || !HOST_RE.test(alias) || hosts.has(alias)) {
            throw new EdgeRedirectManifestError('INVALID_ALIAS_HOST');
        }
        hosts.add(alias);
    }

    if (!Array.isArray(manifest.redirects)) throw new EdgeRedirectManifestError('INVALID_REDIRECTS');
    const paths = new Map<string, string>();
    for (const entry of manifest.redirects as unknown[]) {
        const row = entry as Partial<EdgeRedirectEntry> | null;
        if (typeof row !== 'object' || row === null || row.status !== 301 || row.preserve_query !== true) {
            throw new EdgeRedirectManifestError('INVALID_REDIRECT_ENTRY');
        }
        const from = pathOnly(row.from);
        const to = pathOnly(row.to);
        if (from === to) throw new EdgeRedirectManifestError('SELF_REDIRECT');
        const existing = paths.get(from);
        if (existing !== undefined && existing !== to) throw new EdgeRedirectManifestError('CONFLICTING_REDIRECT_TARGET');
        paths.set(from, to);
    }
    for (const to of paths.values()) {
        // Jeden krok, žádný řetěz ani smyčka -- i v podobě s/bez koncového lomítka.
        if (lookupPath(paths, to) !== undefined) throw new EdgeRedirectManifestError('REDIRECT_CHAIN_OR_CYCLE');
    }

    return { canonicalOrigin: origin.origin, canonicalHost: origin.hostname, hosts, paths };
}

/** Přesná shoda; starý web obsluhoval cestu i s koncovým lomítkem, proto druhý pokus bez něj. */
function lookupPath(paths: ReadonlyMap<string, string>, pathname: string): string | undefined {
    const exact = paths.get(pathname);
    if (exact !== undefined) return exact;
    if (pathname.length > 1 && pathname.endsWith('/')) return paths.get(pathname.slice(0, -1));
    return undefined;
}

/**
 * Vrátí 301 odpověď, pokud požadavek patří webu z manifestu a není na kanonické adrese.
 * `null` = nepřesměrovávat, pokračovat běžným routerem.
 */
export function resolveEdgeRedirect(request: Request, compiled: CompiledEdgeRedirects): Response | null {
    if (!(EDGE_REDIRECT_METHODS as readonly string[]).includes(request.method)) return null;

    let url: URL;
    try {
        url = new URL(request.url);
    } catch {
        return null;
    }
    const host = url.hostname.toLowerCase();
    if (!compiled.hosts.has(host)) return null;

    const mapped = lookupPath(compiled.paths, url.pathname);
    const needsCanonicalHost = url.protocol !== 'https:' || host !== compiled.canonicalHost || url.port !== '';
    if (mapped === undefined && !needsCanonicalHost) return null;

    const location = `${compiled.canonicalOrigin}${mapped ?? url.pathname}${url.search}`;
    return new Response(null, {
        status: 301,
        headers: {
            Location: location,
            // Krátká sdílená cache: chybu v manifestu jde opravit bez týdnů v CDN.
            'Cache-Control': 'public, max-age=3600',
        },
    });
}
