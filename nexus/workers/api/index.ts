// NEXUS API Worker -- entry point (wrangler.jsonc `main`).
//
// VZOR PŘEVZAT z ~/shoptet-cart-bypass-poc/src/worker.js (`export default
// { fetch }` + `corsResponse` + `jsonError` + jeden try/catch kolem
// routeru), přepsán do TS s typovaným `Env`.
//
// ZMĚNY OPROTI PoC -- a proč:
//   1. `Env` je TYPOVANÝ (types.ts), ne implicitní `any`. PoC si na `env`
//      sahal bez kontroly a chybějící binding se projevil až za běhu.
//   2. BINDINGY SE OVĚŘUJÍ NA VSTUPU (`assertRequiredBindings`). PoC měl
//      `if (env.SECURITY_DO) { ... } else { MOCK_KV_STORE }` -- pro platidlo
//      se ten fallback NEKOPÍRUJE. Chybí-li `DB` nebo `HMAC_SECRET`,
//      request SELŽE 503. Tiché pokračování bez podpisu nebo bez databáze
//      by u peněz znamenalo odečet naslepo.
//   3. Structured logging (JSON řádek) místo `console.error("[Goliáš]", err)`.
//   4. `requestId` -- korelace mezi logem HTTP vrstvy a logem uvnitř route.
//
// Router je záměrně ruční `switch`, ne framework: dva endpointy nepotřebují
// Hono ani itty-router a každá další dependency je věc, kterou je nutné
// pinovat a hlídat (master rule).

import { ApiError, jsonError, log, preflightResponse, withCors } from './http.js';
import { handleShoptetWebhook } from './routes/shoptetWebhook.js';
import { handleMedusaWebhook } from './routes/medusaWebhook.js';
import { handleNexusPricing } from './routes/nexusPricing.js';
import { handleMediaDelivery, MEDIA_PATH_PREFIX } from './routes/mediaDelivery.js';
import { handleNexusSafeOrder } from './routes/nexusSafeOrder.js';
import { handleKlubSubscribe } from './routes/klubSubscribe.js';
import { handleAIQuery } from './routes/aiGateway.js';
import { handleIssue } from './routes/issuance.js';
import { handleRedeem, handleValidate } from './routes/voucher.js';
import type { Env } from './types.js';
import { flushOpsEvents } from './ops-ingest.js';
import { compileEdgeRedirects, resolveEdgeRedirect, type CompiledEdgeRedirects } from './edgeRedirects.js';
import { EDGE_REDIRECT_MANIFEST } from './edgeRedirectsManifest.js';

/**
 * DO třída MUSÍ být exportovaná z `main` modulu (wrangler.jsonc
 * `main: workers/api/index.ts`) -- workerd hledá `class_name` z
 * `durable_objects.bindings` mezi exporty entry pointu. Bez tohohle řádku
 * deploy spadne na "Durable Object class SecurityCoordinator not found".
 * Není to import kvůli použití: `index.ts` na DO nesahá, volá ho
 * `resolveNonceStore` v routes/voucher.ts přes binding.
 */
export { SecurityCoordinator } from './SecurityCoordinator.js';

/** Minimální tvar Cloudflare `ExecutionContext` -- potřebujeme jen waitUntil. */
interface ExecutionContextLike {
    waitUntil(promise: Promise<unknown>): void;
}

export default {
    // `ctx` je potřeba pro `ctx.waitUntil()` -- webhook musí odpovědět do
    // 4 s (§16) a zpracování běží až po odeslání odpovědi.
    async fetch(request: Request, env: Env, ctx: ExecutionContextLike): Promise<Response> {
        const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
        try {
            return withRequestId(await handle(request, env, ctx, requestId), requestId);
        } finally {
            // warn/error události do Medusa `ops_event` až po odeslání odpovědi
            ctx.waitUntil(flushOpsEvents(env));
        }
    },
};

const REQUEST_ID_HEADER = 'x-request-id';
const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{8,64}$/;

