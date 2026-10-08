// VoucherRedemptionAudit -- výpočet propadlé částky pro MPV účetnictví.
//
// Těžiště: NIKDY tiše nevrátit nulu. Nula v účetním podkladu znamená
// "nic nepropadlo" -- a když to není pravda, klient zaúčtuje špatně.
// Tam, kde si výpočet není jistý, musí vrátit stav, který volajícího
// donutí rozhodnout.

import { describe, it, expect } from 'vitest';
import {
    auditVoucherRedemption,
    shouldPersistBurnedAmount,
    requiresManualReview,
} from '../../domains/voucher/VoucherRedemptionAudit.js';
import { sumOrderDiscountsMinor } from '../../connectors/shoptet/ShoptetApiClient.js';

const recognised = (discountsMinor: number, nominalMinor = 500_00) => ({
    nominalMinor,
    discountsMinor,
    discountsRecognised: true,
});

describe('auditVoucherRedemption -- výpočet propadlé částky', () => {
    it('poukaz 500, nakoupeno za 300 → propadá 200', () => {
        // Přesně scénář z §18.6: z 5000 nakoupeno za 3000, zbytek je
        // ostatní provozní výnos bez DPH.
        const r = auditVoucherRedemption(recognised(300_00));

        expect(r.kind).toBe('PARTIALLY_REDEEMED');
        if (r.kind === 'PARTIALLY_REDEEMED') {
            expect(r.redeemedMinor).toBe(300_00);
            expect(r.burnedUnclaimedMinor).toBe(200_00);
        }
    });

    it('vyčerpáno beze zbytku → nic k zaúčtování', () => {
        const r = auditVoucherRedemption(recognised(500_00));

        expect(r.kind).toBe('FULLY_REDEEMED');
        if (r.kind === 'FULLY_REDEEMED') expect(r.burnedUnclaimedMinor).toBe(0);
    });

    it('propadl celý poukaz kromě haléře', () => {
        const r = auditVoucherRedemption(recognised(1));

        expect(r.kind).toBe('PARTIALLY_REDEEMED');
        if (r.kind === 'PARTIALLY_REDEEMED') expect(r.burnedUnclaimedMinor).toBe(499_99);
    });
});

describe('fail-loud: kde si nejsme jistí, nezapisuje se nula', () => {
    it('nerozpoznaný tvar slev → UNRECOGNISED, ne nula', () => {
        // Kdyby to vrátilo 0, účetní by dostal "nic nepropadlo" -- což
        // může být lež. NULL v databázi říká "ještě nevíme".
        const r = auditVoucherRedemption({
            nominalMinor: 500_00,
            discountsMinor: 0,
            discountsRecognised: false,
        });

        expect(r.kind).toBe('UNRECOGNISED_DISCOUNTS');
        expect(shouldPersistBurnedAmount(r)).toBe(false);
        expect(requiresManualReview(r)).toBe(true);
    });

    it('žádná sleva na objednávce → NO_VOUCHER_DISCOUNT, taky se nezapisuje', () => {
        const r = auditVoucherRedemption(recognised(0));

        expect(r.kind).toBe('NO_VOUCHER_DISCOUNT');
        expect(shouldPersistBurnedAmount(r)).toBe(false);
        // Není to incident -- objednávka prostě poukaz neuplatnila.
        expect(requiresManualReview(r)).toBe(false);
    });

    it('uplatněno VÍC než nominál → OVER_REDEEMED, jde na člověka', () => {
        // Buď objednávka nese i jinou slevu než náš poukaz, nebo se něco
        // pokazilo. Záporné číslo v účetnictví by bylo horší než alert.
        const r = auditVoucherRedemption(recognised(700_00));

        expect(r.kind).toBe('OVER_REDEEMED');
        expect(shouldPersistBurnedAmount(r)).toBe(false);
        expect(requiresManualReview(r)).toBe(true);
    });

    it('záporná sleva se bere jako nepochopený vstup', () => {
        const r = auditVoucherRedemption(recognised(-100));
        expect(r.kind).toBe('UNRECOGNISED_DISCOUNTS');
    });

    it('neceločíselné haléře se berou jako nepochopený vstup', () => {
        const r = auditVoucherRedemption(recognised(100.5));
        expect(r.kind).toBe('UNRECOGNISED_DISCOUNTS');
    });

    it('nesmyslný nominál je chyba volajícího, ne business stav', () => {
        // Poukaz s nulovou nebo zápornou hodnotou nemohl vzniknout --
        // je to bug, ne případ k zaúčtování.
        expect(() => auditVoucherRedemption(recognised(100, 0))).toThrow(/kladné celé číslo/);
        expect(() => auditVoucherRedemption(recognised(100, -5))).toThrow();
    });
});

