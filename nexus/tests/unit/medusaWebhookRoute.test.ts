import { describe, it, expect } from 'vitest';
import { handleMedusaWebhook } from '../../workers/api/routes/medusaWebhook.js';
import type { Env } from '../../workers/api/types.js';

describe('handleMedusaWebhook Route Handler', () => {
    const mockCtx = { waitUntil: () => {} };
    const receipts = new Set<string>();
    const makeEnv = (extra: Record<string, unknown> = {}) => ({
        DB: { prepare: () => ({ bind: (eventId: string) => ({ first: async () => {
            if (receipts.has(eventId)) return null;
            receipts.add(eventId);
            return { event_id: eventId };
        } }) }) },
        ...extra,
    } as unknown as Env);

    it('odmietne webhook bez x-medusa-signature v produkcii', async () => {
        const req = new Request('https://nexus-api.internal/api/webhooks/medusa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: 'order.placed', data: { id: 'ord_123' } }),
        });

        const mockEnv = makeEnv({ ENVIRONMENT: 'production', MEDUSA_WEBHOOK_SECRET: 'supersecret' });
        await expect(handleMedusaWebhook(req, mockEnv, mockCtx)).rejects.toThrow('Neplatný nebo expirovaný podpis Medusa webhooku.');
    });

    it('ověří HMAC podpis nad timestampem a raw body a odmítne replay starší než pět minut', async () => {
        const secret = 'test-signing-secret';
        const body = JSON.stringify({ type: 'order.placed', id: `evt_signed_${Date.now()}`, data: { id: 'ord_123' } });
        const timestamp = String(Math.floor(Date.now() / 1000));
        const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const signature = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`))), (value) => value.toString(16).padStart(2, '0')).join('');
        const env = makeEnv({ ENVIRONMENT: 'production', MEDUSA_WEBHOOK_SECRET: secret });
        const valid = new Request('https://nexus-api.internal/api/webhooks/medusa', { method: 'POST', headers: { 'x-medusa-signature': `t=${timestamp},v1=${signature}` }, body });
        expect((await handleMedusaWebhook(valid, env, mockCtx)).status).toBe(200);

        const stale = new Request('https://nexus-api.internal/api/webhooks/medusa', { method: 'POST', headers: { 'x-medusa-signature': `t=${Number(timestamp) - 301},v1=${signature}` }, body });
        await expect(handleMedusaWebhook(stale, env, mockCtx)).rejects.toThrow('Neplatný nebo expirovaný podpis Medusa webhooku.');
    });

    it('spracuje platný webhook s podpora eventu a deduplikácie', async () => {
        const eventId = `evt_test_${Date.now()}`;
        const req1 = new Request('https://nexus-api.internal/api/webhooks/medusa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: 'order.placed', id: eventId, data: { id: 'ord_999' } }),
        });

        // P0-1: unsigned local delivery is a dev/test-only path; it must be requested explicitly.
        const env = makeEnv({ ENVIRONMENT: 'test' });
        const res1 = await handleMedusaWebhook(req1, env, mockCtx);
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

        const res2 = await handleMedusaWebhook(req2, env, mockCtx);
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

        await expect(handleMedusaWebhook(req, makeEnv({ ENVIRONMENT: 'test' }), mockCtx)).rejects.toThrow('Payload nesmie chýbať pole event.');
    });
});
