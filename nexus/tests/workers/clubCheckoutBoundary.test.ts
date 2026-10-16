import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../../workers/api/index.js';
import type { Env } from '../../workers/api/types.js';

const bindings = { DB: env.DB, HMAC_SECRET: 'synthetic-hmac', ENVIRONMENT: 'test', STRIPE_SECRET_KEY: 'synthetic-unused-key' } as unknown as Env;
const ctx = { waitUntil: (_promise: Promise<unknown>) => {} };
describe('single checkout boundary in actual workerd', () => {
    afterEach(() => vi.restoreAllMocks());
    it.each(['/api/klub/subscribe', '/api/klub/subscribe/'])('retires %s without external payment calls', async path => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('External payment forbidden'));
        const response = await worker.fetch(new Request('https://nexus.test' + path, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'synthetic@example.test', planId: 'anastasia-premium' }),
        }), bindings, ctx);
        expect(response.status).toBe(410);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(await response.json()).toMatchObject({ ok: false, error: 'LEGACY_SUBSCRIPTION_RETIRED' });
        expect(fetchSpy).not.toHaveBeenCalled();
    });
    it('retains method enforcement and never charges on GET', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('External payment forbidden'));
        const response = await worker.fetch(new Request('https://nexus.test/api/klub/subscribe'), bindings, ctx);
        expect(response.status).toBe(405);
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
