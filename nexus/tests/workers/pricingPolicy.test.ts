import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import worker from '../../workers/api/index.js';
import type { Env } from '../../workers/api/types.js';
import { invalidateStoredPolicyCache, pricingPolicyKey } from '../../workers/api/pricing-policy-store.js';

// Politika věrnostních úrovní: Medusa ji posílá podepsaným webhookem do KV,
// Worker ji použije místo hodnot z env varu. Bez podpisu / s cizím tenantem
// / s neplatnou mapou se politika nepřijme.

const TENANT = 'synthetic-loyalty';
const SECRET = 'synthetic-webhook-secret';
const API_KEY = 'synthetic-pricing-key';

const envPolicy = JSON.stringify({
    loyaltyTiers: { ZR1: 0.01 },
    brandLimits: {},
    categoryLimits: {},
    brandSaleDiscounts: {},
});

function bindings(extra: Partial<Env> = {}): Env {
    return {
        DB: env.DB,
        HMAC_SECRET: 'synthetic-hmac',
        MEDUSA_PRICING_API_KEY: API_KEY,
        MEDUSA_PRICING_TENANT_ID: TENANT,
        MEDUSA_WEBHOOK_SECRET: SECRET,
        MEDUSA_PRICING_POLICY_JSON: envPolicy,
        PRICING_POLICY: env.PRICING_POLICY,
        ...extra,
    } as Env;
}

const ctx = { waitUntil: (_p: Promise<unknown>) => {} };

async function sign(body: string, secret = SECRET): Promise<string> {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`)));
    const hex = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
    return `t=${timestamp},v1=${hex}`;
}

function policyRequest(payload: unknown, signature: string): Request {
    return new Request('https://nexus.test/api/nexus/pricing-policy', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-medusa-signature': signature },
        body: JSON.stringify(payload),
    });
}

function pricingRequest(sku: string, tier: string): Request {
    return new Request('https://nexus.test/api/nexus/pricing', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ tenantId: TENANT, sku, basePrice: 100, customerTier: tier }),
    });
}

async function resetPolicy(): Promise<void> {
    await env.PRICING_POLICY.delete(pricingPolicyKey(TENANT));
    invalidateStoredPolicyCache();
}

it('prijme politiku z DB Medusa a použije ji místo hodnot z env varu', async () => {
    await resetPolicy();
    const body = JSON.stringify({ tenantId: TENANT, loyaltyTiers: { ZR3: 0.1 } });
    const response = await worker.fetch(policyRequest(JSON.parse(body), await sign(body)), bindings(), ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ accepted: true, tenantId: TENANT, tiers: 1 });

    const priced = await worker.fetch(pricingRequest('SKU-1', 'ZR3'), bindings(), ctx);
    expect(priced.status).toBe(200);
    const result = await priced.json() as { calculated: { finalPrice: number; appliedRules: string[] } };
    // Zľava 10 % z KV politiky, ne 1 % z env varu.
    expect(result.calculated.finalPrice).toBe(90);
    expect(result.calculated.appliedRules.join(',')).toContain('LOYALTY');
});

it('bez uložené politiky použije env politiku (fallback)', async () => {
    await resetPolicy();
    const response = await worker.fetch(pricingRequest('SKU-2', 'ZR1'), bindings(), ctx);
    expect(response.status).toBe(200);
    const result = await response.json() as { calculated: { finalPrice: number } };
    expect(result.calculated.finalPrice).toBe(99);
});

it('úroveň, ktorá v uloženej politike chýba, nezľavuje', async () => {
    await resetPolicy();
    const body = JSON.stringify({ tenantId: TENANT, loyaltyTiers: { ZR3: 0.1 } });
    await worker.fetch(policyRequest(JSON.parse(body), await sign(body)), bindings(), ctx);
    const response = await worker.fetch(pricingRequest('SKU-4', 'ZR1'), bindings(), ctx);
    const result = await response.json() as { calculated: { finalPrice: number } };
    expect(result.calculated.finalPrice).toBe(100);
});

it('odmítne politiku bez platného podpisu', async () => {
    const body = JSON.stringify({ tenantId: TENANT, loyaltyTiers: { ZR4: 0.5 } });
    const response = await worker.fetch(policyRequest(JSON.parse(body), await sign(body, 'jiný-tajný-kľúč')), bindings(), ctx);
    expect(response.status).toBe(401);
});

it('odmítne politiku pro cudí tenant', async () => {
    const body = JSON.stringify({ tenantId: 'other-tenant', loyaltyTiers: { ZR4: 0.5 } });
    const response = await worker.fetch(policyRequest(JSON.parse(body), await sign(body)), bindings(), ctx);
    expect(response.status).toBe(403);
});

it('odmítne neplatnú mapu zľav', async () => {
    const body = JSON.stringify({ tenantId: TENANT, loyaltyTiers: { ZR1: 0.9 } });
    const response = await worker.fetch(policyRequest(JSON.parse(body), await sign(body)), bindings(), ctx);
    expect(response.status).toBe(422);
});

it('bez KV bindingu odmítne zápis, ale cenová služba dál jede na env politike', async () => {
    const body = JSON.stringify({ tenantId: TENANT, loyaltyTiers: { ZR2: 0.05 } });
    const response = await worker.fetch(policyRequest(JSON.parse(body), await sign(body)), bindings({ PRICING_POLICY: undefined }), ctx);
    expect(response.status).toBe(503);

    const priced = await worker.fetch(pricingRequest('SKU-3', 'ZR1'), bindings({ PRICING_POLICY: undefined }), ctx);
    expect(priced.status).toBe(200);
});
