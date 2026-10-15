import { D1ExecutionIntentStore } from '../../connectors/d1/D1ExecutionIntentStore.js';
import { log } from './http.js';
import type { Env } from './types.js';

/** One bounded pass. All business times come from the scheduled event. No external writes/retries. */
export async function recoverScheduledIntents(env: Env, scheduledTime: number): Promise<void> {
    if (env.NEXUS_EXECUTION_TIMEOUT_MS === undefined) return;
    const tenantId = env.MEDUSA_PRICING_TENANT_ID;
    const timeout = Number(env.NEXUS_EXECUTION_TIMEOUT_MS);
    try {
        if (!tenantId || !/^[a-z0-9_-]{2,32}$/.test(tenantId) ||
            !/^[0-9]+$/.test(env.NEXUS_EXECUTION_TIMEOUT_MS) || !Number.isSafeInteger(timeout) ||
            timeout < 1000 || timeout > 86_400_000 || !Number.isSafeInteger(scheduledTime) || scheduledTime < timeout) {
            throw new Error('INVALID_EXECUTION_RECOVERY_CONFIG');
        }
        const ids = await new D1ExecutionIntentStore(env.DB).recoverExpiredExecutions(
            { tenantId, platform: 'medusa' },
            { expiredBefore: new Date(scheduledTime - timeout).toISOString(),
                recoveredAt: new Date(scheduledTime).toISOString(), limit: 100 },
        );
        for (const id of ids) log('warn', 'execution.recovered_unknown', {
            opsTenant: tenantId, intent_id: id, reason: 'EXECUTION_DEADLINE_EXCEEDED',
        });
        log('info', 'execution.recovery_completed', { opsTenant: tenantId, recovered: ids.length });
    } catch {
        log('error', 'execution.recovery_failed', { opsTenant: tenantId ?? null });
        throw new Error('EXECUTION_RECOVERY_FAILED');
    }
}
