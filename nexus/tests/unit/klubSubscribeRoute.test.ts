import { describe, it, expect } from 'vitest';
import { handleKlubSubscribe } from '../../workers/api/routes/klubSubscribe.js';
import type { Env } from '../../workers/api/types.js';

describe('handleKlubSubscribe Route Handler', () => {
    it('vracia 503 ak nie je nakonfigurovaný STRIPE_SECRET_KEY', async () => {
        const req = new Request('https://nexus-api.internal/api/klub/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'test@example.com',
                planId: 'anastasia-premium',
            }),
        });

        const res = await handleKlubSubscribe(req, {} as Env);
        expect(res.status).toBe(503);
        const data = await res.json() as { ok: boolean; error: string };
        expect(data.ok).toBe(false);
        expect(data.error).toContain('Stripe not configured');
    });

    it('vracia 422 ak chýba email alebo planId', async () => {
        const req = new Request('https://nexus-api.internal/api/klub/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: '',
                planId: 'anastasia-premium',
            }),
        });

        const mockEnv = { STRIPE_SECRET_KEY: 'sk_test_mock' } as unknown as Env;
        const res = await handleKlubSubscribe(req, mockEnv);
        expect(res.status).toBe(422);
        const data = await res.json() as { ok: boolean; error: string };
        expect(data.ok).toBe(false);
    });
});
