// K8 -- souběhové a jednorázové čerpání voucheru proti SKUTEČNÉMU D1 a
// Durable Object (SecurityCoordinator), ne mocku. Nikdy dřív neověřeno --
// žádný dosavadní test nevolal handleRedeem ani nesestavoval platný token
// (viz docs/PROGRESS_LOG.md: "Voucher runtime -- souběh neotestován").
//
// Konzumace zůstatku je optimistický zámek na úrovni SQL (`UPDATE ...
// WHERE version = ?`, 0001_credit_voucher.sql §7) -- BEZ Durable Objectu.
// Mock D1 by takovou race nemusel vůbec reprodukovat (mock typicky
// nevykonává dva souběžné SQL dotazy se skutečnou interleaving sémantikou
// SQLite). Tenhle test běží ve workerd s reálným D1, takže Promise.all
// skutečně posílá dva souběžné fetch() do téhož Workeru.
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../../workers/api/index.js';
import type { Env } from '../../workers/api/types.js';
import { computeCartFingerprint } from '../../workers/api/hmac.js';
import { generateVoucherCode } from '../../domains/voucher/CreditVoucherCodeGenerator.js';

const bindings = {
    DB: env.DB,
    HMAC_SECRET: 'synthetic-hmac-voucher',
    VOUCHER_SECURITY: (env as unknown as Env).VOUCHER_SECURITY,
} as Env;
const ctx = { waitUntil: (_promise: Promise<unknown>) => {} };
const TENANT = 'anastasia';

const lines = [{ sku: 'RESET-40-PLUS', quantity: 1, unitPriceMinor: 100000, isVoucherProduct: false }];

async function seedVoucher(id: string, balanceMinor: number) {
    // source_order_id má UNIQUE(tenant_id, source_order_id) -- jedna hodnota
    // pro všechny testy v souboru (sdílené D1 v rámci souboru) by druhý seed
    // shodila na constraint, ne na tom, co se testuje.
    await env.DB.prepare(
        `INSERT INTO vouchers
            (id, tenant_id, initial_balance_minor, current_balance_minor, currency, expires_at, source_order_id, customer_email, status, version)
         VALUES (?1, ?2, ?3, ?3, 'EUR', datetime('now', '+1 year'), ?4, 'zakaznica@example.test', 'ACTIVE', 0)`,
    )
        .bind(id, TENANT, balanceMinor, `source-${id}`)
        .run();
}

async function getValidToken(voucherId: string, cartTotalMinor: number): Promise<string> {
    // Musí odpovídat computeCartFingerprint(lines) v handleRedeem -- jinak
    // by každé čerpání padlo na REJECT_REPLAY (fingerprint mismatch), ne na
    // tom, co se tady doopravdy testuje (souběh na zůstatku).
    const fingerprint = await computeCartFingerprint(lines);
    const url = `https://nexus.test/api/vouchers/validate?code=${encodeURIComponent(voucherId)}&tenant=${TENANT}&cartTotal=${cartTotalMinor}&cartFingerprint=${fingerprint}`;
    const response = await worker.fetch(new Request(url), bindings, ctx);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { valid: boolean; token?: string };
    expect(body.valid).toBe(true);
    if (!body.token) throw new Error('validate nevrátil token');
    return body.token;
}

function redeemRequest(token: string, orderId: string, claimedDiscountMinor: number) {
    return new Request('https://nexus.test/api/vouchers/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId: TENANT, orderId, token, lines, claimedDiscountMinor }),
    });
}

describe('K8 voucher: souběh a jednorázovost proti reálnému D1/DO', () => {
    it('žádný binding -- fail-closed, ne tiché 200', async () => {
        // Token musí být opravdu platný (podpis/TTL/fingerprint), aby se
        // request vůbec dostal až ke kroku, co binding potřebuje -- jinak
        // se otestuje jen to, že 'irrelevant' není platný token.
        const voucherId = generateVoucherCode({ expiryYear: new Date().getFullYear() + 1 });
        await seedVoucher(voucherId, 10000);
        const token = await getValidToken(voucherId, 10000);
        const response = await worker.fetch(
            redeemRequest(token, 'order-missing-binding', 10000),
            { ...bindings, VOUCHER_SECURITY: undefined } as Env,
            ctx,
        );
        expect(response.status).toBe(503);
    });

    it('dvě SOUBĚŽNÉ čerpání stejného poukazu na celý zůstatek: právě jedno uspěje, druhé selže, zůstatek nejde do záporu', async () => {
        const voucherId = generateVoucherCode({ expiryYear: new Date().getFullYear() + 1 });
        await seedVoucher(voucherId, 100000); // 1000.00 EUR

        // Dva NEZÁVISLÉ platné tokeny (různé nonce) na celý zůstatek --
        // nonce replay ochrana sama o sobě by druhý pokus nezastavila,
        // protože jde o JINÝ token. Testuje se SQL optimistický zámek.
        const [tokenA, tokenB] = await Promise.all([
            getValidToken(voucherId, 100000),
            getValidToken(voucherId, 100000),
        ]);

        const [responseA, responseB] = await Promise.all([
            worker.fetch(redeemRequest(tokenA, 'order-A', 100000), bindings, ctx),
            worker.fetch(redeemRequest(tokenB, 'order-B', 100000), bindings, ctx),
        ]);

        const statuses = [responseA.status, responseB.status].sort();
        // Jeden 200 (úspěch), jeden 404/409 (VOUCHER_NOT_APPLICABLE po
        // přepočtu z už vyčerpaného zůstatku, nebo REDEMPTION_CONFLICT,
        // pokud obě trefí stejný version souběžně).
        expect(statuses[0]).toBe(200);
        expect([404, 409]).toContain(statuses[1]);

        const row = await env.DB.prepare(
            `SELECT current_balance_minor, version, status FROM vouchers WHERE id = ?1`,
        )
            .bind(voucherId)
            .first<{ current_balance_minor: number; version: number; status: string }>();
        expect(row).not.toBeNull();
        // Přesně JEDNO čerpání prošlo -- zůstatek 0, ne záporný, ne pořád 1000.
        expect(row!.current_balance_minor).toBe(0);
        expect(row!.status).toBe('DEPLETED');
        expect(row!.version).toBe(1);

        const transactions = await env.DB.prepare(
            `SELECT COUNT(*) AS n FROM voucher_transactions WHERE voucher_id = ?1 AND type = 'REDEEMED'`,
        )
            .bind(voucherId)
            .first<{ n: number }>();
        // Přesně jeden transakční záznam -- ne dva, ani nula.
        expect(transactions!.n).toBe(1);
    });

    it('stejný token poslaný dvakrát (replay) -- druhý pokus zamítnut, zůstatek odečten jen jednou', async () => {
        const voucherId = generateVoucherCode({ expiryYear: new Date().getFullYear() + 1 });
        await seedVoucher(voucherId, 50000);
        const token = await getValidToken(voucherId, 50000);

        const first = await worker.fetch(redeemRequest(token, 'order-replay-1', 50000), bindings, ctx);
        expect(first.status).toBe(200);

        const second = await worker.fetch(redeemRequest(token, 'order-replay-2', 50000), bindings, ctx);
        expect(second.status).toBe(403);
        expect((await second.json()) as { error?: string }).toMatchObject({ error: 'REJECT_REPLAY' });

        const row = await env.DB.prepare(`SELECT current_balance_minor FROM vouchers WHERE id = ?1`)
            .bind(voucherId)
            .first<{ current_balance_minor: number }>();
        expect(row!.current_balance_minor).toBe(0);
    });
});
