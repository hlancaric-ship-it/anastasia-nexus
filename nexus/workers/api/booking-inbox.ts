import { D1ExecutionIntentStore } from '../../connectors/d1/D1ExecutionIntentStore.js';
import type { ExecutionIntent } from '../../core/canonical/outcomes/ExecutionIntent.js';
import { log } from './http.js';
import type { Env } from './types.js';

const OPERATION = 'SYNC_ORDER_BOOKING';
const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
const ID = /^[A-Za-z0-9_-]{1,128}$/;
type Row = { event_type: string; event_id: string; target_id: string; operation_id: string | null; received_at: string };
// Objednávka chybí v Medusě i po této době: opakování nic nevyřeší, patří operátorovi.
const MISSING_ORDER_REVIEW_MS = 15 * 60_000;
type Receipt = { synchronized: boolean; result: string };

export async function bookingOperationId(tenantId: string, eventId: string, targetId: string) {
    return 'bksync_' + hex(await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify([1, tenantId, eventId, targetId]))));
}

function configuration(env: Env) {
    if (!env.MEDUSA_BOOKING_SYNC_URL) return null;
    let url: URL;
    try { url = new URL(env.MEDUSA_BOOKING_SYNC_URL); }
    catch { throw new Error('BOOKING_INBOX_CONFIGURATION_INVALID'); }
    const tenantId = env.MEDUSA_PRICING_TENANT_ID;
    const secret = env.MEDUSA_BOOKING_SYNC_SECRET;
    if (!tenantId || !/^[a-z0-9_-]{2,32}$/.test(tenantId) || !secret || secret.length < 32 ||
        url.username || url.password || url.search || url.hash ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
        throw new Error('BOOKING_INBOX_CONFIGURATION_INVALID');
    }
    return { url, tenantId, secret };
}

