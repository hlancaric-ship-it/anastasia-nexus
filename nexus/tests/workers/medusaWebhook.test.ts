import { env } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { handleMedusaWebhook } from '../../workers/api/routes/medusaWebhook.js';
import type { Env } from '../../workers/api/types.js';
import { signedMedusaWebhook, webhookTestSecret } from '../helpers/medusaWebhookRequest.js';

const workerEnv = { DB: env.DB, HMAC_SECRET: 'synthetic-hmac', ENVIRONMENT: 'production',
    MEDUSA_PRICING_TENANT_ID: 'synthetic', MEDUSA_WEBHOOK_SECRET: webhookTestSecret } as Env;
const ctx = { waitUntil: vi.fn() };
const event = (id: string, target = 'ord_synthetic') => ({ id, type: 'order.placed', data: { id: target, email: 'synthetic-private@example.test' } });
const rows = (id: string) => env.DB.prepare('SELECT * FROM medusa_webhook_inbox WHERE event_id = ?').bind(id).all();

describe('Medusa event intake in real D1', () => {
    it('durably stores a minimal reference before 200 and preserves it on replay', async () => {
        const id = `evt_${crypto.randomUUID()}`;
        ctx.waitUntil.mockClear();
        const first = await handleMedusaWebhook(await signedMedusaWebhook(event(id)), workerEnv, ctx);
        expect(first.status).toBe(200);
        const persisted = (await rows(id)).results;
        expect(persisted).toHaveLength(1);
        expect(persisted[0]).toMatchObject({ tenant_id: 'synthetic', target_id: 'ord_synthetic', event_type: 'order.placed', processing_state: 'RECEIVED' });
        expect(JSON.stringify(persisted)).not.toContain('synthetic-private');
        expect(ctx.waitUntil).not.toHaveBeenCalled();
        const replay = await handleMedusaWebhook(await signedMedusaWebhook(event(id)), workerEnv, ctx);
        expect(await replay.json()).toMatchObject({ duplicate: true });
        expect((await rows(id)).results).toEqual(persisted);
    });
    it('parallel deliveries create exactly one inbox row', async () => {
        const id = `evt_${crypto.randomUUID()}`;
        const results = await Promise.all(Array.from({ length: 8 }, async () =>
            (await handleMedusaWebhook(await signedMedusaWebhook(event(id)), workerEnv, ctx)).json() as Promise<{ duplicate?: boolean }>));
        expect(results.filter(result => !result.duplicate)).toHaveLength(1);
        expect((await rows(id)).results).toHaveLength(1);
    });
    it('same id with a different target is rejected without overwriting the original', async () => {
        const id = `evt_${crypto.randomUUID()}`;
        await handleMedusaWebhook(await signedMedusaWebhook(event(id)), workerEnv, ctx);
        const before = (await rows(id)).results;
        await expect(handleMedusaWebhook(await signedMedusaWebhook(event(id, 'ord_other')), workerEnv, ctx))
            .rejects.toMatchObject({ status: 409, code: 'WEBHOOK_CONFLICT' });
        expect((await rows(id)).results).toEqual(before);
    });
    it('separates identical delivery ids by the server-bound tenant', async () => {
        const id = `evt_${crypto.randomUUID()}`;
        for (const tenant of ['synthetic', 'synthetic-other']) {
            await handleMedusaWebhook(await signedMedusaWebhook(event(id)), { ...workerEnv, MEDUSA_PRICING_TENANT_ID: tenant }, ctx);
        }
        expect((await rows(id)).results.map(row => row.tenant_id).sort()).toEqual(['synthetic', 'synthetic-other']);
    });
    it('unknown events remain visible for review and are never reported as processed', async () => {
        const id = `evt_${crypto.randomUUID()}`;
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            await handleMedusaWebhook(await signedMedusaWebhook({ ...event(id), type: 'synthetic.unknown' }), workerEnv, ctx);
            expect((await rows(id)).results[0]?.processing_state).toBe('NEEDS_REVIEW');
            expect(JSON.stringify(warning.mock.calls)).not.toContain('synthetic-private');
            expect(JSON.stringify(warning.mock.calls)).not.toContain('.processed');
        } finally { warning.mockRestore(); }
    });
    it('does not reactivate old receipts without a tenant or target', async () => {
        const id = `evt_${crypto.randomUUID()}`;
        await env.DB.prepare('INSERT INTO medusa_webhook_receipts (event_id, event_type) VALUES (?, ?)').bind(id, 'order.placed').run();
        await expect(handleMedusaWebhook(await signedMedusaWebhook(event(id)), workerEnv, ctx))
            .rejects.toMatchObject({ status: 409 });
        expect((await rows(id)).results).toHaveLength(0);
    });
});