describe('sumOrderDiscountsMinor -- čtení slev z odpovědi Shoptetu', () => {
    /** Položka objednávky v tvaru, který Shoptet reálně vrací (§18.8). */
    const item = (itemType: string, withVat: string | number | undefined, name = 'x') => ({
        itemType,
        name,
        code: null,
        amount: '1.000',
        itemPrice: { withVat, withoutVat: '0.00', vat: '0.00', vatRate: '23.00' },
    });

    it('sečte slevové položky podle itemType, záporné bere jako kladnou částku', () => {
        // Reálný tvar z objednávky 2026001625: kupón -50,00 EUR.
        const r = sumOrderDiscountsMinor({
            code: '2026001625',
            items: [
                item('product', '51.11'),
                item('billing', '1.90'),
                item('discount-coupon', '-50.00', 'Zľavový kupón číslo 72494069 - Zľava €50'),
            ],
        });

        expect(r.recognised).toBe(true);
        expect(r.couponPresent).toBe(true);
        expect(r.totalMinor).toBe(50_00);
    });

    it('započítá i volume-discount, nejen kupón', () => {
        // Reálný tvar z objednávky 2026001513.
        const r = sumOrderDiscountsMinor({
            items: [item('product', '107.10'), item('volume-discount', '-50.00', 'Zľava')],
        });

        expect(r.recognised).toBe(true);
        expect(r.totalMinor).toBe(50_00);
    });

    it('procentní kupón s nulovou částkou → couponPresent, ne "žádná sleva"', () => {
        // Reálný tvar z 2026001507: sleva je promítnutá do cen produktů,
        // slevová položka je jen štítek s 0.00. 78 ze 79 kupónů v produkci
        // vypadá takhle -- kdyby se to spletlo s nulovou slevou, audit by
        // tvrdil, že nepropadlo nic.
        const r = sumOrderDiscountsMinor({
            items: [
                item('product', '59.46'),
                item('shipping', '3.90'),
                item('discount-coupon', '0.00', 'Zľavový kupón číslo LETO2026 - Zľava 20%'),
            ],
        });

        expect(r.recognised).toBe(true);
        expect(r.couponPresent).toBe(true);
        expect(r.totalMinor).toBe(0);
    });

    it('objednávka bez slevových položek → rozpoznaná nula, ne nejistota', () => {
        // Tvar `items` známe, takže absence slevy JE informace.
        const r = sumOrderDiscountsMinor({
            items: [item('product', '59.46'), item('shipping', '3.90'), item('gift', '0.00')],
        });

        expect(r.recognised).toBe(true);
        expect(r.couponPresent).toBe(false);
        expect(r.totalMinor).toBe(0);
    });

    it('chybějící items → recognised: false (zkrácená odpověď ze seznamu)', () => {
        const r = sumOrderDiscountsMinor({ code: '2026001620' });

        expect(r.recognised).toBe(false);
        expect(r.totalMinor).toBe(0);
    });

    it('neznámý itemType shodí rozpoznání -- mohla by to být sleva', () => {
        const r = sumOrderDiscountsMinor({
            items: [item('product', '59.46'), item('loyalty-bonus', '-10.00')],
        });

        expect(r.recognised).toBe(false);
    });

    it('položka bez itemType se nehádá', () => {
        const r = sumOrderDiscountsMinor({ items: [{ name: 'záhada', itemPrice: {} }] });
        expect(r.recognised).toBe(false);
    });

    it('nečitelná částka slevy shodí celý součet', () => {
        // Sečíst zbytek a tvářit se, že je to celé, by byla lež.
        const r = sumOrderDiscountsMinor({
            items: [
                item('discount-coupon', '-300.00'),
                item('volume-discount', 'sleva 20 %'),
            ],
        });

        expect(r.recognised).toBe(false);
    });

    it('desetinná čárka místo tečky projde', () => {
        const r = sumOrderDiscountsMinor({ items: [item('discount-coupon', '-199,90')] });
        expect(r.totalMinor).toBe(199_90);
    });

    it('tři desetinná místa neprojdou -- to je float chyba výš', () => {
        const r = sumOrderDiscountsMinor({ items: [item('discount-coupon', '-1.955')] });
        expect(r.recognised).toBe(false);
    });
});

describe('celý tok §18.7 -- od odpovědi API k účetnímu podkladu', () => {
    const discountItem = (withVat: string, itemType = 'discount-coupon') => ({
        itemType,
        itemPrice: { withVat },
    });

    const runAudit = (order: Parameters<typeof sumOrderDiscountsMinor>[0], nominalMinor: number) => {
        const sum = sumOrderDiscountsMinor(order);
        return auditVoucherRedemption({
            nominalMinor,
            discountsMinor: sum.totalMinor,
            discountsRecognised: sum.recognised,
            couponPresent: sum.couponPresent,
        });
    };

    it('objednávka se slevou 300 z poukazu 500 → zapsat 200', () => {
        const audit = runAudit(
            { code: '2026001620', items: [discountItem('-300.00')] },
            500_00,
        );

        expect(shouldPersistBurnedAmount(audit)).toBe(true);
        if (shouldPersistBurnedAmount(audit)) {
            expect(audit.burnedUnclaimedMinor).toBe(200_00);
        }
    });

    it('zkrácená odpověď bez items → NULL v databázi, ne nula', () => {
        const audit = runAudit({ code: '2026001621' }, 500_00);

        expect(audit.kind).toBe('UNRECOGNISED_DISCOUNTS');
        expect(shouldPersistBurnedAmount(audit)).toBe(false);
    });

    it('procentní kupón (0.00) → DISCOUNT_NOT_ITEMISED a ruční kontrola', () => {
        // Nejčastější reálný případ. Nula tu neznamená "nic se
        // neuplatnilo" -- zapsat ji by bylo účetně nepravdivé.
        const audit = runAudit(
            { items: [{ itemType: 'product', itemPrice: { withVat: '59.46' } }, discountItem('0.00')] },
            500_00,
        );

        expect(audit.kind).toBe('DISCOUNT_NOT_ITEMISED');
        expect(shouldPersistBurnedAmount(audit)).toBe(false);
        expect(requiresManualReview(audit)).toBe(true);
    });

    it('objednávka bez jakékoli slevy → NO_VOUCHER_DISCOUNT, bez eskalace', () => {
        const audit = runAudit(
            { items: [{ itemType: 'product', itemPrice: { withVat: '59.46' } }] },
            500_00,
        );

        expect(audit.kind).toBe('NO_VOUCHER_DISCOUNT');
        expect(shouldPersistBurnedAmount(audit)).toBe(false);
        expect(requiresManualReview(audit)).toBe(false);
    });
});
