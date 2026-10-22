// Ochrana endpointu `/api/ai/query` (NEXUS Worker).
//
// Súbor nahradzuje pôvodnú verziu `aiGatewayRoute.test.ts`, ktorá overovala
// len GDPR bránu a prázdny dotaz -- a nepoznala autentifikáciu (endpoint
// bol vtedy veľný).
//
// Původně byl endpoint veřejný: stačilo poslat JSON a dostal se odpoveď
// od placeného AI poskytovatele. Tady se ověřuje, že:
//
//   1) vyžaduje autentifikaci (stejná credential jako cenová služba),
//   2) bez `AI_API_KEY` vrací 503 a AI nevolá,
//   3) rate limit je atomický (Durable Object) a fail-closed,
//   4) GDPR souhlas je povinný.
//
// Testy běží v Node (bez workerd): Durable Object je nahrazen fake objektem
// se stejnou smlouvou jako `SecurityCoordinator` (`/rate-limit`). Proti
// SKUTEČNÉMU DO běží `tests/workers/aiGateway.test.ts`.
import { describe, it, expect, vi } from 'vitest';
import { handleAIQuery } from '../../workers/api/routes/aiGateway.js';
import { ApiError, jsonError } from '../../workers/api/http.js';
import type { Env } from '../../workers/api/types.js';

const AI_KEY = 'synthetic-ai-key';
const SERVICE_KEY = 'synthetic-service-key';
const TENANT = 'anastasia';

/** Fake Durable Object: odpovídá `/rate-limit` jako `SecurityCoordinator`. */
function fakeRateLimit(options: { allowed?: boolean; remaining?: number; retryAfterSeconds?: number } = {}) {
    const calls: string[] = [];
    const stub = {
        fetch: vi.fn(async (input: string) => {
            calls.push(input);
            return new Response(
                JSON.stringify({
                    ok: options.allowed ?? true,
                    remaining: options.remaining ?? 9,
                    retryAfterSeconds: options.retryAfterSeconds ?? 30,
                }),
                { status: 200 },
            );
        }),
    };
    const namespace = {
        idFromName: (name: string) => ({ toString: () => name }),
        get: () => stub,
    };
    return { namespace, stub, calls };
}

function baseEnv(overrides: Record<string, unknown> = {}): Env {
    const { namespace } = fakeRateLimit();
    return {
        MEDUSA_PRICING_API_KEY: SERVICE_KEY,
        MEDUSA_PRICING_TENANT_ID: TENANT,
        AI_API_KEY: AI_KEY,
        VOUCHER_SECURITY: namespace,
        ...overrides,
    } as unknown as Env;
}

function request(body: unknown, options: { key?: string | null; ip?: string } = {}): Request {
    const key = options.key === undefined ? SERVICE_KEY : options.key;
    return new Request('https://nexus.test/api/ai/query', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(key === null ? {} : { authorization: `Bearer ${key}` }),
            ...(options.ip ? { 'cf-connecting-ip': options.ip } : {}),
        },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });
}

const VALID_BODY = { query: 'Čo je RESET 40+?', persona: 'wellness', gdprConsent: true };

/** Zrcadlí zpracování chyb v `workers/api/index.ts` (ApiError -> HTTP odpověď). */
async function call(req: Request, env: Env, fetchImpl?: typeof fetch): Promise<Response> {
    try {
        return await handleAIQuery(req, env, fetchImpl);
    } catch (error) {
        if (error instanceof ApiError) return jsonError(error.code, error.message, error.status);
        throw error;
    }
}

describe('AI gateway – autentizace', () => {
    it('odmítne požiadavku bez credentialu', async () => {
        const response = await call(request(VALID_BODY, { key: null }), baseEnv());
        expect(response.status).toBe(401);
        expect((await response.json()).error).toBe('REJECT_SIGNATURE');
    });

    it('odmítne požiadavku s nesprávnou credentialou', async () => {
        const response = await call(request(VALID_BODY, { key: 'wrong-key' }), baseEnv());
        expect(response.status).toBe(401);
    });

    it('vráti 503, keď chýba konfigurácia identity služby', async () => {
        expect((await call(request(VALID_BODY), baseEnv({ MEDUSA_PRICING_API_KEY: undefined }))).status).toBe(503);
        expect((await call(request(VALID_BODY), baseEnv({ MEDUSA_PRICING_TENANT_ID: undefined }))).status).toBe(503);
        expect((await call(request(VALID_BODY), baseEnv({ MEDUSA_PRICING_TENANT_ID: 'x' }))).status).toBe(503);
    });

    it('overí credentialu pred parsovaním tela (chybný podpis ≠ 400)', async () => {
        const response = await call(request('{', { key: 'wrong-key' }), baseEnv());
        expect(response.status).toBe(401);
    });
});

describe('AI gateway – konfigurácia poskytovateľa', () => {
    it('bez AI_API_KEY vráti 503 a poskytovateľa nevolá', async () => {
        const upstreamMock = vi.fn(async (_url: string, _init: RequestInit) => new Response('{}', { status: 200 }));
        const response = await call(request(VALID_BODY), baseEnv({ AI_API_KEY: undefined }), upstreamMock as unknown as typeof fetch);
        expect(response.status).toBe(503);
        expect((await response.json()).error).toBe('MISSING_BINDING');
        expect(upstreamMock).not.toHaveBeenCalled();
    });

    it('prázdny AI_API_KEY sa berie ako chýbajúca konfigurácia', async () => {
        const upstreamMock = vi.fn(async (_url: string, _init: RequestInit) => new Response('{}', { status: 200 }));
        const response = await call(request(VALID_BODY), baseEnv({ AI_API_KEY: '   ' }), upstreamMock as unknown as typeof fetch);
        expect(response.status).toBe(503);
        expect(upstreamMock).not.toHaveBeenCalled();
    });
});