/** Bezpečné příchozí ID (Medusa / storefront) se převezme kvůli korelaci, jinak nové. */
function resolveRequestId(incoming: string | null): string {
    return incoming && REQUEST_ID_RE.test(incoming) ? incoming : crypto.randomUUID();
}

function withRequestId(response: Response, requestId: string): Response {
    try {
        response.headers.set(REQUEST_ID_HEADER, requestId);
        return response;
    } catch {
        // neměnné hlavičky (např. odpověď přímo z fetch/R2) -- kopie
        const copy = new Response(response.body, response);
        copy.headers.set(REQUEST_ID_HEADER, requestId);
        return copy;
    }
}

async function handle(request: Request, env: Env, ctx: ExecutionContextLike, requestId: string): Promise<Response> {
    const origin = request.headers.get('Origin');
    const startedAt = Date.now();

    // Preflight se řeší PŘED validací bindingů: prohlížeč po něm chce
    // jen hlavičky a 503 by CORS rozbil i pro čtení chybové hlášky.
    if (request.method === 'OPTIONS') {
        return preflightResponse(env, origin);
    }

    const url = new URL(request.url);

    // C-2: staré URL webu -> 301 ještě PŘED kontrolou bindingů (přesměrování nepotřebuje DB
    // a nesmí spadnout na 503 kvůli chybějícímu HMAC). Hosty mimo manifest projdou dál.
    const redirects = edgeRedirects();
    const redirect = redirects ? resolveEdgeRedirect(request, redirects) : null;
    if (redirect) {
        // Jen cesta, ne query: QR odkaz nese kód kupónu.
        log('info', 'http.edge_redirect', { requestId, method: request.method, path: url.pathname, status: redirect.status });
        return redirect;
    }

    // Cesty svázané s Medusou mají tenanta danou credentialem (MEDUSA_PRICING_TENANT_ID);
    // jen jejich události smí jít do Medusa `ops_event` (viz ops-ingest.ts).
    const opsTenant = isMedusaBoundPath(url.pathname) ? env.MEDUSA_PRICING_TENANT_ID?.trim().toLowerCase() : undefined;

    try {
        assertRequiredBindings(env);

        const response = await route(request, env, url, ctx);

        log('info', 'http.request', {
            requestId,
            opsTenant,
            method: request.method,
            path: url.pathname,
            status: response.status,
            durationMs: Date.now() - startedAt,
        });

        return withCors(response, env, origin);
    } catch (error) {
        if (error instanceof ApiError) {
            // Očekávaná, klasifikovaná chyba -- kód i hláška jdou ven.
            log(error.status >= 500 ? 'error' : 'warn', 'http.api_error', {
                requestId,
                method: request.method,
                path: url.pathname,
                code: error.code,
                status: error.status,
                message: error.message,
                ...(error.details ?? {}),
                // až po details: tenanta nesmí přepsat data z chyby
                opsTenant,
                durationMs: Date.now() - startedAt,
            });
            return withCors(jsonError(error.code, error.message, error.status), env, origin);
        }

        // Neočekávaná chyba: detail JEN do logu, ven obecná hláška.
        // Stack trace v odpovědi je únik informací o vnitřní struktuře.
        log('error', 'http.unhandled_error', {
            requestId,
            opsTenant,
            method: request.method,
            path: url.pathname,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            durationMs: Date.now() - startedAt,
        });
        return withCors(
            jsonError('INTERNAL_ERROR', 'Vnitřní chyba serveru.', 500),
            env,
            origin,
        );
    }
}

let compiledRedirects: CompiledEdgeRedirects | null | undefined;

/** Manifest se kompiluje jednou na izolát; neplatný = žádné přesměrování + alert do logu, API běží dál. */
function edgeRedirects(): CompiledEdgeRedirects | null {
    if (compiledRedirects !== undefined) return compiledRedirects;
    try {
        compiledRedirects = compileEdgeRedirects(EDGE_REDIRECT_MANIFEST);
    } catch (error) {
        log('error', 'worker.edge_redirects_invalid', { alert: true, code: error instanceof Error ? error.message : String(error) });
        compiledRedirects = null;
    }
    return compiledRedirects;
}

