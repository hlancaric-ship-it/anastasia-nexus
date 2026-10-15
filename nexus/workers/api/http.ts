// HTTP helpery + structured logging. Vzor `corsResponse` / `jsonError`
// PŘEVZAT z ~/shoptet-cart-bypass-poc/src/worker.js, přepsán do TS.
//
// ZMĚNY OPROTI PoC:
//   1. PoC vrací `Access-Control-Allow-Origin: *` natvrdo. Tady je origin
//      omezitelný přes `ALLOWED_ORIGINS` -- validační endpoint prozrazuje
//      zůstatek platidla, takže wildcard je vědomé rozhodnutí, ne default.
//      Wildcard (bez `ALLOWED_ORIGINS`) se vrací JEN při výslovně
//      deklarovaném `ENVIRONMENT=development|test` (viz
//      `resolveRuntimeEnvironment`). Chybějící, prázdné, přepsané či neznámé
//      `ENVIRONMENT` se bere jako PRODUKCE = fail-closed (P0-1).
//   2. `Vary: Origin` -- bez něj by cache vrátila odpověď s cizím
//      `Allow-Origin` hlavičkou.
//   3. Structured logging (master rule "chyby čitelné bez dolování"):
//      jeden JSON řádek s `requestId`, ne `console.error("[Worker]", err)`.