describe('AI gateway – rate limit', () => {
    it('bez Durable Objectu je fail-closed (503), nikoli "limit neplatí"', async () => {
        const upstreamMock = vi.fn(async (_url: string, _init: RequestInit) => new Response('{}', { status: 200 }));
        const response = await call(request(VALID_BODY), baseEnv({ VOUCHER_SECURITY: undefined }), upstreamMock as unknown as typeof fetch);
        expect(response.status).toBe(503);
        expect((await response.json()).error).toBe('MISSING_BINDING');
        expect(upstreamMock).not.toHaveBeenCalled();
    });

    it('po vyčerpání limitu vráti 429 a AI nevolá', async () => {
        const { namespace } = fakeRateLimit({ allowed: false, retryAfterSeconds: 42 });
        const upstreamMock = vi.fn(async (_url: string, _init: RequestInit) => new Response('{}', { status: 200 }));
        const response = await call(request(VALID_BODY), baseEnv({ VOUCHER_SECURITY: namespace }), upstreamMock as unknown as typeof fetch);
        expect(response.status).toBe(429);
        expect(response.headers.get('Retry-After')).toBe('42');
        expect((await response.json()).error).toBe('RATE_LIMITED');
        expect(upstreamMock).not.toHaveBeenCalled();
    });

    it('počíta per IP aj per tenant a před voláním AI', async () => {
        const { namespace, calls } = fakeRateLimit();
        const upstreamMock = vi.fn(async (_url: string, _init: RequestInit) =>
            new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200 }),
        );
        const response = await call(
            request(VALID_BODY, { ip: '198.51.100.7' }),
            baseEnv({ VOUCHER_SECURITY: namespace }),
            upstreamMock as unknown as typeof fetch,
        );
        expect(response.status).toBe(200);
        expect(calls).toHaveLength(2);
        expect(calls[0]).toContain('ai%3Aip%3Aanastasia%3A198.51.100.7');
        expect(calls[1]).toContain('ai%3Atenant%3Aanastasia');
        expect(upstreamMock).toHaveBeenCalledTimes(1);
    });

    it('nevyčerpá limit, pokud poskytovateľ spadne (fail-closed)', async () => {
        const stub = { fetch: vi.fn(async () => new Response('nope', { status: 500 })) };
        const namespace = { idFromName: (name: string) => ({ toString: () => name }), get: () => stub };
        const upstreamMock = vi.fn(async (_url: string, _init: RequestInit) => new Response('{}', { status: 200 }));
        const response = await call(request(VALID_BODY), baseEnv({ VOUCHER_SECURITY: namespace }), upstreamMock as unknown as typeof fetch);
        expect(response.status).toBe(503);
        expect(upstreamMock).not.toHaveBeenCalled();
    });
});

describe('AI gateway – vstup a výstup', () => {
    it('vyžaduje súhlas GDPR (403)', async () => {
        const upstreamMock = vi.fn(async (_url: string, _init: RequestInit) => new Response('{}', { status: 200 }));
        const response = await call(request({ ...VALID_BODY, gdprConsent: false }), baseEnv(), upstreamMock as unknown as typeof fetch);
        expect(response.status).toBe(403);
        expect(upstreamMock).not.toHaveBeenCalled();
    });

    it('odmietne prázdny alebo príliš dlhý dotaz', async () => {
        expect((await call(request({ ...VALID_BODY, query: '   ' }), baseEnv())).status).toBe(422);
        expect((await call(request({ ...VALID_BODY, query: 'x'.repeat(1001) }), baseEnv())).status).toBe(422);
    });

    it('odmietne neplatné JSON', async () => {
        expect((await call(request('{', { key: SERVICE_KEY }), baseEnv())).status).toBe(400);
    });

    it('vráti odpoveď poskytovateľa a neprezradí kľúč ani detail chyby', async () => {
        const upstreamMock = vi.fn(async (_url: string, _init: RequestInit) =>
            new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Krátka odpoveď.' }] } }] }), { status: 200 }),
        );
        const response = await call(request(VALID_BODY), baseEnv(), upstreamMock as unknown as typeof fetch);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toMatchObject({ ok: true, answer: 'Krátka odpoveď.', persona: 'wellness', tenantId: TENANT });
        expect(JSON.stringify(body)).not.toContain(AI_KEY);
        const called = String(upstreamMock.mock.calls[0]![0]);
        expect(called).toContain('gemini-2.0-flash');
        expect(called).toContain(`key=${AI_KEY}`);
    });

    it('chyba poskytovateľa sa von nepropáraje (502 bez detailu)', async () => {
        const upstreamMock = vi.fn(async (_url: string, _init: RequestInit) => new Response('secret provider payload', { status: 500 }));
        const response = await call(request(VALID_BODY), baseEnv(), upstreamMock as unknown as typeof fetch);
        expect(response.status).toBe(502);
        const text = await response.text();
        expect(text).not.toContain('secret provider payload');
        expect(text).not.toContain(AI_KEY);
    });

    it('max_tokens je tvrdě omezené na 512', async () => {
        const upstreamMock = vi.fn(async (_url: string, _init: RequestInit) =>
            new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200 }),
        );
        await call(request(VALID_BODY), baseEnv(), upstreamMock as unknown as typeof fetch);
        const init = upstreamMock.mock.calls[0]![1];
        const body = JSON.parse(String(init.body));
        expect(body.generationConfig.maxOutputTokens).toBe(512);
    });
});
