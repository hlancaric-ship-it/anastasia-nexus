// P0-1 Worker security: ENVIRONMENT classification, CORS policy and the
// wrangler.jsonc contract. All data is synthetic; nothing touches a network.
//
// Invariant under test: a missing, empty, misspelled or otherwise unknown
// ENVIRONMENT is treated as PRODUCTION (strict). Only the exact strings
// `development` and `test` relax anything.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import worker from '../../workers/api/index.js';
import { handleNexusSafeOrder } from '../../workers/api/routes/nexusSafeOrder.js';
import {
    isStrictEnvironment,
    preflightResponse,
    resolveAllowedOrigin,
    resolveRuntimeEnvironment,
    withCors,
} from '../../workers/api/http.js';
import type { Env } from '../../workers/api/types.js';

const ctx = { waitUntil: vi.fn() };
const SHOP = 'https://shop.synthetic.test';
const ATTACKER = 'https://attacker.synthetic.test';

/** Values that must NEVER relax security, however plausible they look. */
const NOT_RELAXED: unknown[] = [
    undefined, null, '', ' ', 'production', 'prod', 'Production', 'PRODUCTION', ' production', 'production ',
    'staging', 'stage', 'live', 'dev', 'Development', 'DEVELOPMENT', 'Test', 'TEST', ' test', 'test ', 'testing',
    'development,production', 0, 1, true, false, {}, [],
];

function baseEnv(overrides: Record<string, unknown> = {}): Env {
    return { DB: { prepare: vi.fn() }, HMAC_SECRET: 'synthetic-hmac', ...overrides } as unknown as Env;
}

const get = (path: string, origin?: string) =>
    new Request(`https://nexus.synthetic.test${path}`, { method: 'GET', headers: origin ? { Origin: origin } : {} });

describe('P0-1 ENVIRONMENT classification (fail-closed)', () => {
    it.each(['development', 'test'] as const)('relaxes only for the exact value %s', (value) => {
        expect(resolveRuntimeEnvironment(value)).toBe(value);
        expect(isStrictEnvironment({ ENVIRONMENT: value })).toBe(false);
    });

    it.each(NOT_RELAXED.map((value) => [JSON.stringify(value) ?? String(value), value]))('treats %s as production', (_label, value) => {
        expect(resolveRuntimeEnvironment(value)).toBe('production');
        expect(isStrictEnvironment({ ENVIRONMENT: value as string })).toBe(true);
    });

    it('treats a missing ENVIRONMENT property as production', () => {
        expect(isStrictEnvironment({})).toBe(true);
    });
});