function isMedusaBoundPath(pathname: string): boolean {
    const path = pathname.replace(/\/+$/, '');
    return path.startsWith('/api/nexus/') || path === '/api/webhooks/medusa' || pathname.startsWith(MEDIA_PATH_PREFIX);
}

async function route(request: Request, env: Env, url: URL, ctx: ExecutionContextLike): Promise<Response> {
    const path = url.pathname.replace(/\/+$/, '');

    if (url.pathname.startsWith(MEDIA_PATH_PREFIX)) {
        return handleMediaDelivery(request, env);
    }

    switch (path) {
        case '/api/nexus/pricing':
            requireMethod(request, 'POST');
            return handleNexusPricing(request, env);

        case '/api/nexus/safeorder':
            requireMethod(request, 'POST');
            return handleNexusSafeOrder(request, env);

        case '/api/vouchers/validate':
            requireMethod(request, 'GET');
            return handleValidate(request, env);

        case '/api/vouchers/redeem':
            requireMethod(request, 'POST');
            return handleRedeem(request, env);

        // §4 Issuance -- order webhook "zákazník koupil poukaz".
        // §15: emise NENÍ zdanitelné plnění (MPV) -- viz hlavička routes/issuance.ts.
        case '/api/vouchers/issue':
            requireMethod(request, 'POST');
            return handleIssue(request, env);

        case '/api/klub/subscribe':
            requireMethod(request, 'POST');
            return handleKlubSubscribe(request, env);

        case '/api/ai/query':
            requireMethod(request, 'POST');
            return handleAIQuery(request, env);

        case '/api/webhooks/medusa':
            requireMethod(request, 'POST');
            return handleMedusaWebhook(request, env, ctx);

        case '/api/webhooks/shoptet':
            requireMethod(request, 'POST');
            return handleShoptetWebhook(request, env, ctx);

        default:
            throw new ApiError('NOT_FOUND', 404, `Neznámý endpoint ${url.pathname}.`);
    }
}

function requireMethod(request: Request, expected: string): void {
    if (request.method !== expected) {
        throw new ApiError(
            'METHOD_NOT_ALLOWED',
            405,
            `Endpoint očekává ${expected}, dostal ${request.method}.`,
        );
    }
}

/**
 * FAIL-CLOSED kontrola bindingů. Ne obrana proti útočníkovi -- obrana proti
 * špatnému deploymentu.
 *
 * KONKRÉTNÍ RIZIKO: wrangler.jsonc `d1_databases` se do `env.*` NEDĚDÍ
 * (komentář přímo v tom souboru). Zapomenuté zopakování v `env.production`
 * znamená produkční Worker BEZ `DB`. Bez téhle kontroly by se to projevilo
 * až nečitelným "cannot read property prepare of undefined" uvnitř route.
 *
 * `HMAC_SECRET` chybí, dokud neproběhne `wrangler secret put`. Bez něj by
 * se podepisovalo prázdným klíčem -- `hmac.ts` to sice odmítne také, ale
 * tady je to vidět dřív a s jasnou hláškou.
 */
function assertRequiredBindings(env: Env): void {
    const missing: string[] = [];

    if (env.DB === undefined || typeof env.DB.prepare !== 'function') {
        missing.push('DB');
    }
    if (typeof env.HMAC_SECRET !== 'string' || env.HMAC_SECRET.length === 0) {
        missing.push('HMAC_SECRET');
    }

    if (missing.length > 0) {
        // `alert: true` -- chybějící binding na produkci je incident, ne varování.
        log('error', 'worker.missing_bindings', { alert: true, missing });
        throw new ApiError(
            'MISSING_BINDING',
            503,
            `Worker není správně nakonfigurován (chybí: ${missing.join(', ')}).`,
        );
    }
}
