import type { TenantContext } from '../../tenant/types.js';
import { assertTenantContext } from '../../tenant/types.js';
import type { ExecutionIntent } from './ExecutionIntent.js';
import type { ExecutionIntentStore } from './ExecutionIntentStore.js';
import { reconcileIntent, type ActualStateReader, type StateComparator } from './IntentReconciliation.js';

/** Registered by trusted server code for an exact domain/connector/operation. Never from a request. */
export interface StoredReconciliationHandler {
    readonly domain: string;
    readonly connectorType: string;
    readonly operation: string;
    readonly readActual: (intent: ExecutionIntent, signal: AbortSignal) => ReturnType<ActualStateReader<unknown>>;
    readonly matches: StateComparator<unknown, unknown>;
    /** Matching the old value does not prove a timed-out remote write has stopped. Default denies retry. */
    readonly canConfirmNotExecuted?: (intent: ExecutionIntent) => boolean;
    readonly stateBeforeWrite?: (intent: ExecutionIntent) => unknown;
}

export interface StoredReconciliationInput {
    readonly recordedAt: string;
    readonly limit: number;
    readonly readTimeoutMs: number;
}

const handlerKey = (entry: Pick<ExecutionIntent, 'domain' | 'connectorType' | 'operation'>) =>
    JSON.stringify([entry.domain, entry.connectorType, entry.operation]);

async function boundedRead(handler: StoredReconciliationHandler, intent: ExecutionIntent, timeoutMs: number) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            Promise.resolve().then(() => handler.readActual(intent, controller.signal)),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => { controller.abort(); reject(new Error('RECONCILIATION_READ_TIMEOUT')); }, timeoutMs);
            }),
        ]);
    } finally { clearTimeout(timer); }
}

/** Reads and persists one bounded queue batch. It never performs or retries a business write. */
export async function reconcileStoredIntents(
    store: ExecutionIntentStore,
    context: TenantContext,
    handlers: readonly StoredReconciliationHandler[],
    input: StoredReconciliationInput,
) {
    assertTenantContext(context, 'reconcileStoredIntents');
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100 ||
        !Number.isSafeInteger(input.readTimeoutMs) || input.readTimeoutMs < 1 || input.readTimeoutMs > 30_000 || input.limit * input.readTimeoutMs > 30_000 ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(input.recordedAt) || !Number.isFinite(Date.parse(input.recordedAt))) {
        throw new Error('INVALID_RECONCILIATION_INPUT');
    }
    const registry = new Map(handlers.map(handler => [handlerKey(handler), handler]));
    if (registry.size !== handlers.length) throw new Error('AMBIGUOUS_RECONCILIATION_HANDLER');
    const intents = await store.findRequiringReconciliation(context.tenantId, input.limit);
    const results: Array<{ intentId: string; outcome: string; needsReview: boolean }> = [];
    for (const intent of intents) {
        const handler = registry.get(handlerKey(intent));
        if (!handler || intent.tenantId !== context.tenantId) {
            results.push({ intentId: intent.id, outcome: 'UNSUPPORTED_INTENT', needsReview: true });
            continue;
        }
        try {
            const result = await reconcileIntent(intent,
                entry => boundedRead(handler, entry, input.readTimeoutMs), handler.matches,
                handler.stateBeforeWrite?.(intent));
            if (result.verdict === 'CONFIRMED' || (result.verdict === 'NOT_EXECUTED' && intent.state === 'UNKNOWN' && handler.canConfirmNotExecuted?.(intent) === true)) {
                await store.recordReconciliation(context, {
                    intentId: intent.id, expectedState: intent.state, expectedAttempt: intent.attempt,
                    expectedUpdatedAt: intent.updatedAt, outcome: result.verdict, recordedAt: input.recordedAt,
                });
                results.push({ intentId: intent.id, outcome: result.verdict, needsReview: false });
            } else {
                results.push({ intentId: intent.id, outcome: result.verdict,
                    needsReview: result.needsManualReview || result.verdict === 'NOT_EXECUTED' });
            }
        } catch {
            // Isolate comparator/read-back/persistence faults. Do not expose connector errors or payloads.
            results.push({ intentId: intent.id, outcome: 'RECONCILIATION_DEFERRED', needsReview: true });
        }
    }
    return { processed: results.length, needsReview: results.filter(result => result.needsReview).length, results };
}