describe('P0-1 CORS policy', () => {
    describe('resolveAllowedOrigin', () => {
        it('is strict by default when the caller omits the environment flag', () => {
            expect(resolveAllowedOrigin(undefined, SHOP)).toBeNull();
            expect(resolveAllowedOrigin('*', SHOP)).toBeNull();
        });

        it.each([undefined, '', '   ', ',', ' , '])('production without a usable allowlist (%j) allows no origin', (allowlist) => {
            expect(resolveAllowedOrigin(allowlist, SHOP, true)).toBeNull();
            expect(resolveAllowedOrigin(allowlist, null, true)).toBeNull();
        });

        it('production never resolves to a wildcard, even if configured', () => {
            expect(resolveAllowedOrigin('*', SHOP, true)).toBeNull();
            expect(resolveAllowedOrigin(' * ', SHOP, true)).toBeNull();
        });

        it('production ignores a wildcard entry but still honours explicit origins next to it', () => {
            expect(resolveAllowedOrigin(`*, ${SHOP}`, SHOP, true)).toBe(SHOP);
            expect(resolveAllowedOrigin(`*, ${SHOP}`, ATTACKER, true)).toBeNull();
        });

        it('echoes only an exact allowlisted origin', () => {
            const list = `${SHOP}, https://other.synthetic.test`;
            expect(resolveAllowedOrigin(list, SHOP, true)).toBe(SHOP);
            expect(resolveAllowedOrigin(list, 'https://other.synthetic.test', true)).toBe('https://other.synthetic.test');
            expect(resolveAllowedOrigin(list, ATTACKER, true)).toBeNull();
            expect(resolveAllowedOrigin(list, null, true)).toBeNull();
        });

        it.each([
            'http://shop.synthetic.test', // scheme downgrade
            'https://shop.synthetic.test.attacker.test', // suffix attack
            'https://evil.shop.synthetic.test', // sub-domain not listed
            'https://SHOP.synthetic.test', // not an exact match
            'https://shop.synthetic.test/', // trailing slash is not a browser Origin
            'https://shop.synthetic.test:8443', // other port
            '',
        ])('does not allow near-miss origin %j', (origin) => {
            expect(resolveAllowedOrigin(SHOP, origin, true)).toBeNull();
        });

        it.each([true, false])('never allows the opaque "null" origin, even when listed (strict=%s)', (strict) => {
            expect(resolveAllowedOrigin('null', 'null', strict)).toBeNull();
            expect(resolveAllowedOrigin(`null, ${SHOP}`, 'null', strict)).toBeNull();
        });

        it('keeps the wildcard only for explicit development/test without an allowlist', () => {
            expect(resolveAllowedOrigin(undefined, SHOP, false)).toBe('*');
            expect(resolveAllowedOrigin('*', SHOP, false)).toBe('*');
            expect(resolveAllowedOrigin(SHOP, ATTACKER, false)).toBeNull();
            expect(resolveAllowedOrigin(SHOP, SHOP, false)).toBe(SHOP);
        });
    });

    describe('through the Worker entry point', () => {
        it.each(NOT_RELAXED.map((value) => [JSON.stringify(value) ?? String(value), value]))(
            'ENVIRONMENT=%s without allowlist grants no CORS access',
            async (_label, value) => {
                const response = await worker.fetch(get('/api/unknown', SHOP), baseEnv({ ENVIRONMENT: value }), ctx);
                expect(response.status).toBe(404);
                expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
                expect(response.headers.get('Vary')).toContain('Origin');
            },
        );

        it('production with ALLOWED_ORIGINS="*" grants no CORS access', async () => {
            const env = baseEnv({ ENVIRONMENT: 'production', ALLOWED_ORIGINS: '*' });
            const response = await worker.fetch(get('/api/unknown', SHOP), env, ctx);
            expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
        });

        it('unknown ENVIRONMENT with ALLOWED_ORIGINS="*" grants no CORS access', async () => {
            const env = baseEnv({ ALLOWED_ORIGINS: '*' });
            const response = await worker.fetch(get('/api/unknown', SHOP), env, ctx);
            expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
        });

        it('production echoes an allowlisted origin and withholds it from others', async () => {
            const env = baseEnv({ ENVIRONMENT: 'production', ALLOWED_ORIGINS: SHOP });
            const allowed = await worker.fetch(get('/api/unknown', SHOP), env, ctx);
            expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(SHOP);
            expect(allowed.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
            expect(allowed.headers.get('Vary')).toContain('Origin');

            const denied = await worker.fetch(get('/api/unknown', ATTACKER), env, ctx);
            expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull();
            expect(denied.headers.get('Access-Control-Allow-Methods')).toBeNull();
        });

        it('does not send ACAO "null" (which would authorise sandboxed/opaque origins)', async () => {
            const env = baseEnv({ ENVIRONMENT: 'production', ALLOWED_ORIGINS: SHOP });
            const response = await worker.fetch(get('/api/unknown', 'null'), env, ctx);
            expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
        });

        it('keeps the documented dev/test behaviour: wildcard without an allowlist', async () => {
            for (const value of ['development', 'test']) {
                const response = await worker.fetch(get('/api/unknown', SHOP), baseEnv({ ENVIRONMENT: value }), ctx);
                expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
            }
        });

        it('error responses (503 missing binding, 500) obey the same CORS policy', async () => {
            const noBindings = { ENVIRONMENT: 'production', ALLOWED_ORIGINS: SHOP } as unknown as Env;
            const denied = await worker.fetch(get('/api/unknown', ATTACKER), noBindings, ctx);
            expect(denied.status).toBe(503);
            expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull();
            const allowed = await worker.fetch(get('/api/unknown', SHOP), noBindings, ctx);
            expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(SHOP);
        });
    });

    describe('preflight', () => {
        const preflight = (origin: string | null) => new Request('https://nexus.synthetic.test/api/nexus/safeorder', {
            method: 'OPTIONS',
            headers: { ...(origin ? { Origin: origin } : {}), 'Access-Control-Request-Method': 'POST' },
        });

        it('allowlisted origin gets 204 with the CORS grant', async () => {
            const env = baseEnv({ ENVIRONMENT: 'production', ALLOWED_ORIGINS: SHOP });
            const response = await worker.fetch(preflight(SHOP), env, ctx);
            expect(response.status).toBe(204);
            expect(response.headers.get('Access-Control-Allow-Origin')).toBe(SHOP);
            expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
            expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
        });

        it.each([ATTACKER, 'null', null])('production rejects preflight from non-allowlisted origin %s with 403 and no grant', async (origin) => {
            const env = baseEnv({ ENVIRONMENT: 'production', ALLOWED_ORIGINS: SHOP });
            const response = await worker.fetch(preflight(origin), env, ctx);
            expect(response.status).toBe(403);
            expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
            expect(response.headers.get('Access-Control-Allow-Methods')).toBeNull();
            expect(response.headers.get('Access-Control-Allow-Headers')).toBeNull();
        });

        it.each(NOT_RELAXED.map((value) => [JSON.stringify(value) ?? String(value), value]))(
            'ENVIRONMENT=%s without allowlist rejects preflight',
            async (_label, value) => {
                const response = await worker.fetch(preflight(SHOP), baseEnv({ ENVIRONMENT: value }), ctx);
                expect(response.status).toBe(403);
                expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
            },
        );

        it('is answered before binding validation (a 503 must not break CORS discovery)', async () => {
            const response = await worker.fetch(preflight(SHOP), { ENVIRONMENT: 'production', ALLOWED_ORIGINS: SHOP } as unknown as Env, ctx);
            expect(response.status).toBe(204);
        });

        it('explicit test/development without allowlist keeps the permissive 204', () => {
            for (const value of ['development', 'test']) {
                const response = preflightResponse({ ENVIRONMENT: value }, SHOP);
                expect(response.status).toBe(204);
                expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
            }
        });

        it('withCors on a disallowed origin keeps the body/status and only adds Vary', async () => {
            const wrapped = withCors(new Response('{"ok":true}', { status: 201 }), { ENVIRONMENT: 'production' }, ATTACKER);
            expect(wrapped.status).toBe(201);
            expect(await wrapped.text()).toBe('{"ok":true}');
            expect(wrapped.headers.get('Vary')).toBe('Origin');
            expect(wrapped.headers.get('Access-Control-Allow-Origin')).toBeNull();
        });
    });
});

describe('P0-1 regression: SafeOrder test payment provider stays closed outside development/test', () => {
    const valid = { tenantId: 'anastasia', currency: 'eur', orderSum: 50, paymentMethod: 'pp_system_default', customerEmail: 'synthetic@example.test' };
    const request = () => new Request('https://nexus.synthetic.test/api/nexus/safeorder', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer synthetic-service-key' },
        body: JSON.stringify(valid),
    });
    const env = (overrides: Record<string, unknown>) => baseEnv({
        MEDUSA_PRICING_API_KEY: 'synthetic-service-key', MEDUSA_PRICING_TENANT_ID: 'anastasia', ...overrides,
    });

    it.each(NOT_RELAXED.map((value) => [JSON.stringify(value) ?? String(value), value]))('ENVIRONMENT=%s rejects pp_system_default', async (_label, value) => {
        await expect(handleNexusSafeOrder(request(), env({ ENVIRONMENT: value }))).rejects.toMatchObject({ status: 400 });
    });

    it.each(['development', 'test'])('ENVIRONMENT=%s still accepts it (legitimate local flow preserved)', async (value) => {
        const response = await handleNexusSafeOrder(request(), env({ ENVIRONMENT: value }));
        expect(await response.json()).toMatchObject({ ok: true, decision: 'ALLOW', tenantId: 'anastasia' });
    });
});

