// Medusa.js Webhook Route Handler pre Cloudflare Workers
import { ApiError, jsonResponse, log } from '../http.js';
import type { Env } from '../types.js';

export async function handleMedusaWebhook(
    request: Request,
    _env: Env,
    ctx: { waitUntil(promise: Promise<unknown>): void }
): Promise<Response> {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        throw new ApiError('INVALID_JSON', 400, 'Webhook požiadavka musí byť platný JSON.');
    }

    const payload = body as { event?: string; data?: Record<string, unknown> };
    const eventName = payload.event || 'unknown.event';

    log('info', 'webhook.medusa.received', {
        event: eventName,
        dataId: payload.data?.id,
    });

    // Asynchrónne spracovanie po odoslaní HTTP 200 OK (Medusa webhook SLA)
    ctx.waitUntil(
        (async () => {
            try {
                if (eventName === 'order.placed') {
                    log('info', 'medusa.order_placed.processed', { orderId: payload.data?.id });
                } else if (eventName === 'customer.created') {
                    log('info', 'medusa.customer_created.processed', { customerId: payload.data?.id });
                }
            } catch (err) {
                log('error', 'medusa.webhook_async_failed', {
                    event: eventName,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        })()
    );

    return jsonResponse({
        received: true,
        event: eventName,
        timestamp: new Date().toISOString(),
    });
}
