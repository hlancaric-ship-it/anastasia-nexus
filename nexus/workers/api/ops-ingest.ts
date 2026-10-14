// Přeposílání provozních událostí (warn/error) z NEXUS Workeru do Medusa
// `ops_event` (POST {OPS_INGEST_URL}, typicky https://<backend>/hooks/ops/edge-events).
//
// Pravidla:
//   - bez `OPS_INGEST_URL` + `OPS_INGEST_SECRET` (min. 32 znaků) je to no-op;
//   - fronta je omezená (MAX_QUEUE), při přetečení se nejstarší zahodí a počet
//     se pošle jako `ops.ingest_dropped` -- log nikdy nezablokuje request;
//   - `stack`, `message` a vnořené struktury se NEPOSÍLAJÍ, jen primitivní
//     hodnoty zkrácené na 200 znaků (backend navíc maskuje citlivé klíče);
//   - selhání odeslání jde jen do console, ne zpět do fronty (žádná smyčka).

import type { LogLevel } from './http.js';

const MAX_QUEUE = 100;
const MAX_STRING = 200;
const SEND_TIMEOUT_MS = 3000;
const DROP_KEYS = new Set(['stack', 'message', 'details', 'body']);

type EdgeEvent = Record<string, string | number | boolean | null>;

const queue: EdgeEvent[] = [];
let dropped = 0;

export interface OpsIngestEnv {
    readonly OPS_INGEST_URL?: string;
    readonly OPS_INGEST_SECRET?: string;
}

export function enqueueOpsEvent(level: LogLevel, event: string, ts: string, fields: Readonly<Record<string, unknown>>): void {
    if (level !== 'warn' && level !== 'error') return;
    const item: EdgeEvent = { level, event, ts };
    for (const [key, value] of Object.entries(fields)) {
        if (DROP_KEYS.has(key) || value === undefined) continue;
        const outKey = key === 'requestId' ? 'request_id' : key;
        if (typeof value === 'string') item[outKey] = value.slice(0, MAX_STRING);
        else if (typeof value === 'number' || typeof value === 'boolean' || value === null) item[outKey] = value;
    }
    if (queue.length >= MAX_QUEUE) {
        queue.shift();
        dropped++;
    }
    queue.push(item);
}

/** Jen pro testy. */
export function _opsQueueForTests(): { queue: EdgeEvent[]; dropped: number; reset(): void } {
    return { queue, dropped, reset: () => { queue.length = 0; dropped = 0; } };
}

async function hmacHex(secret: string, data: string): Promise<string> {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
    return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Odešle vše, co je ve frontě. Nikdy nevyhodí výjimku. */
export async function flushOpsEvents(env: OpsIngestEnv, fetchImpl: typeof fetch = fetch, nowMs = Date.now()): Promise<void> {
    const url = env.OPS_INGEST_URL;
    const secret = env.OPS_INGEST_SECRET;
    if (!url || !secret || secret.length < 32) {
        queue.length = 0;
        dropped = 0;
        return;
    }
    if (queue.length === 0 && dropped === 0) return;
    const events = queue.splice(0, MAX_QUEUE);
    if (dropped > 0) {
        if (events.length >= MAX_QUEUE) events.shift();
        events.push({ level: 'warn', event: 'ops.ingest_dropped', ts: new Date(nowMs).toISOString(), count: dropped });
        dropped = 0;
    }
    try {
        const body = JSON.stringify({ events });
        const ts = String(Math.floor(nowMs / 1000));
        const signature = await hmacHex(secret, `${ts}.${body}`);
        const response = await fetchImpl(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-nexus-timestamp': ts, 'x-nexus-signature': signature },
            body,
            signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
        if (!response.ok) console.warn(JSON.stringify({ level: 'warn', event: 'ops.ingest_failed', status: response.status, count: events.length }));
    } catch (error) {
        console.warn(JSON.stringify({ level: 'warn', event: 'ops.ingest_failed', error: error instanceof Error ? error.name : 'unknown', count: events.length }));
    }
}