describe('P0-1 wrangler.jsonc contract', () => {
    const path = fileURLToPath(new URL('../../wrangler.jsonc', import.meta.url));
    const parsed = ts.parseConfigFileTextToJson(path, readFileSync(path, 'utf8'));
    type Vars = Record<string, unknown>;
    const config = parsed.config as { vars?: Vars; env?: { production?: { vars?: Vars; d1_databases?: unknown[]; durable_objects?: unknown } } };

    it('parses as JSONC', () => {
        expect(parsed.error).toBeUndefined();
        expect(config).toBeTypeOf('object');
    });

    it('declares ENVIRONMENT=development for the top-level (dev/staging) target', () => {
        expect(config.vars?.ENVIRONMENT).toBe('development');
    });

    it('declares ENVIRONMENT=production explicitly in env.production (vars are NOT inherited)', () => {
        expect(config.env?.production?.vars?.ENVIRONMENT).toBe('production');
    });

    it('never puts secrets or credentials into vars', () => {
        const sensitive = /(SECRET|TOKEN|PASSWORD|API_KEY|SIGNING_KEY|PRIVATE)/i;
        for (const vars of [config.vars ?? {}, config.env?.production?.vars ?? {}]) {
            for (const name of Object.keys(vars)) expect(name, `vars.${name}`).not.toMatch(sensitive);
        }
    });

    it('never configures a wildcard CORS allowlist for production', () => {
        const origins = config.env?.production?.vars?.ALLOWED_ORIGINS;
        if (origins !== undefined) {
            expect(typeof origins).toBe('string');
            expect(String(origins).split(',').map((value) => value.trim())).not.toContain('*');
        }
    });

    it('production keeps its own bindings (D1 and Durable Object are not inherited either)', () => {
        expect(config.env?.production?.d1_databases?.length).toBeGreaterThan(0);
        expect(config.env?.production?.durable_objects).toBeDefined();
    });
});
