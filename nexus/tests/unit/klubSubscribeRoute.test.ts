import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleKlubSubscribe } from '../../workers/api/routes/klubSubscribe.js';
import type { Env } from '../../workers/api/types.js';

describe('retired standalone subscription route', () => {
    afterEach(() => vi.unstubAllGlobals());
    it.each([
        ['legacy valid request', JSON.stringify({ email: 'synthetic@example.test', planId: 'anastasia-premium', paymentMethodId: 'pm_synthetic' })],
        ['malformed JSON', '{'],
        ['empty request', ''],
        ['arbitrary plan or injected amount', JSON.stringify({ planId: 'other', amount: 1, tenantId: 'other' })],
    ])('never contacts Stripe or accepts a payment: %s', async (_label, body) => {
        const fetchSpy = vi.fn(() => { throw new Error('External payment call forbidden'); });
        vi.stubGlobal('fetch', fetchSpy);
        const request = new Request('https://nexus-api.internal/api/klub/subscribe', { method: 'POST', body });
        const response = await handleKlubSubscribe(request, { STRIPE_SECRET_KEY: 'synthetic-key-must-not-be-used' } as unknown as Env);
        expect(response.status).toBe(410);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(await response.json()).toEqual({
            ok: false, error: 'LEGACY_SUBSCRIPTION_RETIRED',
            message: expect.any(String),
        });
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(request.bodyUsed).toBe(false);
    });
    it('does not depend on the presence of a Stripe key', async () => {
        const response = await handleKlubSubscribe(new Request('https://nexus-api.internal/api/klub/subscribe'), {} as Env);
        expect(response.status).toBe(410);
        expect(JSON.stringify(await response.json())).not.toContain('clientSecret');
    });
});
