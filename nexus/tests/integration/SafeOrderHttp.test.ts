import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import worker from '../../workers/api/index.js';
import type { Env } from '../../workers/api/types.js';
import { assertSafeOrderAllows } from '../../../backend/src/api/store/nexus-checkout/safeorder.js';

// A real loopback HTTP connection between the backend adapter and the Worker
// handler in Node. This does not substitute for workerd or Medusa persistence.
let server: Server;
let url: string;
const bindings = { ENVIRONMENT: 'test', HMAC_SECRET: 'synthetic-hmac', MEDUSA_PRICING_API_KEY: 'synthetic-key', MEDUSA_PRICING_TENANT_ID: 'anastasia', DB: { prepare: () => { throw new Error('SafeOrder must not access voucher storage'); } } } as unknown as Env;
const input = { orderSum: 55, paymentMethod: 'pp_stripe_stripe', customerEmail: 'synthetic@example.test' };
const serviceEnv = () => ({ NEXUS_SAFEORDER_URL: url, NEXUS_PRICING_API_KEY: 'synthetic-key', NEXUS_TENANT_ID: 'anastasia' });

beforeAll(async () => {
    server = createServer(async (incoming, outgoing) => {
        try {
            const chunks: Buffer[] = [];
            for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
            const headers = new Headers();
            for (const [name, value] of Object.entries(incoming.headers)) {
                if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(',') : value);
            }
            const request = new Request(`${url}${incoming.url || '/'}`, { method: incoming.method, headers, body: Buffer.concat(chunks) });
            const response = await worker.fetch(request, bindings, { waitUntil: () => {} });
            outgoing.writeHead(response.status, Object.fromEntries(response.headers));
            outgoing.end(await response.text());
        } catch {
            outgoing.writeHead(500); outgoing.end();
        }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing isolated HTTP listener');
    url = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });

describe('SafeOrder backend-to-Worker loopback HTTP contract', () => {
    it('allows the actual adapter with tenant-bound service credentials', async () => {
        await expect(assertSafeOrderAllows(input, { ...serviceEnv(), NEXUS_SAFEORDER_URL: `${url}/api/nexus/safeorder` })).resolves.toMatchObject({ score: 0 });
    });
    it('allows the membership Stripe provider as an online payment', async () => {
        await expect(assertSafeOrderAllows({ ...input, orderSum: 50, paymentMethod: 'pp_membership_stripe_membership' }, { ...serviceEnv(), NEXUS_SAFEORDER_URL: `${url}/api/nexus/safeorder` })).resolves.toMatchObject({ score: 0 });
    });
    it('keeps unknown payment providers unavailable', async () => {
        await expect(assertSafeOrderAllows({ ...input, paymentMethod: 'pp_unknown_provider' }, { ...serviceEnv(), NEXUS_SAFEORDER_URL: `${url}/api/nexus/safeorder` })).rejects.toMatchObject({ code: 'SAFEORDER_UNAVAILABLE' });
    });
    it('rejects a missing/wrong caller credential over HTTP', async () => {
        const response = await fetch(`${url}/api/nexus/safeorder`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
        expect(response.status).toBe(401);
        await expect(assertSafeOrderAllows(input, { ...serviceEnv(), NEXUS_SAFEORDER_URL: `${url}/api/nexus/safeorder`, NEXUS_PRICING_API_KEY: 'wrong' })).rejects.toMatchObject({ code: 'SAFEORDER_UNAVAILABLE' });
    });
    it('rejects tenant switching over HTTP', async () => {
        await expect(assertSafeOrderAllows(input, { ...serviceEnv(), NEXUS_SAFEORDER_URL: `${url}/api/nexus/safeorder`, NEXUS_TENANT_ID: 'other' })).rejects.toMatchObject({ code: 'SAFEORDER_UNAVAILABLE' });
    });
    it('propagates BLOCK from the real risk evaluation', async () => {
        await expect(assertSafeOrderAllows({ ...input, orderSum: 250, paymentMethod: 'cod', customerEmail: 'synthetic@tempmail.com' }, { ...serviceEnv(), NEXUS_SAFEORDER_URL: `${url}/api/nexus/safeorder` })).rejects.toMatchObject({ code: 'SAFEORDER_BLOCKED' });
    });
});
