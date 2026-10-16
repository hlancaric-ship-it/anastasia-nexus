// Durable, tenant-bound Medusa event intake. Business state is reloaded by a consumer, not copied from this body.
import { ApiError, jsonResponse, log } from '../http.js';
import type { Env } from '../types.js';

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const EVENT = /^[a-z][a-z0-9_.-]{0,63}$/;
const KNOWN_EVENTS = new Set(['order.placed', 'customer.created', 'order.canceled', 'payment.captured']);

async function readBody(request: Request): Promise<string> {
    if (!request.body) return '';
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        for (;;) {
            const result = await reader.read();
            if (result.done) break;
            length += result.value.byteLength;
            if (length > 1024 * 1024) {
                await reader.cancel();
                throw new ApiError('VALIDATION_ERROR', 413, 'Webhook je príliš veľký.');
            }
            chunks.push(result.value);
        }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder().decode(bytes);
}

export async function handleMedusaWebhook(
    request: Request,
    env: Env,
    _ctx: { waitUntil(promise: Promise<unknown>): void },
): Promise<Response> {
    const webhookSecret = env.MEDUSA_WEBHOOK_SECRET;
    const tenantId = env.MEDUSA_PRICING_TENANT_ID;
    if (!webhookSecret || !tenantId || !/^[a-z0-9_-]{2,32}$/.test(tenantId)) {
        throw new ApiError('MISSING_BINDING', 503, 'Chýba overenie zdroja Medusa webhooku.');
    }
    const rawBody = await readBody(request);
    if (!(await verifyMedusaSignature(request.headers.get('x-medusa-signature'), rawBody, webhookSecret))) {
        throw new ApiError('REJECT_SIGNATURE', 401, 'Neplatný nebo expirovaný podpis Medusa webhooku.');
    }
    let parsed: unknown;
    try { parsed = JSON.parse(rawBody); }
    catch { throw new ApiError('INVALID_JSON', 400, 'Webhook požiadavka musí byť platný JSON.'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new ApiError('VALIDATION_ERROR', 422, 'Webhook musí obsahovať objekt udalosti.');
    }
    const payload = parsed as Record<string, unknown>;
    const eventName = payload.event ?? payload.type;
    if (typeof eventName !== 'string' || !EVENT.test(eventName)) {
        throw new ApiError('VALIDATION_ERROR', 422, 'Payload nesmie chýbať pole event.');
    }
    if (payload.event !== undefined && payload.type !== undefined && payload.event !== payload.type) {
        throw new ApiError('VALIDATION_ERROR', 422, 'Typ udalosti nie je jednoznačný.');
    }
    const eventId = request.headers.get('x-medusa-delivery') ?? payload.id;
    const data = payload.data;
    const targetId = data && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>).id : undefined;
    if (typeof eventId !== 'string' || !ID.test(eventId) || typeof targetId !== 'string' || !ID.test(targetId)) {
        throw new ApiError('VALIDATION_ERROR', 422, 'Webhook musí obsahovať platné ID udalosti a záznamu.');
    }
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256',
        new TextEncoder().encode(JSON.stringify({ schema: 1, tenantId, eventName, targetId }))));
    const envelopeHash = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
    const state = KNOWN_EVENTS.has(eventName) ? 'RECEIVED' : 'NEEDS_REVIEW';
    let duplicate = false;
    try {
        // Old receipts have no tenant or target; do not silently reactivate them.
        const legacy = await env.DB.prepare('SELECT event_id FROM medusa_webhook_receipts WHERE event_id = ?')
            .bind(eventId).first();
        if (legacy) throw new ApiError('WEBHOOK_CONFLICT', 409, 'Staršia udalosť vyžaduje kontrolu pred opakovaním.');
        const inserted = await env.DB.prepare(
            `INSERT INTO medusa_webhook_inbox (tenant_id, event_id, event_type, target_id, envelope_hash, processing_state)
             VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(tenant_id, event_id) DO NOTHING RETURNING event_id`,
        ).bind(tenantId, eventId, eventName, targetId, envelopeHash, state).first();
        if (!inserted) {
            const prior = await env.DB.prepare('SELECT envelope_hash FROM medusa_webhook_inbox WHERE tenant_id = ? AND event_id = ?')
                .bind(tenantId, eventId).first<{ envelope_hash: string }>();
            if (!prior || prior.envelope_hash !== envelopeHash) {
                throw new ApiError('WEBHOOK_CONFLICT', 409, 'ID udalosti už patrí inému obsahu.');
            }
            duplicate = true;
        }
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError('STORAGE_UNAVAILABLE', 503, 'Udalosť sa nepodarilo bezpečne uložiť.');
    }
    log(state === 'NEEDS_REVIEW' ? 'warn' : 'info', duplicate ? 'webhook.medusa.duplicate_skipped' : 'webhook.medusa.persisted', {
        opsTenant: tenantId, eventId, event: eventName, targetId, processing_state: state,
    });
    // 200 means durable receipt only. No waitUntil task is mistaken for completed business work.
    return jsonResponse({ received: true, tenantId, event: eventName, eventId,
        ...(duplicate ? { duplicate: true } : {}), timestamp: new Date().toISOString() });
}

async function verifyMedusaSignature(header: string | null, rawBody: string, secret: string): Promise<boolean> {
    if (!header) return false;
    const parts = Object.fromEntries(header.split(',').map((part) => {
        const separator = part.indexOf('=');
        return separator < 0 ? ['', ''] : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
    }));
    const timestamp = parts.t;
    const signature = parts.v1;
    if (!timestamp || !/^\d+$/.test(timestamp) || !signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (age > 300) return false;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`)));
    const expected = Array.from(digest, (value) => value.toString(16).padStart(2, '0')).join('');
    let mismatch = expected.length ^ signature.length;
    for (let index = 0; index < expected.length; index++) mismatch |= expected.charCodeAt(index) ^ (signature.toLowerCase().charCodeAt(index) || 0);
    return mismatch === 0;
}
