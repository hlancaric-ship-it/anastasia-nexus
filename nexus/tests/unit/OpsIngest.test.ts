import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { log } from '../../workers/api/http.js';
import { _opsQueueForTests, enqueueOpsEvent, flushOpsEvents, resolveIngestUrl } from '../../workers/api/ops-ingest.js';

const SECRET = 'k'.repeat(40);
const URL_ = 'https://backend.test/hooks/ops/edge-events';
const NOW = Date.parse('2026-10-14T12:00:00Z');
const TS = new Date(NOW).toISOString();
const ENV = { OPS_INGEST_URL: URL_, OPS_INGEST_SECRET: SECRET, OPS_INGEST_TENANT_ID: 'anastasia' };

type Captured = { url: string; init: RequestInit };
function fakeFetch(status = 202) {
    const calls: Captured[] = [];
    const impl = (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response('{}', { status });
    }) as unknown as typeof fetch;
    return { calls, impl };
}
const sentEvents = (calls: Captured[]) => JSON.parse(String(calls[0]!.init.body)).events as Record<string, unknown>[];

describe('ops-ingest (Worker -> Medusa ops_event)', () => {
    beforeEach(() => _opsQueueForTests().reset());

    it('do fronty jdou jen warn/error se serverovým opsTenant, bez stack/message a vnořených dat', () => {
        log('info', 'http.request', { requestId: 'req_12345678', opsTenant: 'anastasia' });
        log('error', 'voucher.x', { tenantId: 'anastasia' }); // tenant ze vstupu se nebere
        log('error', 'http.unhandled_error', { requestId: 'req_12345678', opsTenant: 'anastasia', path: '/api/x', message: 'tajné a@b.cz', stack: 'at x', nested: { a: 1 }, long: 'z'.repeat(500) });
        const { queue } = _opsQueueForTests();
        expect(queue).toHaveLength(1);
        expect(queue[0]).toMatchObject({ level: 'error', event: 'http.unhandled_error', request_id: 'req_12345678', tenant_id: 'anastasia', path: '/api/x' });
        for (const key of ['message', 'stack', 'nested', 'opsTenant']) expect(queue[0]).not.toHaveProperty(key);
        expect(String(queue[0]!.long)).toHaveLength(200);
    });

    it('cizí tenant se nikdy neodešle', async () => {
        enqueueOpsEvent('error', 'a.b', TS, { opsTenant: 'okfish' });
        const { calls, impl } = fakeFetch();
        await flushOpsEvents(ENV, impl, NOW);
        expect(calls).toHaveLength(0);
        enqueueOpsEvent('error', 'a.b', TS, { opsTenant: 'okfish' });
        enqueueOpsEvent('warn', 'c.d', TS, { opsTenant: 'anastasia' });
        await flushOpsEvents(ENV, impl, NOW);
        expect(JSON.parse(String(calls[0]!.init.body)).tenant_id).toBe('anastasia');
        expect(sentEvents(calls).map((e) => e.event)).toEqual(['c.d']);
    });

    it('fronta je omezená a přetečení se nahlásí', async () => {
        for (let i = 0; i < 105; i++) enqueueOpsEvent('warn', 'a.b', TS, { i, opsTenant: 'anastasia' });
        expect(_opsQueueForTests().queue).toHaveLength(100);
        const { calls, impl } = fakeFetch();
        await flushOpsEvents(ENV, impl, NOW);
        const events = sentEvents(calls);
        expect(events).toHaveLength(100);
        expect(events.at(-1)).toMatchObject({ event: 'ops.ingest_dropped', count: 5 });
        expect(_opsQueueForTests().queue).toHaveLength(0);
    });

    it('podepíše dávku stejně, jak ji ověřuje backend, a nenásleduje přesměrování', async () => {
        enqueueOpsEvent('warn', 'http.api_error', TS, { status: 401, opsTenant: 'anastasia' });
        const { calls, impl } = fakeFetch();
        await flushOpsEvents(ENV, impl, NOW);
        expect(calls).toHaveLength(1);
        expect(calls[0]!.init.redirect).toBe('error');
        const headers = calls[0]!.init.headers as Record<string, string>;
        const ts = headers['x-nexus-timestamp'];
        expect(ts).toBe(String(NOW / 1000));
        const expected = createHmac('sha256', SECRET).update(`${ts}.${String(calls[0]!.init.body)}`).digest('hex');
        expect(headers['x-nexus-signature']).toBe(expected);
    });

    it('URL jen https, http jen localhost, bez přihlašovacích údajů', () => {
        expect(resolveIngestUrl('https://api.example.com/hooks/ops/edge-events')).not.toBeNull();
        expect(resolveIngestUrl('http://localhost:9000/hooks/ops/edge-events')).not.toBeNull();
        expect(resolveIngestUrl('http://127.0.0.1:9000/x')).not.toBeNull();
        expect(resolveIngestUrl('http://api.example.com/x')).toBeNull();
        expect(resolveIngestUrl('https://u:p@api.example.com/x')).toBeNull();
        expect(resolveIngestUrl('ftp://api.example.com/x')).toBeNull();
        expect(resolveIngestUrl('nonsense')).toBeNull();
    });

    it('bez úplné konfigurace nic neposílá a frontu zahodí; chyba sítě nevyhodí', async () => {
        const { calls, impl } = fakeFetch();
        for (const env of [
            { ...ENV, OPS_INGEST_URL: undefined },
            { ...ENV, OPS_INGEST_SECRET: 'short' },
            { ...ENV, OPS_INGEST_TENANT_ID: undefined },
            { ...ENV, OPS_INGEST_URL: 'http://backend.example.com/x' },
        ]) {
            enqueueOpsEvent('error', 'a.b', TS, { opsTenant: 'anastasia' });
            await flushOpsEvents(env, impl, NOW);
            expect(_opsQueueForTests().queue).toHaveLength(0);
        }
        expect(calls).toHaveLength(0);

        enqueueOpsEvent('error', 'a.b', TS, { opsTenant: 'anastasia' });
        const failing = (async () => { throw new TypeError('network'); }) as unknown as typeof fetch;
        await expect(flushOpsEvents(ENV, failing, NOW)).resolves.toBeUndefined();
        expect(_opsQueueForTests().queue).toHaveLength(0);
    });
});
