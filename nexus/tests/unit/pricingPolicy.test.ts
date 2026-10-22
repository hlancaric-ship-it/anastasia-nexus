import { describe, expect, it } from 'vitest';
import { handleNexusPricingPolicy } from '../../workers/api/routes/nexusPricingPolicy.js';
import { resolveTenantPolicy } from '../../workers/api/routes/nexusPricing.js';
import { invalidateStoredPolicyCache, pricingPolicyKey } from '../../workers/api/pricing-policy-store.js';
import type { Env, KVNamespaceLike } from '../../workers/api/types.js';

// Node testy této části běží v `npm test` (workerd testy `npm run test:workers`
// na této macOS verzi nespustí -- viz AGENTS.md). Logika je stejná: podepsaný
// webhook z Medusa -> KV -> cenová politika s fallbackem na env var.

const TENANT = 'synthetic-loyalty';
const SECRET = 'synthetic-webhook-secret';

const envPolicy = JSON.stringify({
    loyaltyTiers: { ZR1: 0.01 },
    brandLimits: {},
    categoryLimits: {},
    brandSaleDiscounts: {},
});

function fakeKv(): KVNamespaceLike & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return {
        data,
        async get(key: string) { return data.get(key) ?? null; },
        async put(key: string, value: string) { data.set(key, value); },
        async delete(key: string) { data.delete(key); },
    };
}

function bindings(kv?: KVNamespaceLike): Env {
    return {
        MEDUSA_PRICING_TENANT_ID: TENANT,
        MEDUSA_WEBHOOK_SECRET: SECRET,
        MEDUSA_PRICING_POLICY_JSON: envPolicy,
        PRICING_POLICY: kv,
    } as unknown as Env;
}

async function sign(body: string, secret = SECRET): Promise<string> {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`)));
    const hex = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
    return `t=${timestamp},v1=${hex}`;
}

function request(payload: unknown, signature: string): Request {
    return new Request('https://nexus.test/api/nexus/pricing-policy', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-medusa-signature': signature },
        body: JSON.stringify(payload),
    });
}

describe('Politika věrnostních úrovní v NEXUS Workeru', () => {
    it('uloží podepsanou politiku do KV a použije ji místo env varu', async () => {
        invalidateStoredPolicyCache();
        const kv = fakeKv();
        const body = JSON.stringify({ tenantId: TENANT, loyaltyTiers: { ZR3: 0.1 } });
        const response = await handleNexusPricingPolicy(request(JSON.parse(body), await sign(body)), bindings(kv));
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ accepted: true, tenantId: TENANT, tiers: 1 });
        expect(kv.data.has(pricingPolicyKey(TENANT))).toBe(true);

        const policy = await resolveTenantPolicy(bindings(kv));
        expect(policy.loyaltyTiers).toEqual({ ZR3: 0.1 });
        // Limity značek a kategorií zostávajú z env varu -- politika z DB ich nemení.
        expect(policy.brandLimits).toEqual({});
    });

    it('bez uloženej politiky použije env politiku (fallback)', async () => {
        invalidateStoredPolicyCache();
        const policy = await resolveTenantPolicy(bindings(fakeKv()));
        expect(policy.loyaltyTiers).toEqual({ ZR1: 0.01 });
    });

    it('bez KV bindingu použije env politiku', async () => {
        invalidateStoredPolicyCache();
        const policy = await resolveTenantPolicy(bindings(undefined));
        expect(policy.loyaltyTiers).toEqual({ ZR1: 0.01 });
    });

    it('odmítne politiku bez platného podpisu', async () => {
        invalidateStoredPolicyCache();
        const kv = fakeKv();
        const body = JSON.stringify({ tenantId: TENANT, loyaltyTiers: { ZR4: 0.5 } });
        await expect(handleNexusPricingPolicy(request(JSON.parse(body), await sign(body, 'jiný-kľúč')), bindings(kv)))
            .rejects.toMatchObject({ status: 401 });
        expect(kv.data.size).toBe(0);
    });

    it('odmítne politiku pro cudí tenant', async () => {
        invalidateStoredPolicyCache();
        const kv = fakeKv();
        const body = JSON.stringify({ tenantId: 'jiný-tenant', loyaltyTiers: { ZR4: 0.5 } });
        await expect(handleNexusPricingPolicy(request(JSON.parse(body), await sign(body)), bindings(kv)))
            .rejects.toMatchObject({ status: 403 });
        expect(kv.data.size).toBe(0);
    });

    it('odmítne zľavu nad 50 % a neplatný kód úrovne', async () => {
        invalidateStoredPolicyCache();
        const kv = fakeKv();
        const tooMuch = JSON.stringify({ tenantId: TENANT, loyaltyTiers: { ZR1: 0.9 } });
        await expect(handleNexusPricingPolicy(request(JSON.parse(tooMuch), await sign(tooMuch)), bindings(kv)))
            .rejects.toMatchObject({ status: 422 });
        const wrongCode = JSON.stringify({ tenantId: TENANT, loyaltyTiers: { gold: 0.1 } });
        await expect(handleNexusPricingPolicy(request(JSON.parse(wrongCode), await sign(wrongCode)), bindings(kv)))
            .rejects.toMatchObject({ status: 422 });
        expect(kv.data.size).toBe(0);
    });

    it('bez KV bindingu zápis odmietne (fail-closed), ale politika z env ostáva čitateľná', async () => {
        invalidateStoredPolicyCache();
        const body = JSON.stringify({ tenantId: TENANT, loyaltyTiers: { ZR2: 0.05 } });
        await expect(handleNexusPricingPolicy(request(JSON.parse(body), await sign(body)), bindings(undefined)))
            .rejects.toMatchObject({ status: 503 });
    });
});
