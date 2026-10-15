import { describe, expect, it } from 'vitest';
import type { ExecutionIntentStore, RecoverExecutionsInput } from '../../core/canonical/outcomes/ExecutionIntentStore.js';

const T0 = '2026-10-16T10:00:00Z';
const T1 = '2026-10-16T10:01:00.000Z';
const T2 = '2026-10-16T10:02:00.000Z';
const T3 = '2026-10-16T10:03:00.000Z';
const recovery = { expiredBefore: T1, recoveredAt: T2, limit: 10 };

export function intentRecoveryContract(name: string, createStore: () => ExecutionIntentStore) {
    describe(name, () => {
        async function setup() {
            const store = createStore();
            const context = { tenantId: `recovery-${crypto.randomUUID()}`, platform: 'medusa' };
            const id = `intent-${crypto.randomUUID()}`;
            const plan = async (intentId = id) => store.plan(context, {
                id: intentId, decisionId: `decision-${intentId}`, domain: 'synthetic', connectorType: 'synthetic',
                operation: 'WRITE', targetRef: 'synthetic-order', payload: {}, expectedState: { written: true },
                idempotencyKey: intentId, plannedAt: T0,
            });
            await plan();
            await store.claimForExecution(context, id, T1);
            return { store, context, id, plan };
        }

        it('leaves active and merely planned work unchanged', async () => {
            const { store, context, id, plan } = await setup();
            const pending = id + '-pending';
            await plan(pending);
            expect(await store.recoverExpiredExecutions(context, { ...recovery, expiredBefore: T0 })).toEqual([]);
            expect((await store.findById(context.tenantId, id))?.state).toBe('EXECUTING');
            expect((await store.findById(context.tenantId, pending))?.state).toBe('PLANNED');
        });

        it('recovers at the exact deadline to UNKNOWN, without blind retry or late completion', async () => {
            const { store, context, id } = await setup();
            expect(await store.recoverExpiredExecutions(context, recovery)).toEqual([id]);
            expect(await store.findById(context.tenantId, id)).toMatchObject({ state: 'UNKNOWN', attempt: 1,
                confirmationQuality: 'UNCONFIRMED', failureReason: 'EXECUTION_DEADLINE_EXCEEDED', updatedAt: T2 });
            expect((await store.findRequiringReconciliation(context.tenantId, 10)).map(i => i.id)).toEqual([id]);
            expect(await store.claimForExecution(context, id, T3)).toEqual({ outcome: 'WRONG_STATE', currentState: 'UNKNOWN' });
            await expect(store.recordOutcome(context, { intentId: id, expectedAttempt: 1, nextState: 'EXECUTED',
                confirmationQuality: 'SYSTEM_CONFIRMED', recordedAt: T3 })).rejects.toThrow('STALE_EXECUTION_ATTEMPT');
        });

        it('concurrent recovery has one winner and replay changes nothing', async () => {
            const { store, context, id } = await setup();
            const recovered = await Promise.all([store.recoverExpiredExecutions(context, recovery), store.recoverExpiredExecutions(context, recovery)]);
            expect(recovered.flat()).toEqual([id]);
            const before = await store.findById(context.tenantId, id);
            expect(await store.recoverExpiredExecutions(context, recovery)).toEqual([]);
            expect(await store.findById(context.tenantId, id)).toEqual(before);
        });

        it('does not recover another tenant’s operation', async () => {
            const { store, context, id } = await setup();
            expect(await store.recoverExpiredExecutions({ ...context, tenantId: 'synthetic-other-tenant' }, recovery)).toEqual([]);
            expect((await store.findById(context.tenantId, id))?.state).toBe('EXECUTING');
        });

        it('fences an old result after reconciliation and a newer attempt', async () => {
            const { store, context, id } = await setup();
            await store.recoverExpiredExecutions(context, recovery);
            await store.recordOutcome(context, { intentId: id, nextState: 'FAILED', recordedAt: T2 });
            const claim = await store.claimForExecution(context, id, T3);
            expect(claim.outcome).toBe('CLAIMED');
            const before = await store.findById(context.tenantId, id);
            await expect(store.recordOutcome(context, { intentId: id, expectedAttempt: 1, nextState: 'FAILED', recordedAt: T3 }))
                .rejects.toThrow('STALE_EXECUTION_ATTEMPT');
            expect(await store.findById(context.tenantId, id)).toEqual(before);
            await store.recordOutcome(context, { intentId: id, expectedAttempt: 2, nextState: 'EXECUTED',
                confirmationQuality: 'SYSTEM_CONFIRMED', recordedAt: T3 });
            expect((await store.findById(context.tenantId, id))?.state).toBe('EXECUTED');
        });

        it('rejects execution results that omit the claimed attempt', async () => {
            const { store, context, id } = await setup();
            await expect(store.recordOutcome(context, { intentId: id, nextState: 'FAILED', recordedAt: T2 }))
                .rejects.toThrow('STALE_EXECUTION_ATTEMPT');
        });

        it('bounds recovery and orders equal claim times by id', async () => {
            const { store, context, id, plan } = await setup();
            const ids = [id, id + '-b', id + '-a'].sort();
            for (const extra of ids.filter(i => i !== id)) {
                await plan(extra);
                await store.claimForExecution(context, extra, T1);
            }
            for (const expected of ids) {
                expect(await store.recoverExpiredExecutions(context, { ...recovery, limit: 1 })).toEqual([expected]);
            }
        });

        it.each<Partial<RecoverExecutionsInput>>([
            { limit: 0 }, { limit: 101 }, { limit: 1.5 }, { expiredBefore: 'invalid' },
            { recoveredAt: 'invalid' }, { expiredBefore: T3 }, { expiredBefore: '2026' },
        ])('rejects malformed recovery input %j without changing state', async (invalid) => {
            const { store, context, id } = await setup();
            const before = await store.findById(context.tenantId, id);
            await expect(store.recoverExpiredExecutions(context, { ...recovery, ...invalid })).rejects.toThrow('INVALID_EXECUTION_RECOVERY_INPUT');
            expect(await store.findById(context.tenantId, id)).toEqual(before);
        });
    });
}
