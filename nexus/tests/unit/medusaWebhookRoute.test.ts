import { describe, it, expect } from 'vitest';
import { handleMedusaWebhook } from '../../workers/api/routes/medusaWebhook.js';
import type { Env } from '../../workers/api/types.js';

describe('handleMedusaWebhook Route Handler', () => {
    const mockCtx = { waitUntil: () => {} };

    it('odmietne webhook bez x-medusa-signature v produkcii', async () => {
        const req = new Request('https://nexus-api.internal/api/webhooks/medusa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: 'order.placed', data: { id: 'ord_123' } }),
        });

        const mockEnv = { ENVIRONMENT: 'production', HMAC_SECRET: 'supersecret' } as unknown as Env;
        await expect(handleMedusaWebhook(req, mockEnv, mockCtx)).rejects.toThrow('Chýba podpis Medusa webhooku.');
    });

    it('spracuje platný webhook s podpora eventu a deduplikácie', async () => {
        const eventId = `evt_test_${Date.now()}`;
        const req1 = new Request('https://nexus-api.internal/api/webhooks/medusa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: 'order.placed', id: eventId, data: { id: 'ord_999' } }),
        });

        const res1 = await handleMedusaWebhook(req1, {} as Env, mockCtx);
        expect(res1.status).toBe(200);
        const data1 = await res1.json() as { received: boolean; duplicate?: boolean };
        expect(data1.received).toBe(true);
        expect(data1.duplicate).toBeUndefined();

        // Podruhé ten samý webhook -> duplicate skipped
        const req2 = new Request('https://nexus-api.internal/api/webhooks/medusa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: 'order.placed', id: eventId, data: { id: 'ord_999' } }),
        });

        const res2 = await handleMedusaWebhook(req2, {} as Env, mockCtx);
        expect(res2.status).toBe(200);
        const data2 = await res2.json() as { received: boolean; duplicate?: boolean };
        expect(data2.received).toBe(true);
        expect(data2.duplicate).toBe(true);
    });

    it('vyhodí 422 ak v payload chýba event', async () => {
        const req = new Request('https://nexus-api.internal/api/webhooks/medusa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { id: 'ord_123' } }),
        });

        await expect(handleMedusaWebhook(req, {} as Env, mockCtx)).rejects.toThrow('Payload nesmie chýbať pole event.');
    });
});
