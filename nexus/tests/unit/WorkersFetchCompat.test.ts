import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { flushOpsEvents, enqueueOpsEvent, _opsQueueForTests } from '../../workers/api/ops-ingest.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return name === 'node_modules' || name === '__tests__' ? [] : sources(path);
        return /\.(ts|js)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
    });
}

describe('Workers fetch kompatibilita', () => {
    // workerd hází TypeError na redirect 'error' ještě před odesláním požadavku.
    it('runtime kód nepoužívá redirect "error"', () => {
        const offenders = ['workers', 'connectors'].flatMap(dir => sources(join(root, dir)))
            .filter(path => /redirect\s*:\s*['"]error['"]/.test(readFileSync(path, 'utf8')))
            .map(path => relative(root, path));
        expect(offenders).toEqual([]);
    });

    it('ops ingest bere přesměrování jako selhání a nenásleduje ho', async () => {
        _opsQueueForTests().reset();
        enqueueOpsEvent('warn', 'http.api_error', '2026-10-28T00:00:00.000Z', { status: 401, opsTenant: 'anastasia' });
        const warnings: string[] = [];
        const original = console.warn;
        console.warn = (line: string) => { warnings.push(line); };
        let calls = 0;
        try {
            await flushOpsEvents({
                OPS_INGEST_URL: 'https://ops.example.test/hooks/ops/edge-events',
                OPS_INGEST_SECRET: 's'.repeat(40),
                OPS_INGEST_TENANT_ID: 'anastasia',
            }, (async () => { calls += 1; return new Response(null, { status: 302, headers: { location: 'https://evil.example.test/' } }); }) as typeof fetch,
            Date.parse('2026-10-28T00:00:10.000Z'));
        } finally {
            console.warn = original;
        }
        expect(calls).toBe(1);
        expect(warnings.map(line => JSON.parse(line))).toContainEqual(expect.objectContaining({ event: 'ops.ingest_failed', status: 302 }));
    });
});
