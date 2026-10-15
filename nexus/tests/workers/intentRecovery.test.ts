import { env } from 'cloudflare:test';
import { D1ExecutionIntentStore } from '../../connectors/d1/D1ExecutionIntentStore.js';
import { intentRecoveryContract } from '../helpers/intentRecoveryContract.js';

intentRecoveryContract('real D1 execution recovery', () => new D1ExecutionIntentStore(env.DB));

import { expect, it } from 'vitest';
import type { D1DatabaseLike } from '../../connectors/d1/D1ExecutionIntentStore.js';

/** Interleave work around a real SQL write; no SQL result is mocked. */
function interleaveWrite(pattern: string, after: boolean, action: () => Promise<void>): D1DatabaseLike {
    let fired = false;
    return { prepare(sql: string) {
        const wrap = (statement: D1PreparedStatement): any => new Proxy(statement, {
            get(target, key) {
                if (key === 'bind') return (...values: unknown[]) => wrap(target.bind(...values));
                if (key === 'run' && sql.includes(pattern)) return async () => {
                    const invoke = !fired;
                    fired = true;
                    if (invoke && !after) await action();
                    const result = await target.run();
                    if (invoke && after) await action();
                    return result;
                };
                const value = Reflect.get(target, key);
                return typeof value === 'function' ? value.bind(target) : value;
            },
        });
        return wrap(env.DB.prepare(sql));
    } };
}

async function pending() {
    const id = `intent-race-${crypto.randomUUID()}`;
    const context = { tenantId: `tenant-${id}`, platform: 'medusa' };
    const store = new D1ExecutionIntentStore(env.DB);
    await store.plan(context, { id, decisionId: id, domain: 'synthetic', connectorType: 'synthetic',
        operation: 'WRITE', targetRef: id, payload: {}, expectedState: {}, idempotencyKey: id,
        plannedAt: '2026-10-16T10:00:00Z' });
    return { id, context, store };
}

async function recoverAndRetry(store: D1ExecutionIntentStore, context: { tenantId: string; platform: string }, id: string) {
    await store.recoverExpiredExecutions(context, { expiredBefore: '2026-10-16T10:01:00Z', recoveredAt: '2026-10-16T10:02:00Z', limit: 10 });
    await store.recordOutcome(context, { intentId: id, nextState: 'FAILED', recordedAt: '2026-10-16T10:02:00Z' });
    await store.claimForExecution(context, id, '2026-10-16T10:03:00Z');
}

it('a completed claim returns its own snapshot even if recovery runs before returning', async () => {
    const { id, context, store } = await pending();
    const claimant = new D1ExecutionIntentStore(interleaveWrite("SET state = 'EXECUTING'", true,
        () => recoverAndRetry(store, context, id)));
    const claim = await claimant.claimForExecution(context, id, '2026-10-16T10:01:00Z');
    expect(claim.outcome).toBe('CLAIMED');
    if (claim.outcome !== 'CLAIMED') throw new Error('claim failed');
    expect(claim.intent.attempt).toBe(1);
    expect((await store.findById(context.tenantId, id))?.attempt).toBe(2);
});

it('outcome SQL cannot overwrite a newer attempt after its earlier validation', async () => {
    const { id, context, store } = await pending();
    await store.claimForExecution(context, id, '2026-10-16T10:01:00Z');
    const claimant = new D1ExecutionIntentStore(interleaveWrite('AND attempt = ?9', false,
        () => recoverAndRetry(store, context, id)));
    await expect(claimant.recordOutcome(context, { intentId: id, expectedAttempt: 1, nextState: 'FAILED',
        recordedAt: '2026-10-16T10:04:00Z' })).rejects.toThrow('Výsledek NEBYL zapsán');
    expect(await store.findById(context.tenantId, id)).toMatchObject({ state: 'EXECUTING', attempt: 2 });
});
