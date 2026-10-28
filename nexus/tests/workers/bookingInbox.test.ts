import { env } from 'cloudflare:test';
import { expect, it, vi } from 'vitest';
import { consumeBookingInbox, bookingOperationId } from '../../workers/api/booking-inbox.js';
import { D1ExecutionIntentStore } from '../../connectors/d1/D1ExecutionIntentStore.js';
import type { Env } from '../../workers/api/types.js';
const T0 = '2026-10-16T10:00:00.000Z';
const now = Date.parse(T0);
async function fixture(eventType = 'order.placed') {
    const tenant = `bkt_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
    const event = `evt_${crypto.randomUUID()}`;
    const order = `${eventType === 'payment.captured' ? 'pay' : 'order'}_${crypto.randomUUID()}`;
    const config = { DB: env.DB, HMAC_SECRET: 'synthetic-hmac', MEDUSA_PRICING_TENANT_ID: tenant,
        MEDUSA_BOOKING_SYNC_URL: 'https://medusa.example.test/hooks/nexus/booking-order',
        MEDUSA_BOOKING_SYNC_SECRET: 'synthetic-booking-sync-secret-32-characters' } as Env;
    await env.DB.prepare(`INSERT INTO medusa_webhook_inbox(tenant_id,event_id,event_type,target_id,envelope_hash,processing_state,received_at)
        VALUES (?,?,?,?,?,'RECEIVED',?)`).bind(tenant,event,eventType,order,'a'.repeat(64),T0).run();
    const id = await bookingOperationId(tenant,event,order);
    const store = new D1ExecutionIntentStore(env.DB);
    const inbox = () => env.DB.prepare('SELECT processing_state, operation_id FROM medusa_webhook_inbox WHERE tenant_id = ? AND event_id = ?').bind(tenant,event).first();
    const reply = (body: Record<string, unknown>, synchronized = true) => new Response(JSON.stringify({ ok: true,
        ...(eventType === 'payment.captured' ? { version: 2, eventType, targetId: order, orderId: 'order_resolved' } : { version: 1, orderId: order }),
        tenantId: tenant, operationId: id, synchronized, result: synchronized ? eventType === 'order.canceled' ? 'CANCELED' : 'CONFIRMED' : 'MISMATCH', ...body }));
    const request = vi.fn(async (_url: unknown, options: RequestInit) => {
        expect(options.redirect).toBe('manual'); expect(options.signal).toBeDefined();
        const body = JSON.parse(options.body as string);
        expect(body).toMatchObject({ tenantId: tenant, operationId: id,
            ...(eventType === 'payment.captured' ? { version: 2, eventType, targetId: order } : { version: 1, orderId: order }) });
        expect(Object.keys(body).sort()).toEqual(eventType === 'payment.captured'
            ? ['eventType','mode','operationId','targetId','tenantId','version'] : ['mode','operationId','orderId','tenantId','version']);
        return reply({});
    });
    return { tenant,event,order,id,config,store,inbox,reply,request,context: { tenantId: tenant, platform: 'medusa' as const } };
}
it('persists EXECUTING before sync and requires separate authoritative read-back before PROCESSED', async () => {
    const f = await fixture(); const modes: string[] = [];
    f.request.mockImplementation(async (_url, options) => {
        modes.push(JSON.parse(options.body as string).mode);
        expect((await f.store.findById(f.tenant,f.id))?.state).toBe('EXECUTING');
        return f.reply({});
    });
    await consumeBookingInbox(f.config,now,f.request as typeof fetch);
    expect(modes).toEqual(['synchronize','inspect']);
    expect(await f.inbox()).toMatchObject({ processing_state: 'PROCESSED', operation_id: f.id });
    expect(await f.store.findById(f.tenant,f.id)).toMatchObject({ state: 'EXECUTED', confirmationQuality: 'SYSTEM_CONFIRMED' });
    await consumeBookingInbox(f.config,now+1000,f.request as typeof fetch);
    expect(f.request).toHaveBeenCalledTimes(2);
});
it('concurrent scheduled consumers never synchronize the same operation twice', async () => {
    const f = await fixture();
    await Promise.all(Array.from({ length: 8 }, () => consumeBookingInbox(f.config,now,f.request as typeof fetch)));
    expect(f.request.mock.calls.filter(([,o]) => JSON.parse(o.body as string).mode === 'synchronize')).toHaveLength(1);
    expect(await f.inbox()).toMatchObject({ processing_state: 'PROCESSED' });
});
it('a lost response remains UNKNOWN and is recovered by a read only, without another write', async () => {
    const f = await fixture();
    f.request.mockRejectedValueOnce(new Error('synthetic-lost-response-after-write'));
    await consumeBookingInbox(f.config,now,f.request as typeof fetch);
    expect(await f.store.findById(f.tenant,f.id)).toMatchObject({ state: 'UNKNOWN' });
    await consumeBookingInbox(f.config,now+1000,f.request as typeof fetch);
    expect(f.request.mock.calls.map(([,o]) => JSON.parse(o.body as string).mode)).toEqual(['synchronize','inspect']);
    expect(await f.inbox()).toMatchObject({ processing_state: 'PROCESSED' });
});
it('never treats HTTP success as a confirmed booking without matching state', async () => {
    const f = await fixture();
    f.request.mockImplementation(async () => f.reply({},false));
    await consumeBookingInbox(f.config,now,f.request as typeof fetch);
    expect(await f.store.findById(f.tenant,f.id)).toMatchObject({ state: 'UNKNOWN' });
    await consumeBookingInbox(f.config,now+1000,f.request as typeof fetch);
    expect(await f.inbox()).toMatchObject({ processing_state: 'NEEDS_REVIEW' });
    expect(f.request.mock.calls.filter(([,o]) => JSON.parse(o.body as string).mode === 'synchronize')).toHaveLength(1);
});
it('recovers a process crash with expired EXECUTING by inspection, not re-execution', async () => {
    const f = await fixture();
    await f.store.plan(f.context,{ id:f.id,decisionId:f.event,domain:'booking',connectorType:'medusa',operation:'SYNC_ORDER_BOOKING',targetRef:f.order,
        payload:{eventId:f.event,orderId:f.order},expectedState:{synchronized:true},idempotencyKey:f.id,plannedAt:T0 });
    await f.store.claimForExecution(f.context,f.id,T0);
    await consumeBookingInbox(f.config,now+90_001,f.request as typeof fetch);
    expect(f.request.mock.calls.map(([,o]) => JSON.parse(o.body as string).mode)).toEqual(['inspect']);
    expect(await f.inbox()).toMatchObject({ processing_state:'PROCESSED' });
});
it.each([{tenantId:'other'},{operationId:'other'},{orderId:'other'},{version:2},{synchronized:true,result:'MISMATCH'}])('rejects a mismatched receipt %j', async patch => {
    const f = await fixture(); f.request.mockImplementation(async () => f.reply(patch));
    await consumeBookingInbox(f.config,now,f.request as typeof fetch);
    expect(await f.store.findById(f.tenant,f.id)).toMatchObject({state:'UNKNOWN'});
    expect(await f.inbox()).toMatchObject({processing_state:'PROCESSING'});
});
it('does not consume another tenant or an event with no domain handler', async () => {
    const f = await fixture();
    await env.DB.prepare("UPDATE medusa_webhook_inbox SET event_type='customer.created' WHERE tenant_id=?").bind(f.tenant).run();
    await consumeBookingInbox(f.config,now,f.request as typeof fetch);
    await consumeBookingInbox({...f.config,MEDUSA_PRICING_TENANT_ID:'foreign'},now,f.request as typeof fetch);
    expect(f.request).not.toHaveBeenCalled();
    expect(await f.inbox()).toMatchObject({processing_state:'RECEIVED'});
});
it('does not call a connector before a durable claim can be stored', async () => {
    const f = await fixture();
    const broken = {prepare(){throw new Error('synthetic-storage-unavailable')}} as unknown as D1Database;
    await expect(consumeBookingInbox({...f.config,DB:broken},now,f.request as typeof fetch)).rejects.toThrow();
    expect(f.request).not.toHaveBeenCalled();
});
it.each(['http://external.example.test','https://user:password@medusa.test','https://medusa.test?token=private'])('refuses unsafe credential destinations %s', async url => {
    const f = await fixture();
    await expect(consumeBookingInbox({...f.config,MEDUSA_BOOKING_SYNC_URL:url},now,f.request as typeof fetch)).rejects.toThrow();
    expect(f.request).not.toHaveBeenCalled();
});
it('recovers a crash after confirmed execution but before inbox acknowledgement without another HTTP call', async () => {
    const f = await fixture();
    const db = { prepare(sql: string) {
        if (sql.includes("processing_state = 'PROCESSED'")) return { bind(){ return {run: async () => { throw new Error('synthetic-ack-crash'); }}; } };
        return env.DB.prepare(sql);
    }} as unknown as D1Database;
    await consumeBookingInbox({...f.config,DB:db},now,f.request as typeof fetch);
    expect(await f.store.findById(f.tenant,f.id)).toMatchObject({state:'EXECUTED'});
    expect(await f.inbox()).toMatchObject({processing_state:'PROCESSING'});
    await consumeBookingInbox(f.config,now+1000,f.request as typeof fetch);
    expect(f.request).toHaveBeenCalledTimes(2);
    expect(await f.inbox()).toMatchObject({processing_state:'PROCESSED'});
});
it('does not let a stale completion overwrite a reconciled execution', async () => {
    const f = await fixture();
    let release!: () => void; let started!: () => void;
    const gate = new Promise<void>(resolve => {release=resolve;});
    const ready = new Promise<void>(resolve => {started=resolve;});
    f.request.mockImplementationOnce(async () => { started(); await gate; return f.reply({}); });
    const old = consumeBookingInbox(f.config,now,f.request as typeof fetch);
    await ready;
    try {
        await consumeBookingInbox(f.config,now+90_001,f.request as typeof fetch);
    } finally { release(); }
    await old;
    expect(f.request.mock.calls.filter(([,o]) => JSON.parse(o.body as string).mode === 'synchronize')).toHaveLength(1);
    expect(await f.store.findById(f.tenant,f.id)).toMatchObject({state:'EXECUTED',confirmationQuality:'SYSTEM_CONFIRMED'});
    expect(await f.inbox()).toMatchObject({processing_state:'PROCESSED'});
});
it('bounds each pass to two events', async () => {
    const f = await fixture();
    for(const suffix of ['a','b']) await env.DB.prepare(`INSERT INTO medusa_webhook_inbox(tenant_id,event_id,event_type,target_id,envelope_hash,processing_state,received_at)
        VALUES (?,?,'order.placed',?,?,'RECEIVED',?)`).bind(f.tenant,`evt_${suffix}`,`order_${suffix}`,'b'.repeat(64),T0).run();
    f.request.mockImplementation(async (_url,options) => {
        const body=JSON.parse(options.body as string);
        return new Response(JSON.stringify({...body,ok:true,synchronized:true,result:'CONFIRMED'}));
    });
    await consumeBookingInbox(f.config,now,f.request as typeof fetch);
    expect(f.request).toHaveBeenCalledTimes(4);
    const rows=await env.DB.prepare("SELECT count(*) AS n FROM medusa_webhook_inbox WHERE tenant_id=? AND processing_state='RECEIVED'").bind(f.tenant).first<{n:number}>();
    expect(rows?.n).toBe(1);
});
it('keeps identical event and order IDs isolated between configured tenants', async () => {
    const f = await fixture(); const other=f.tenant+'_b';
    await env.DB.prepare(`INSERT INTO medusa_webhook_inbox(tenant_id,event_id,event_type,target_id,envelope_hash,processing_state,received_at)
        VALUES (?,?,'order.placed',?,?,'RECEIVED',?)`).bind(other,f.event,f.order,'c'.repeat(64),T0).run();
    await consumeBookingInbox(f.config,now,f.request as typeof fetch);
    expect(await f.inbox()).toMatchObject({processing_state:'PROCESSED'});
    const foreign=await env.DB.prepare('SELECT processing_state,operation_id FROM medusa_webhook_inbox WHERE tenant_id=? AND event_id=?').bind(other,f.event).first();
    expect(foreign).toMatchObject({processing_state:'RECEIVED',operation_id:null});
    expect(await f.store.findById(other,f.id)).toBeUndefined();
});

it.each(['order.canceled', 'payment.captured'])('processes a native lifecycle source with a stable intent and read-back: %s', async type => {
    const f = await fixture(type);
    await consumeBookingInbox(f.config,now,f.request as typeof fetch);
    expect(f.request.mock.calls.map(([,o])=>JSON.parse(o.body as string).mode)).toEqual(['synchronize','inspect']);
    expect(await f.inbox()).toMatchObject({processing_state:'PROCESSED'});
    expect(await f.store.findById(f.tenant,f.id)).toMatchObject({state:'EXECUTED',payload:{eventType:type,targetId:f.order}});
});
it('does not confirm cancellation against a still-active authoritative order', async () => {
    const f=await fixture('order.canceled');
    f.request.mockImplementation(async ()=>f.reply({result:'CONFIRMED'}));
    await consumeBookingInbox(f.config,now,f.request as typeof fetch);
    expect(await f.store.findById(f.tenant,f.id)).toMatchObject({state:'UNKNOWN'});
    expect(await f.inbox()).toMatchObject({processing_state:'PROCESSING'});
});
it.each([{targetId:'pay_other'},{eventType:'order.placed'},{orderId:null},{version:1}])('rejects mismatched payment-source read-back %j', async patch=>{
    const f=await fixture('payment.captured'); f.request.mockImplementation(async ()=>f.reply(patch));
    await consumeBookingInbox(f.config,now,f.request as typeof fetch);
    expect(await f.store.findById(f.tenant,f.id)).toMatchObject({state:'UNKNOWN'});
});

it('processes a fresh event before older unresolved retries', async () => {
    const f = await fixture();
    for(const suffix of ['a','b']) await env.DB.prepare(`INSERT INTO medusa_webhook_inbox(tenant_id,event_id,event_type,target_id,envelope_hash,processing_state,processing_updated_at,received_at)
        VALUES (?,?,'order.placed',?,?,'PROCESSING',?,?)`).bind(f.tenant,`evt_stuck_${suffix}`,`order_stuck_${suffix}`,'c'.repeat(64),'2026-10-16T09:00:00.000Z','2026-10-16T08:00:00.000Z').run();
    f.request.mockImplementation(async (_url, options) => {
        if (JSON.parse(options.body as string).orderId !== f.order) throw new Error('synthetic-unreachable-order');
        return f.reply({});
    });
    await consumeBookingInbox(f.config,now,f.request as typeof fetch);
    expect(await f.inbox()).toMatchObject({ processing_state: 'PROCESSED', operation_id: f.id });
});
