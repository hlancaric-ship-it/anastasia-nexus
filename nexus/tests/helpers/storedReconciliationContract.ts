import { describe, expect, it } from 'vitest';
import type { ExecutionIntentStore } from '../../core/canonical/outcomes/ExecutionIntentStore.js';
import { reconcileStoredIntents, type StoredReconciliationHandler } from '../../core/canonical/outcomes/StoredIntentReconciliation.js';

const T0 = '2026-10-16T12:00:00.000Z';
const T1 = '2026-10-16T12:01:00.000Z';
const T2 = '2026-10-16T12:02:00.000Z';
const input = { recordedAt: T2, limit: 10, readTimeoutMs: 1000 };
const policy: StoredReconciliationHandler = {
    domain: 'synthetic', connectorType: 'synthetic', operation: 'WRITE',
    readActual: async () => ({ found: true, state: 2 }), matches: (expected, actual) => expected === actual,
    stateBeforeWrite: () => 1,
};

export function storedReconciliationContract(name: string, createStore: () => ExecutionIntentStore) {
    describe(name, () => {
        async function setup() {
            const store = createStore();
            const context = { tenantId: `reconcile-${crypto.randomUUID()}`, platform: 'medusa' };
            const seed = async (inferred = false) => {
                const id = `intent-${crypto.randomUUID()}`;
                await store.plan(context, { id, decisionId: id, domain: policy.domain, connectorType: policy.connectorType,
                    operation: policy.operation, targetRef: id, payload: { private: 'synthetic-private@example.test' },
                    expectedState: 2, idempotencyKey: id, plannedAt: T0 });
                await store.claimForExecution(context, id, T0);
                await store.recordOutcome(context, { intentId: id, expectedAttempt: 1,
                    nextState: inferred ? 'EXECUTED' : 'UNKNOWN',
                    ...(inferred ? { confirmationQuality: 'LOG_INFERRED' as const } : {}), recordedAt: T1 });
                return (await store.findById(context.tenantId, id))!;
            };
            const intent = await seed();
            return { store, context, seed, intent };
        }

        it('persists authoritative confirmation and replay does not read it again', async () => {
            const { store, context, intent } = await setup();
            const result = await reconcileStoredIntents(store, context, [policy], input);
            expect(result.results).toEqual([{ intentId: intent.id, outcome: 'CONFIRMED', needsReview: false }]);
            expect(await store.findById(context.tenantId, intent.id)).toMatchObject({ state: 'EXECUTED', confirmationQuality: 'SYSTEM_CONFIRMED' });
            expect((await reconcileStoredIntents(store, context, [policy], input)).processed).toBe(0);
        });

        it('upgrades an inferred success without reopening the terminal operation', async () => {
            const { store, context, seed } = await setup();
            const inferred = await seed(true);
            await reconcileStoredIntents(store, context, [policy], input);
            expect(await store.findById(context.tenantId, inferred.id)).toMatchObject({ state: 'EXECUTED', confirmationQuality: 'SYSTEM_CONFIRMED', attempt: 1 });
        });

        it('an old value alone never authorizes a retry', async () => {
            const { store, context, intent } = await setup();
            const result = await reconcileStoredIntents(store, context, [{ ...policy, readActual: async () => ({ found: true, state: 1 }) }], input);
            expect(result.needsReview).toBe(1);
            expect((await store.findById(context.tenantId, intent.id))?.state).toBe('UNKNOWN');
        });

        it('a trusted domain proof may mark UNKNOWN as known not executed, without retrying', async () => {
            const { store, context, intent } = await setup();
            await reconcileStoredIntents(store, context, [{ ...policy, canConfirmNotExecuted: () => true,
                readActual: async () => ({ found: true, state: 1 }) }], input);
            expect(await store.findById(context.tenantId, intent.id)).toMatchObject({ state: 'FAILED', attempt: 1, failureReason: 'RECONCILIATION_NOT_EXECUTED' });
        });

        it.each(['DIVERGED', 'TARGET_MISSING'] as const)('%s leaves the intent for review', async (verdict) => {
            const { store, context, intent } = await setup();
            const readActual = async () => verdict === 'TARGET_MISSING' ? { found: false as const } : { found: true as const, state: 99 };
            const result = await reconcileStoredIntents(store, context, [{ ...policy, readActual }], input);
            expect(result.results[0]).toMatchObject({ outcome: verdict, needsReview: true });
            expect((await store.findById(context.tenantId, intent.id))?.state).toBe('UNKNOWN');
        });

        it('unsupported operations do not call a connector', async () => {
            const { store, context } = await setup();
            let calls = 0;
            const result = await reconcileStoredIntents(store, context, [{ ...policy, operation: 'OTHER', readActual: async () => { calls++; return { found: false }; } }], input);
            expect(calls).toBe(0);
            expect(result.results[0]?.outcome).toBe('UNSUPPORTED_INTENT');
        });

        it('a never-returning read times out and does not reveal private data', async () => {
            const { store, context, intent } = await setup();
            let aborted = false;
            const result = await reconcileStoredIntents(store, context, [{ ...policy, readActual: (_intent, signal) => new Promise((_resolve, reject) => {
                signal.addEventListener('abort', () => { aborted = true; reject(new Error('synthetic-private@example.test')); });
            }) }], { ...input, readTimeoutMs: 10 });
            expect(aborted).toBe(true);
            expect(result.results[0]?.outcome).toBe('UNVERIFIABLE');
            expect(JSON.stringify(result)).not.toContain('synthetic-private');
            expect((await store.findById(context.tenantId, intent.id))?.state).toBe('UNKNOWN');
        });

        it('a comparator error is isolated from other operations', async () => {
            const { store, context, seed, intent } = await setup();
            const other = await seed();
            const result = await reconcileStoredIntents(store, context, [{ ...policy,
                readActual: async entry => ({ found: true, state: entry.id === intent.id ? 'throw' : 2 }),
                matches: (expected, actual) => { if (actual === 'throw') throw new Error('private'); return expected === actual; },
            }], input);
            expect(result.results.find(row => row.intentId === intent.id)?.outcome).toBe('RECONCILIATION_DEFERRED');
            expect((await store.findById(context.tenantId, other.id))?.state).toBe('EXECUTED');
        });

        it('does not persist a read of an older attempt over a newer UNKNOWN attempt', async () => {
            const { store, context, intent } = await setup();
            const result = await reconcileStoredIntents(store, context, [{ ...policy, readActual: async () => {
                await store.recordReconciliation(context, { intentId: intent.id, expectedState: intent.state,
                    expectedAttempt: 1, expectedUpdatedAt: intent.updatedAt, outcome: 'NOT_EXECUTED', recordedAt: T2 });
                await store.claimForExecution(context, intent.id, T2);
                await store.recordOutcome(context, { intentId: intent.id, expectedAttempt: 2, nextState: 'UNKNOWN', recordedAt: T2 });
                return { found: true, state: 2 };
            } }], input);
            expect(result.results[0]?.outcome).toBe('RECONCILIATION_DEFERRED');
            expect(await store.findById(context.tenantId, intent.id)).toMatchObject({ state: 'UNKNOWN', attempt: 2 });
        });

        it('a batch limit selects equal-time operations in deterministic id order', async () => {
            const { store, context, seed, intent } = await setup();
            const other = await seed();
            const first = [intent.id, other.id].sort()[0];
            const result = await reconcileStoredIntents(store, context, [policy], { ...input, limit: 1 });
            expect(result.processed).toBe(1);
            expect(result.results[0]?.intentId).toBe(first);
        });

        it.each([T0, 'invalid', '2026-10-16T12:02:00+00:00'])('rejects an invalid or regressing result time %s', async (recordedAt) => {
            const { store, context, intent } = await setup();
            await expect(store.recordReconciliation(context, { intentId: intent.id, expectedState: intent.state,
                expectedAttempt: 1, expectedUpdatedAt: intent.updatedAt, outcome: 'CONFIRMED', recordedAt }))
                .rejects.toThrow('INVALID_RECONCILIATION_TIME');
            expect((await store.findById(context.tenantId, intent.id))?.state).toBe('UNKNOWN');
        });

        it('another tenant cannot reconcile or see this queue', async () => {
            const { store, context, intent } = await setup();
            const foreign = { ...context, tenantId: 'synthetic-foreign' };
            expect((await reconcileStoredIntents(store, foreign, [policy], input)).processed).toBe(0);
            await expect(store.recordReconciliation(foreign, { intentId: intent.id, expectedState: intent.state,
                expectedAttempt: 1, expectedUpdatedAt: intent.updatedAt, outcome: 'CONFIRMED', recordedAt: T2 })).rejects.toThrow('INTENT_NOT_FOUND');
        });

        it('duplicate policy and excessive run budget are rejected before reading', async () => {
            const { store, context } = await setup();
            await expect(reconcileStoredIntents(store, context, [policy, policy], input)).rejects.toThrow('AMBIGUOUS_RECONCILIATION_HANDLER');
            await expect(reconcileStoredIntents(store, context, [policy], { ...input, readTimeoutMs: 30_000 })).rejects.toThrow('INVALID_RECONCILIATION_INPUT');
        });

        it('never reopens an inferred terminal operation on a not-executed result', async () => {
            const { store, context, seed } = await setup();
            const inferred = await seed(true);
            const result = await reconcileStoredIntents(store, context, [{ ...policy, canConfirmNotExecuted: () => true,
                readActual: async () => ({ found: true, state: 1 }) }], input);
            expect(result.results.find(row => row.intentId === inferred.id)?.needsReview).toBe(true);
            expect((await store.findById(context.tenantId, inferred.id))?.state).toBe('EXECUTED');
        });
    });
}
