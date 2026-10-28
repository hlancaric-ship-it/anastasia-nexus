// `/api/ai/query` proti SKUTEČNÉMU Durable Objectu (workerd).
//
// Node test (`tests/unit/aiGateway.test.ts`) ověřuje logiku s fake DO.
// Tady se ověřuje, že rate limit reálně počítá: atomicky, v jednom
// Durable Objectu `SecurityCoordinator`, a že po vyčerpání limitu
// endpoint odmítne dřív, než zavolá AI poskytovatele.
//
// Volání AI se v testu NIKDY neodchází na internet – provider je nahrazen
// stubem, který vrací syntetickou odpověď.
import { env } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import worker from '../../workers/api/index.js';
import { handleAIQuery } from '../../workers/api/routes/aiGateway.js';
import type { Env } from '../../workers/api/types.js';

const SERVICE_KEY = 'synthetic-ai-service-key';

const bindings = {
    DB: env.DB,
    HMAC_SECRET: 'synthetic-hmac-ai',
    VOUCHER_SECURITY: (env as unknown as Env).VOUCHER_SECURITY,
    MEDUSA_PRICING_API_KEY: SERVICE_KEY,
    MEDUSA_PRICING_TENANT_ID: 'anastasia',
    AI_API_KEY: 'synthetic-ai-provider-key',
} as unknown as Env;

const ctx = { waitUntil: (_promise: Promise<unknown>) => {} };

function request(body: unknown, options: { key?: string | null; ip?: string } = {}): Request {
    const key = options.key === undefined ? SERVICE_KEY : options.key;
    return new Request('https://nexus.test/api/ai/query', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(key === null ? {} : { authorization: `Bearer ${key}` }),
            ...(options.ip ? { 'cf-connecting-ip': options.ip } : {}),
        },
        body: JSON.stringify(body),
    });
}

const BODY = { query: 'Ako sa mám správne vyspať?', persona: 'wellness', gdprConsent: true };

const upstreamStub = () =>
    vi.fn(async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Syntetická odpoveď.' }] } }] }), {
            status: 200,
        }),
    );

describe('AI gateway proti skutečnému Durable Objectu', () => {
    it('routing přes worker odmítne požiadavku bez credentialu (401)', async () => {
        const response = await worker.fetch(request(BODY, { key: null }), bindings, ctx);
        expect(response.status).toBe(401);
        const body = (await response.json()) as { error?: string };
        expect(body.error).toBe('REJECT_SIGNATURE');
    });

    it('routing přes worker odmítne nesprávnu credentialu (401)', async () => {
        const response = await worker.fetch(request(BODY, { key: 'wrong-key' }), bindings, ctx);
        expect(response.status).toBe(401);
    });

    it('bez AI_API_KEY vrátí 503 a poskytovateľa nevolá', async () => {
        const response = await worker.fetch(
            request(BODY),
            { ...bindings, AI_API_KEY: undefined } as unknown as Env,
            ctx,
        );
        expect(response.status).toBe(503);
        const body = (await response.json()) as { error?: string };
        expect(body.error).toBe('MISSING_BINDING');
    });

    it('odpovídá s odpovědí poskytovatele (200) a neprezradí kľúč', async () => {
        const upstreamMock = upstreamStub();
        const response = await handleAIQuery(request(BODY, { ip: '203.0.113.10' }), bindings, upstreamMock as unknown as typeof fetch);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toMatchObject({ ok: true, answer: 'Syntetická odpoveď.', tenantId: 'anastasia' });
        expect(JSON.stringify(body)).not.toContain('synthetic-ai-provider-key');
    });

    it('po vyčerpání limitu per IP odmítne dřív, než zavolá AI (429)', async () => {
        const upstreamMock = upstreamStub();
        const ip = '203.0.113.99';
        // Vlastní tenant, aby se stav rate limitu nesdílel s ostatními testy.
        const tenantBindings = { ...bindings, MEDUSA_PRICING_TENANT_ID: 'rltest' } as unknown as Env;

        for (let attempt = 0; attempt < 10; attempt += 1) {
            const response = await handleAIQuery(request(BODY, { ip }), tenantBindings, upstreamMock as unknown as typeof fetch);
            expect(response.status).toBe(200);
        }

        const blocked = await handleAIQuery(request(BODY, { ip }), tenantBindings, upstreamMock as unknown as typeof fetch);
        expect(blocked.status).toBe(429);
        expect(blocked.headers.get('Retry-After')).toBeTruthy();
        const blockedBody = (await blocked.json()) as { error?: string };
        expect(blockedBody.error).toBe('RATE_LIMITED');
        // 10 povolených + 1 zablokovaná = 11 volání poskytovatele, ne 12.
        expect(upstreamMock).toHaveBeenCalledTimes(10);
    });
});
