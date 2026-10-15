import { env } from 'cloudflare:test';
import { expect, it, vi } from 'vitest';
import worker from '../../workers/api/index.js';
import { D1ExecutionIntentStore } from '../../connectors/d1/D1ExecutionIntentStore.js';
import type { Env } from '../../workers/api/types.js';

it('scheduled recovery persists UNKNOWN, reports it and leaves another tenant untouched', async () => {
    const tenantId = `recovery_${crypto.randomUUID().slice(0, 8)}`;
    const store = new D1ExecutionIntentStore(env.DB);
    const now = Date.parse('2026-10-16T12:00:00.000Z');
    const ids: string[] = [];
    for (const tenant of [tenantId, `other_${tenantId}`]) {
        const id = `scheduled-${crypto.randomUUID()}`;
        ids.push(id);
        const context = { tenantId: tenant, platform: 'medusa' };
        await store.plan(context, { id, decisionId: id, domain: 'synthetic', connectorType: 'synthetic',
            operation: 'WRITE', targetRef: id, payload: { private: 'synthetic-private@example.test' },
            expectedState: {}, idempotencyKey: id, plannedAt: new Date(now - 120_000).toISOString() });
        await store.claimForExecution(context, id, new Date(now - 60_000).toISOString());
    }
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const info = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
        const bindings = { DB: env.DB, HMAC_SECRET: 'synthetic-hmac', MEDUSA_PRICING_TENANT_ID: tenantId, NEXUS_EXECUTION_TIMEOUT_MS: '60000' } as Env;
        const pending: Promise<unknown>[] = [];
        await worker.scheduled({ scheduledTime: now }, bindings, { waitUntil: p => { pending.push(p); } });
        await Promise.all(pending);
        expect((await store.findById(tenantId, ids[0]!))?.state).toBe('UNKNOWN');
        expect((await store.findById(`other_${tenantId}`, ids[1]!))?.state).toBe('EXECUTING');
        expect(warnings).toHaveBeenCalledTimes(1);
        expect(JSON.parse(warnings.mock.calls[0]![0] as string)).toMatchObject({ event: 'execution.recovered_unknown', intent_id: ids[0] });
        expect(JSON.stringify(warnings.mock.calls)).not.toContain('synthetic-private');
        await worker.scheduled({ scheduledTime: now }, bindings, { waitUntil: p => { pending.push(p); } });
        await Promise.all(pending);
        expect(warnings).toHaveBeenCalledTimes(1);
    } finally { warnings.mockRestore(); info.mockRestore(); }
});

it.each(['0', '-1', 'NaN', '1.2', '86400001', ''])('invalid deadline %s stops without touching D1', async (timeout) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bindings = { NEXUS_EXECUTION_TIMEOUT_MS: timeout, MEDUSA_PRICING_TENANT_ID: 'synthetic' } as Env;
    try {
        await expect(worker.scheduled({ scheduledTime: Date.parse('2026-10-16T12:00:00Z') }, bindings, { waitUntil: () => {} }))
            .rejects.toThrow('EXECUTION_RECOVERY_FAILED');
        expect(error).toHaveBeenCalled();
    } finally { error.mockRestore(); }
});

it('unconfigured recovery does no work and needs no database', async () => {
    await expect(worker.scheduled({ scheduledTime: 0 }, {} as Env, { waitUntil: () => {} })).resolves.toBeUndefined();
});
