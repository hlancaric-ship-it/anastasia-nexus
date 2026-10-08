// sumVoucherUnits -- detekce NÁKUPU kreditního poukazu v objednávce (§18 krok 3).
//
// Těžiště: nikdy nevystavit poukaz na odhad. Kde si detekce není jistá,
// musí vrátit `recognised: false` -- vystavit kredit naslepo znamená
// vydat peníze, které nikdo nezaplatil.

import { describe, it, expect } from 'vitest';
import { sumVoucherUnits } from '../../connectors/shoptet/ShoptetApiClient.js';

const VOUCHER = 'KREDIT-1';

/** Položka v tvaru, který Shoptet reálně vrací (§18.8). */
const item = (
    itemType: string,
    code: string | null,
    amount: string | number | undefined,
) => ({ itemType, code, amount, itemPrice: { withVat: '1.00' } });

describe('sumVoucherUnits -- kolik jednotek poukazu objednávka nese', () => {
    it('přečte množství jako hodnotu poukazu (1500 ks = 1500 Kč)', () => {
        const r = sumVoucherUnits(
            { items: [item('product', VOUCHER, '1500.000')] },
            VOUCHER,
        );

        expect(r.recognised).toBe(true);
        expect(r.units).toBe(1500);
    });

    it('sečte tentýž produkt rozdělený do víc řádků', () => {
        // Shoptet položky vždy neslučuje. Vzít jen první řádek by
        // vystavilo poukaz na menší částku, než zákazník zaplatil.
        const r = sumVoucherUnits(
            {
                items: [
                    item('product', VOUCHER, '1000.000'),
                    item('product', 'JINY', '3.000'),
                    item('product', VOUCHER, '500.000'),
                ],
            },
            VOUCHER,
        );

        expect(r.units).toBe(1500);
    });

    it('běžná objednávka bez poukazu → rozpoznaná nula', () => {
        const r = sumVoucherUnits(
            { items: [item('product', 'PRUT-01', '1.000')] },
            VOUCHER,
        );

        expect(r.recognised).toBe(true);
        expect(r.units).toBe(0);
    });

    it('ignoruje neproduktové položky se shodným kódem', () => {
        // Kdyby dopravní nebo slevová položka nesla týž kód, nesmí
        // navýšit kredit.
        const r = sumVoucherUnits(
            {
                items: [
                    item('shipping', VOUCHER, '1.000'),
                    item('discount-coupon', VOUCHER, '1.000'),
                    item('product', VOUCHER, '200.000'),
                ],
            },
            VOUCHER,
        );

        expect(r.units).toBe(200);
    });

    it('chybějící items → recognised: false, ne nula', () => {
        const r = sumVoucherUnits({ code: '2026001620' }, VOUCHER);

        expect(r.recognised).toBe(false);
        expect(r.units).toBe(0);
    });

    it('nečitelné množství shodí detekci -- poukaz JE, hodnotu neznáme', () => {
        const r = sumVoucherUnits(
            { items: [item('product', VOUCHER, 'hodně')] },
            VOUCHER,
        );

        expect(r.recognised).toBe(false);
    });

    it('desetinné množství neprojde -- půl kusu kreditu neexistuje', () => {
        // Tiché zaokrouhlení by měnilo částku poukazu.
        const r = sumVoucherUnits(
            { items: [item('product', VOUCHER, '1500.500')] },
            VOUCHER,
        );

        expect(r.recognised).toBe(false);
    });

    it('nulová desetinná část projde (Shoptet posílá "1500.000")', () => {
        const r = sumVoucherUnits(
            { items: [item('product', VOUCHER, '1500.000')] },
            VOUCHER,
        );

        expect(r.recognised).toBe(true);
        expect(r.units).toBe(1500);
    });

    it('záporné množství neprojde', () => {
        const r = sumVoucherUnits(
            { items: [item('product', VOUCHER, '-100.000')] },
            VOUCHER,
        );

        expect(r.recognised).toBe(false);
    });

    it('prázdný konfigurační kód nematchne nic -- je to chyba, ne nula', () => {
        const r = sumVoucherUnits({ items: [item('product', VOUCHER, '10')] }, '  ');

        expect(r.recognised).toBe(false);
        expect(r.units).toBe(0);
    });

    it('kód se porovnává přesně, ne částečně', () => {
        // "KREDIT-1" nesmí matchnout "KREDIT-10".
        const r = sumVoucherUnits(
            { items: [item('product', 'KREDIT-10', '999.000')] },
            VOUCHER,
        );

        expect(r.recognised).toBe(true);
        expect(r.units).toBe(0);
    });

    it('okolní mezery v kódu položky nevadí', () => {
        const r = sumVoucherUnits(
            { items: [item('product', ' KREDIT-1 ', '50.000')] },
            VOUCHER,
        );

        expect(r.units).toBe(50);
    });
});
