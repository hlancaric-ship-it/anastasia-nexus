// Rate limit přes Durable Object `SecurityCoordinator` (`VOUCHER_SECURITY`).
//
// PROČ SAMOSTATNÝ SOUBOR:
// `routes/voucher.ts` má vlastní inline adaptér na stejný DO. Tento modul je
// jeho kopie vytažená pro `routes/aiGateway.ts`, aby se DAJ OBA ADAPTÉRY
// SPOJIT v jednom místě (jednotlivý zdroj pravdy pro rate limit).
// Záměrně NEMÁMĚNÍ `routes/voucher.ts` -- ten patří jinému balíku práce.
//
// JEDINÝ ZDROJ PRAVDY: `NonceStore.checkRateLimit` v `types.ts`.
// Kontrakt je shodný s tím, co DO reálně umí (`/rate-limit` na
// `SecurityCoordinator`): atomické počítadlo v jednom okrese.
//
// FAIL-CLOSED: nedostupné úložiště NIKDY neznamená "limit je splněn".
// U placeného endpointu, který by jinak volal AI poskytovatele, je
// výpadek rate limitu otvorená vrátka pro hrubou sílu.

import { ApiError, log } from './http.js';
import type { DurableObjectNamespace, Env, RateLimitVerdict } from './types.js';

export interface RateLimiter {
    /** `true` = request smí projít; `false` = limit vyčerpán. */
    checkRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitVerdict>;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Adaptér na Durable Object `SecurityCoordinator` (`/rate-limit`).
 *
 * Chybí-li binding, hází 503 -- request NESMÍ projít. Stejně jako u nonce
 * store: chybějící úložiště není „limit neplatí“.
 */
export function resolveRateLimiter(env: Env): RateLimiter {
    const namespace: DurableObjectNamespace | undefined = env.VOUCHER_SECURITY;

    if (namespace === undefined) {
        log('error', 'rate_limit.binding_missing', { alert: true });
        throw new ApiError(
            'MISSING_BINDING',
            503,
            'Ochrana proti nadměrným dotazům není nakonfigurovaná.',
        );
    }

    return {
        async checkRateLimit(key, limit, windowMs) {
            try {
                const stub = namespace.get(namespace.idFromName('global'));
                const response = await stub.fetch(
                    `https://voucher-security.internal/rate-limit?key=${encodeURIComponent(key)}&limit=${limit}&windowMs=${windowMs}`,
                );

                if (!response.ok) {
                    throw new Error(`rate limit store status ${response.status}`);
                }

                const data = (await response.json()) as {
                    ok?: unknown;
                    remaining?: unknown;
                    retryAfterSeconds?: unknown;
                };

                return {
                    allowed: data.ok === true,
                    remaining: typeof data.remaining === 'number' ? data.remaining : undefined,
                    retryAfterSeconds:
                        typeof data.retryAfterSeconds === 'number' ? data.retryAfterSeconds : undefined,
                };
            } catch (error) {
                log('error', 'rate_limit.check_failed', {
                    alert: true,
                    message: errorMessage(error),
                });
                // FAIL-CLOSED: výpadek úložiště nesmí otevřít endpoint,
                // který by jinak volal placenou službu.
                throw new ApiError(
                    'STORAGE_UNAVAILABLE',
                    503,
                    'Ochrana proti nadměrným dotazům je nedostupná.',
                );
            }
        },
    };
}
