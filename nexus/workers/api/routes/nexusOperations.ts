import { ApiError, jsonResponse } from '../http.js';
import { authenticateMedusaService } from '../medusaServiceAuth.js';
import type { Env } from '../types.js';

const labels: Record<string, string> = {
    PLANNED: 'Čaká na spracovanie', APPROVED: 'Pripravené na spracovanie', EXECUTING: 'Práve sa spracúva',
    EXECUTED: 'Dokončené', FAILED: 'Nepodarilo sa', UNKNOWN: 'Treba overiť výsledok',
    SUPERSEDED: 'Nahradené novšou zmenou', ABANDONED: 'Zrušené', RECEIVED: 'Prijaté, čaká na spracovanie',
    PROCESSING: 'Práve sa spracúva', PROCESSED: 'Spracované', NEEDS_REVIEW: 'Vyžaduje vašu pozornosť',
};

/** Service-only read model. Never returns payloads, expected values, error text or credentials. */
export async function handleNexusOperations(request: Request, env: Env): Promise<Response> {
    const tenantId = authenticateMedusaService(request, env);
    if (request.headers.has('origin')) throw new ApiError('REJECT_SIGNATURE', 403, 'Prehľad je dostupný iba cez administráciu.');
    const query = new URL(request.url).searchParams;
    if (query.has('tenantId') && query.get('tenantId') !== tenantId) throw new ApiError('REJECT_SIGNATURE', 403, 'Nepovolený prístup.');
    const kind = query.get('kind') ?? 'executions';
    const integer = (key: string, fallback: number, min: number, max: number) => {
        const raw = query.get(key) ?? String(fallback);
        const value = Number(raw);
        if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
            throw new ApiError('VALIDATION_ERROR', 400, 'Neplatná stránka prehľadu.');
        }
        return value;
    };
    const limit = integer('limit', 25, 1, 100);
    const offset = integer('offset', 0, 0, 10_000);
    if (!['executions', 'events'].includes(kind) || Array.from(query.keys()).some(key => !['kind', 'limit', 'offset', 'tenantId'].includes(key))) {
        throw new ApiError('VALIDATION_ERROR', 400, 'Neplatný prehľad.');
    }
    const table = kind === 'executions' ? 'execution_intents' : 'medusa_webhook_inbox';
    const fields = kind === 'executions'
        ? 'id, operation AS type, state, attempt, updated_at, confirmation_quality'
        : 'event_id AS id, event_type AS type, processing_state AS state, COALESCE((SELECT i.attempt FROM execution_intents i WHERE i.id = medusa_webhook_inbox.operation_id AND i.tenant_id = medusa_webhook_inbox.tenant_id), 0) AS attempt, COALESCE(processing_updated_at, received_at) AS updated_at, NULL AS confirmation_quality';
    const order = kind === 'executions' ? 'julianday(updated_at) DESC, id' : 'julianday(COALESCE(processing_updated_at, received_at)) DESC, event_id';
    try {
        const result = await env.DB.batch([
            env.DB.prepare(`SELECT count(*) AS count FROM ${table} WHERE tenant_id = ?`).bind(tenantId),
            env.DB.prepare(`SELECT ${fields} FROM ${table} WHERE tenant_id = ? ORDER BY ${order} LIMIT ? OFFSET ?`).bind(tenantId, limit, offset),
        ]);
        const count = Number(result[0]?.results[0]?.count);
        if (!Number.isSafeInteger(count) || count < 0 || !result[1]) throw new Error('INVALID_READ_MODEL');
        const items = result[1].results.map(row => {
            if (typeof row.state !== 'string' || !labels[row.state]) throw new Error('INVALID_READ_MODEL');
            const needsReview = ['UNKNOWN', 'FAILED', 'NEEDS_REVIEW'].includes(row.state) || row.confirmation_quality === 'LOG_INFERRED';
            return { id: row.id, type: row.type, state: row.state, attempt: row.attempt, updatedAt: row.updated_at,
                statusLabel: row.confirmation_quality === 'LOG_INFERRED' ? labels.UNKNOWN : labels[row.state], needsReview };
        });
        const response = jsonResponse({ ok: true, version: 1, tenantId, kind, count, limit, offset, items });
        response.headers.set('cache-control', 'no-store');
        return response;
    } catch {
        throw new ApiError('STORAGE_UNAVAILABLE', 503, 'Prehľad sa teraz nedá načítať.');
    }
}