async function requestState(config: NonNullable<ReturnType<typeof configuration>>, row: Row, operationId: string,
    mode: 'inspect' | 'synchronize', fetchImpl: typeof fetch): Promise<Receipt> {
    const source = row.event_type === 'payment.captured'
        ? { version: 2, eventType: row.event_type, targetId: row.target_id }
        : { version: 1, orderId: row.target_id };
    const body = JSON.stringify({ ...source, tenantId: config.tenantId, operationId, mode });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const key = await crypto.subtle.importKey('raw', encoder.encode(config.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = hex(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${body}`)));
    // Workers nepodporují redirect 'error' (TypeError); 'manual' vrátí 3xx jako !ok a to selže níž.
    const response = await fetchImpl(config.url, { method: 'POST', body, redirect: 'manual', signal: AbortSignal.timeout(3000),
        headers: { 'content-type': 'application/json', 'x-nexus-timestamp': timestamp, 'x-nexus-signature': signature } });
    if (response.status === 404) {
        // Jen 404 z booking route (její vlastní tělo), ne neznámá cesta nebo cizí server.
        const missing = await response.text().then(text => text.length <= 256 && JSON.parse(text)?.error === 'BOOKING_SYNC_UNVERIFIED').catch(() => false);
        throw new Error(missing ? 'BOOKING_ORDER_NOT_FOUND' : 'BOOKING_SOURCE_UNVERIFIED');
    }
    if (!response.ok) { await response.body?.cancel().catch(() => {}); throw new Error('BOOKING_SOURCE_UNVERIFIED'); }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('BOOKING_SOURCE_UNVERIFIED');
    let size = 0;
    let raw = '';
    const decoder = new TextDecoder();
    try {
        for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > 4096) { await reader.cancel(); throw new Error('BOOKING_SOURCE_UNVERIFIED'); }
            raw += decoder.decode(chunk.value, { stream: true });
        }
        raw += decoder.decode();
    } finally { reader.releaseLock(); }
    const value = JSON.parse(raw) as Record<string, unknown>;
    const sourceMatches = source.version === 2
        ? value?.eventType === row.event_type && value.targetId === row.target_id && typeof value.orderId === 'string' && ID.test(value.orderId)
        : value?.orderId === row.target_id;
    if (value?.ok !== true || value.version !== source.version || value.tenantId !== config.tenantId || !sourceMatches ||
        value.operationId !== operationId || typeof value.synchronized !== 'boolean' ||
        !['NO_BOOKING', 'HELD', 'CONFIRMED', 'CANCELED', 'MISMATCH'].includes(String(value.result)) ||
        value.synchronized !== (value.result !== 'MISMATCH')) throw new Error('BOOKING_SOURCE_UNVERIFIED');
    if (row.event_type === 'order.canceled' && value.synchronized && !['CANCELED', 'NO_BOOKING'].includes(String(value.result))) {
        throw new Error('BOOKING_CANCELLATION_UNVERIFIED');
    }
    return { synchronized: value.synchronized, result: String(value.result) };
}

/** One bounded pass: two events, at most four 3-second HTTP requests. Uncertain writes are retried only because the Medusa route is idempotent and every write is verified by inspect. */
export async function consumeBookingInbox(env: Env, scheduledTime: number, fetchImpl: typeof fetch = fetch): Promise<void> {
    const config = configuration(env);
    if (!config) return;
    if (!Number.isSafeInteger(scheduledTime) || scheduledTime < 0 || !Number.isFinite(new Date(scheduledTime).getTime())) throw new Error('INVALID_BOOKING_RUN_TIME');
    const at = new Date(scheduledTime).toISOString();
    const context = { tenantId: config.tenantId, platform: 'medusa' as const };
    const store = new D1ExecutionIntentStore(env.DB);
    // Nové události mají přednost: neřešitelné UNKNOWN řádky se jinak točí dokola a blokují čerstvé rezervace.
    const rows = await env.DB.prepare(`SELECT event_type, event_id, target_id, operation_id, received_at FROM medusa_webhook_inbox
        WHERE tenant_id = ? AND event_type IN ('order.placed', 'order.canceled', 'payment.captured') AND processing_state IN ('RECEIVED', 'PROCESSING')
        AND julianday(received_at) <= julianday(?)
        ORDER BY CASE processing_state WHEN 'RECEIVED' THEN 0 ELSE 1 END, julianday(COALESCE(processing_updated_at, received_at)), event_id LIMIT 2`).bind(config.tenantId, at).all<Row>();
    for (const row of rows.results) {
        try {
            if (!ID.test(row.event_id) || !ID.test(row.target_id)) throw new Error('INVALID_BOOKING_EVENT');
            const id = await bookingOperationId(config.tenantId, row.event_id, row.target_id);
            if (row.operation_id && row.operation_id !== id) throw new Error('BOOKING_OPERATION_CONFLICT');
            const plannedPayload = row.event_type === 'order.placed' ? { eventId: row.event_id, orderId: row.target_id }
                : { eventId: row.event_id, eventType: row.event_type, targetId: row.target_id };
            const { intent: planned } = await store.plan(context, { id, decisionId: row.event_id, domain: 'booking', connectorType: 'medusa',
                operation: OPERATION, targetRef: row.target_id, payload: plannedPayload,
                expectedState: { synchronized: true }, idempotencyKey: id, plannedAt: at });
            const payloadMatches = JSON.stringify(planned.payload) === JSON.stringify(plannedPayload);
            if (planned.id !== id || planned.domain !== 'booking' || planned.connectorType !== 'medusa' || planned.operation !== OPERATION ||
                planned.targetRef !== row.target_id || !payloadMatches ||
                JSON.stringify(planned.expectedState) !== JSON.stringify({ synchronized: true })) throw new Error('BOOKING_OPERATION_CONFLICT');
            const updated = await env.DB.prepare(`UPDATE medusa_webhook_inbox SET processing_state = 'PROCESSING', operation_id = ?, processing_updated_at = ?
                WHERE tenant_id = ? AND event_id = ? AND processing_state IN ('RECEIVED', 'PROCESSING') AND (operation_id IS NULL OR operation_id = ?)`)
                .bind(id, at, config.tenantId, row.event_id, id).run();
            if (updated.meta.changes !== 1) continue;
            let intent: ExecutionIntent = planned;
            if (intent.state === 'EXECUTING' && Date.parse(intent.updatedAt) + 90_000 <= scheduledTime) {
                await store.recordOutcome(context, { intentId: id, expectedAttempt: intent.attempt, nextState: 'UNKNOWN',
                    failureReason: 'BOOKING_EXECUTION_DEADLINE_EXCEEDED', recordedAt: at });
                intent = (await store.findById(config.tenantId, id))!;
            }
            if (intent.state === 'UNKNOWN') {
                let actual: Receipt;
                try {
                    // Medusa route je idempotentní (inspect-before-write), opakovaný zápis je bezpečný; výsledek rozhoduje až inspect.
                    await requestState(config, row, id, 'synchronize', fetchImpl);
                    actual = await requestState(config, row, id, 'inspect', fetchImpl);
                } catch (error) {
                    if (!(error instanceof Error && error.message === 'BOOKING_ORDER_NOT_FOUND' &&
                        Date.parse(row.received_at) + MISSING_ORDER_REVIEW_MS <= scheduledTime)) throw error;
                    actual = { synchronized: false, result: 'MISSING_ORDER' };
                }
                if (actual.synchronized) {
                    await store.recordReconciliation(context, { intentId: id, expectedState: intent.state, expectedAttempt: intent.attempt,
                        expectedUpdatedAt: intent.updatedAt, outcome: 'CONFIRMED', recordedAt: at });
                } else {
                    await env.DB.prepare(`UPDATE medusa_webhook_inbox SET processing_state = 'NEEDS_REVIEW'
                        WHERE tenant_id = ? AND event_id = ? AND operation_id = ? AND processing_state = 'PROCESSING'`).bind(config.tenantId, row.event_id, id).run();
                    log('warn', 'booking.inbox_needs_review', { opsTenant: config.tenantId, intent_id: id });
                }
            } else if (intent.state === 'PLANNED') {
                const claim = await store.claimForExecution(context, id, at);
                if (claim.outcome === 'CLAIMED') {
                    let verified = false;
                    try {
                        await requestState(config, row, id, 'synchronize', fetchImpl);
                        verified = (await requestState(config, row, id, 'inspect', fetchImpl)).synchronized;
                    } catch { /* Unknown remote state is persisted below, without raw provider errors. */ }
                    await store.recordOutcome(context, { intentId: id, expectedAttempt: claim.intent.attempt,
                        nextState: verified ? 'EXECUTED' : 'UNKNOWN', recordedAt: at,
                        ...(verified ? { confirmationQuality: 'SYSTEM_CONFIRMED' as const, executionReference: id } : { failureReason: 'BOOKING_SOURCE_UNVERIFIED' }) });
                }
            }
            const current = await store.findById(config.tenantId, id);
            if (current?.state === 'EXECUTED' && current.confirmationQuality === 'SYSTEM_CONFIRMED') {
                await env.DB.prepare(`UPDATE medusa_webhook_inbox SET processing_state = 'PROCESSED', processing_updated_at = ?
                    WHERE tenant_id = ? AND event_id = ? AND operation_id = ? AND processing_state IN ('RECEIVED', 'PROCESSING')`)
                    .bind(at, config.tenantId, row.event_id, id).run();
                log('info', 'booking.inbox_processed', { opsTenant: config.tenantId, intent_id: id });
            }
        } catch {
            log('error', 'booking.inbox_processing_failed', { opsTenant: config.tenantId, event_id: row.event_id });
        }
    }
}
