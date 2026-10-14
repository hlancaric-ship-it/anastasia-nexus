import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { log } from '../../workers/api/http.js';
import { _opsQueueForTests, enqueueOpsEvent, flushOpsEvents } from '../../workers/api/ops-ingest.js';

const SECRET = 'k'.repeat(40);
const URL_ = 'https://backend.test/hooks/ops/edge-events';
const NOW = Date.parse('2026-10-14T12:00:00Z');

type Captured = { url: string; init: RequestInit };
function fakeFetch(status = 202) {
    const calls: Captured[] = [];
    const impl = (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response('{}', { status });
    }) as unknown as typeof fetch;
    return { calls, impl };
}

describe('ops-ingest (Worker -> Medusa ops_event)', () => {
    beforeEach(() => _opsQueueForTests().reset());

    it('do fronty jdou jen warn/error, bez stack/message a vnořených dat', () => {
        log('info', 'http.request', { requestId: 'req_12345678' });
        log('debug', 'x.y', {});
        log('error', 'http.unhandled_error', { requestId: 'req_12345678', path: '/api/x', message: 'tajné a@b.cz', stack: 'at x', nested: { a: 1 }, long: 'z'.repeat(500) });
        const { queue } = _opsQueueForTests();
        expect(queue).toHaveLength(1);
        expect(queue[0]).toMatchObject({ level: 'error', event: 'http.unhandled_error', request_id: 'req_12345678', path: '/api/x' });
        expect(queue[0]).not.toHaveProperty('message');
        expect(queue[0]).not.toHaveProperty('stack');
        expect(queue[0]).not.toHaveProperty('nested');
        expect(String(queue[0].long)).toHaveLength(200);
    });

    it('fronta je omezená a přetečení se nahlásí', async () => {
        for (let i = 0; i < 105; i++) enqueueOpsEvent('warn', 'a.b', new Date(NOW).toISOString(), { i });
        expect(_opsQueueForTests().queue).toHaveLength(100);
        const { calls, impl } = fakeFetch();
        await flushOpsEvents({ OPS_INGEST_URL: URL_, OPS_INGEST_SECRET: SECRET }, impl, NOW);
        const events = JSON.parse(String(calls[0].init.body)).events;
        expect(events).toHaveLength(100);
        expect(events.at(-1)).toMatchObject({ event: 'ops.ingest_dropped', count: 5 });
        expect(_opsQueueForTests().queue).toHaveLength(0);
    });

    it('podepíše dávku stejně, jak ji ověřuje backend', async () => {
        enqueueOpsEvent('warn', 'http.api_error', new Date(NOW).toISOString(), { status: 401 });
        const { calls, impl } = fakeFetch();
        await flushOpsEvents({ OPS_INGEST_URL: URL_, OPS_INGEST_SECRET: SECRET }, impl, NOW);
        expect(calls).toHaveLength(1);
        const headers = calls[0].init.headers as Record<string, string>;
        const ts = headers['x-nexus-timestamp'];
        expect(ts).toBe(String(NOW / 1000));
        const expected = createHmac('sha256', SECRET).update(`${ts}.${String(calls[0].init.body)}`).digest('hex');
        expect(headers['x-nexus-signature']).toBe(expected);
    });

    it('bez konfigurace nic neposílá a frontu zahodí; chyba sítě nevyhodí', async () => {
        enqueueOpsEvent('error', 'a.b', new Date(NOW).toISOString(), {});
        const { calls, impl } = fakeFetch();
        await flushOpsEvents({ OPS_INGEST_SECRET: SECRET }, impl, NOW);
        await flushOpsEvents({ OPS_INGEST_URL: URL_, OPS_INGEST_SECRET: 'short' }, impl, NOW);
        expect(calls).toHaveLength(0);
        expect(_opsQueueForTests().queue).toHaveLength(0);

        enqueueOpsEvent('error', 'a.b', new Date(NOW).toISOString(), {});
        const failing = (async () => { throw new TypeError('network'); }) as unknown as typeof fetch;
        await expect(flushOpsEvents({ OPS_INGEST_URL: URL_, OPS_INGEST_SECRET: SECRET }, failing, NOW)).resolves.toBeUndefined();
        expect(_opsQueueForTests().queue).toHaveLength(0);
    });
});