export interface LogFields {
    readonly [key: string]: unknown;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Jeden strukturovaný řádek do Workers Logs (`observability.enabled: true`
 * v wrangler.jsonc). JSON, ne volný text -- jinak se v něm nedá filtrovat.
 *
 * NIKDY sem nepatří: `HMAC_SECRET`, celý token, plný kód voucheru.
 * Na to je `redactVoucherCode` / `redactToken` níže.
 */
export function log(level: LogLevel, event: string, fields: LogFields = {}): void {
    const line = JSON.stringify({
        level,
        event,
        ts: new Date().toISOString(),
        ...fields,
    });

    if (level === 'error') {
        console.error(line);
    } else if (level === 'warn') {
        console.warn(line);
    } else {
        console.log(line);
    }
}

/**
 * Kód voucheru je PLATIDLO (§4) -- do logu nesmí celý, jinak ho drží
 * kdokoli s přístupem k logům. Ponechá se prefix a poslední 4 znaky, což
 * stačí na dohledání incidentu, ale ne na uplatnění.
 */
export function redactVoucherCode(code: unknown): string {
    if (typeof code !== 'string' || code.length === 0) {
        return '<none>';
    }
    if (code.length <= 8) {
        return '***';
    }
    return `${code.slice(0, 6)}***${code.slice(-4)}`;
}

/** Z tokenu do logu jen prefix -- na korelaci stačí, na replay ne. */
export function redactToken(token: unknown): string {
    if (typeof token !== 'string' || token.length === 0) {
        return '<none>';
    }
    return `${token.slice(0, 8)}...`;
}

/**
 * Prostředí, ve kterém Worker běží. Jediná pravda pro bezpečnostní rozhodnutí
 * závislá na `ENVIRONMENT` (CORS, podpis webhooku).
 *
 * FAIL-CLOSED (P0-1): uvolnění (wildcard CORS, nepodepsaný webhook) smí
 * povolit POUZE přesná hodnota `development` nebo `test`. Cokoli jiného --
 * `production`, chybějící proměnná, prázdný řetězec, překlep (`prod`,
 * `Production`), neznámé jméno (`staging`), jiný typ -- se vyhodnotí jako
 * `production` (přísný režim).
 *
 * PROČ TAK A NE `ENVIRONMENT === 'production'`: wrangler `vars` se do `env.*`
 * nedědí. Zapomenutá deklarace znamenala `ENVIRONMENT === undefined`, a
 * porovnání s `'production'` pak tiše vypnulo všechny produkční kontroly.
 * Test proti tomuhle směru je jediný bezpečný: seznam výjimek je krátký a
 * explicitní, seznam "produkčních" hodnot by musel předvídat každý překlep.
 */
export type RuntimeEnvironment = 'development' | 'test' | 'production';

export function resolveRuntimeEnvironment(value: unknown): RuntimeEnvironment {
    if (value === 'development' || value === 'test') {
        return value;
    }
    return 'production';
}

/** `true` = přísný (produkční) režim. Výchozí stav pro vše neznámé. */
export function isStrictEnvironment(env: { ENVIRONMENT?: unknown }): boolean {
    return resolveRuntimeEnvironment(env.ENVIRONMENT) === 'production';
}

/** Strojově čitelné chybové kódy. Frontend na nich staví hlášky, ne na textu. */
export type ErrorCode =
    | 'INVALID_JSON'
    | 'VALIDATION_ERROR'
    | 'MISSING_BINDING'
    | 'NOT_FOUND'
    | 'METHOD_NOT_ALLOWED'
    | 'RATE_LIMITED'
    | 'REJECT_SIGNATURE'
    | 'REJECT_EXPIRED'
    | 'REJECT_REPLAY'
    | 'REJECT_AMOUNT_MISMATCH'
    | 'VOUCHER_NOT_FOUND'
    | 'VOUCHER_NOT_APPLICABLE'
    | 'REDEMPTION_CONFLICT'
    | 'HOLD'
    | 'STORAGE_UNAVAILABLE'
    | 'INTERNAL_ERROR';

/** Chyba s HTTP statusem a strojovým kódem. Vyhazuje ji route vrstva. */
export class ApiError extends Error {
    constructor(
        readonly code: ErrorCode,
        readonly status: number,
        message: string,
        readonly details?: LogFields,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

export function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
}

/** Tvar chybové odpovědi. `ok: false` je 1:1 z PoC (`jsonError`). */
export function jsonError(code: ErrorCode, message: string, status: number): Response {
    return jsonResponse({ ok: false, error: code, message }, status);
}

/**
 * Doplní CORS hlavičky. Vzor z PoC, rozšířený o allowlist a `Vary`.
 * Vrací NOVOU Response, protože hlavičky odpovědi z `Response.json()`
 * jsou v některých runtime immutable.
 *
 * Není-li origin povolen, NEPOSÍLÁ se žádná `Access-Control-Allow-*`
 * hlavička (prohlížeč pak odpověď cizí stránce nepředá). Dříve se posílalo
 * literální `Access-Control-Allow-Origin: null` -- to ale ODPOVÍDÁ requestům
 * s `Origin: null` (sandboxed iframe, `data:`/`file:` stránky), tedy
 * nepřímo povolovalo část nedůvěryhodných kontextů.
 */
export function withCors(response: Response, env: { ALLOWED_ORIGINS?: string; ENVIRONMENT?: unknown }, origin: string | null): Response {
    const headers = new Headers(response.headers);

    const allowedOrigin = resolveAllowedOrigin(env.ALLOWED_ORIGINS, origin, isStrictEnvironment(env));
    if (allowedOrigin !== null) {
        headers.set('Access-Control-Allow-Origin', allowedOrigin);
        headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Nexus-Signature');
        headers.set('Access-Control-Max-Age', '86400');
    }
    // Bez Vary by sdílená cache podávala odpověď s Allow-Origin jiného originu.
    headers.append('Vary', 'Origin');

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

/**
 * Vrací hodnotu pro `Access-Control-Allow-Origin`, nebo `null` = žádný grant.
 *
 * `isProduction` je ve výchozím stavu `true` (fail-closed): volající, který
 * příznak zapomene předat, nezíská wildcard.
 *
 *   - Přísný režim: `*` se NIKDY nevrací, ani když je v `ALLOWED_ORIGINS`
 *     (wildcard položka se ignoruje, výslovně vypsané originy vedle ní ale
 *     platí). Bez použitelného allowlistu není povolen žádný origin.
 *   - Uvolněný režim (výslovně development/test): bez allowlistu nebo s `*`
 *     vrací `*`, jinak shoda s allowlistem.
 *   - Shoda je PŘESNÁ (schéma + host + port). Opaque origin `null` se
 *     nepovolí nikdy, ani když je uveden v allowlistu.
 */
export function resolveAllowedOrigin(allowedOrigins: string | undefined, origin: string | null, isProduction = true): string | null {
    const allowed = (allowedOrigins ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

    if (!isProduction && (allowed.length === 0 || allowed.includes('*'))) {
        return '*';
    }
    if (origin !== null && origin !== 'null' && allowed.includes(origin) && origin !== '*') {
        return origin;
    }
    return null;
}

/**
 * Preflight. Povolený origin: 204 bez těla s grantem, jako v PoC.
 * Nepovolený origin: 403 bez jakékoli `Access-Control-Allow-*` hlavičky --
 * prohlížeč tím skutečný požadavek vůbec neodešle.
 */
export function preflightResponse(env: { ALLOWED_ORIGINS?: string; ENVIRONMENT?: unknown }, origin: string | null): Response {
    const denied = resolveAllowedOrigin(env.ALLOWED_ORIGINS, origin, isStrictEnvironment(env)) === null;
    return withCors(new Response(null, { status: denied ? 403 : 204 }), env, origin);
}
