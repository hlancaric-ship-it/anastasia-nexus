import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import worker from '../../workers/api/index.js';
import type { Env } from '../../workers/api/types.js';
import { D1ExecutionIntentStore } from '../../connectors/d1/D1ExecutionIntentStore.js';

const bindings = { DB: env.DB, HMAC_SECRET: 'synthetic-hmac', MEDUSA_PRICING_API_KEY: 'synthetic-service-key',
    MEDUSA_PRICING_TENANT_ID: 'synthetic-status', ENVIRONMENT: 'test' } as Env;
const ctx = { waitUntil: (_p: Promise<unknown>) => {} };
const request = (query = '', key = 'synthetic-service-key', origin?: string) => new Request('https://nexus.test/api/nexus/operations' + query, {
    headers: { authorization: `Bearer ${key}`, ...(origin ? { origin } : {}) },
});

it('real D1 status view is tenant-isolated and does not expose payload or raw failure text', async () => {
    const store = new D1ExecutionIntentStore(env.DB);
    const id = `intent-status-${crypto.randomUUID()}`;
    for (const tenantId of ['synthetic-status', 'synthetic-other']) {
        const intentId = `${tenantId}-${id}`;
        const context = { tenantId, platform: 'medusa' };
        await store.plan(context, { id: intentId, decisionId: intentId, domain: 'synthetic', connectorType: 'synthetic', operation: 'WRITE',
            targetRef: 'private-target', payload: { private: 'secret@example.test' }, expectedState: { private: 'other-secret' },
            idempotencyKey: intentId, plannedAt: '2026-10-16T12:00:00Z' });
        await store.claimForExecution(context, intentId, '2026-10-16T12:01:00Z');
        await store.recordOutcome(context, { intentId, expectedAttempt: 1, nextState: 'UNKNOWN', failureReason: 'private-credential', recordedAt: '2026-10-16T12:02:00Z' });
    }
    const response = await worker.fetch(request(), bindings, ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const result = await response.json() as { items: Array<{ id: string; needsReview: boolean; statusLabel: string }> };
    expect(result.items.some(item => item.id === `synthetic-status-${id}` && item.needsReview)).toBe(true);
    expect(result.items.some(item => item.id.startsWith('synthetic-other-'))).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/private|secret@example|payload|failureReason/);
    expect(result.items.find(item => item.id === `synthetic-status-${id}`)?.statusLabel).toBe('Treba overiť výsledok');
});

it('lists received events using the same tenant-bound read model', async () => {
    const id = `event-status-${crypto.randomUUID()}`;
    await env.DB.prepare(`INSERT INTO medusa_webhook_inbox (tenant_id,event_id,event_type,target_id,envelope_hash,processing_state)
        VALUES (?,?,?,?,?,'NEEDS_REVIEW')`).bind('synthetic-status', id, 'synthetic.event', 'ord_synthetic', 'a'.repeat(64)).run();
    const response = await worker.fetch(request('?kind=events'), bindings, ctx);
    expect(response.status).toBe(200);
    const result = await response.json() as { items: Array<{ id: string; needsReview: boolean }> };
    expect(result.items.some(item => item.id === id && item.needsReview)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('envelope_hash');
});

it.each([
    ['', 'wrong', undefined, 401], ['?tenantId=other', 'synthetic-service-key', undefined, 403],
    ['', 'synthetic-service-key', 'https://browser.test', 403], ['?limit=0', 'synthetic-service-key', undefined, 400],
    ['?kind=wrong', 'synthetic-service-key', undefined, 400], ['?offset=10001', 'synthetic-service-key', undefined, 400],
    ['?where=anything', 'synthetic-service-key', undefined, 400],
] as const)('rejects unsafe operations read %#', async (query, key, origin, status) => {
    expect((await worker.fetch(request(query, key, origin), bindings, ctx)).status).toBe(status);
});
