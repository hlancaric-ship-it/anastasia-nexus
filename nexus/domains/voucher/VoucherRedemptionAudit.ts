// VoucherRedemptionAudit -- výpočet propadlé částky pro MPV účetnictví.
// (Digital-Voucher.md §18.6, §18.7 -- rozhodnutí Lucky 2026-09-07)
//
// PROČ TO EXISTUJE:
//   U víceúčelového poukazu (MPV, §15b ZDPH) nastává zdanitelné plnění až
//   při dodání zboží. Když zákazník z poukazu na 5 000 Kč nakoupí za 3 000
//   a zbytek propadne, z těch 2 000 se stává **ostatní provozní výnos bez
//   DPH** -- a ten se musí zaúčtovat.
//
//   Shoptet tuhle informaci nikde nedrží: jednorázový kupón se uplatněním
//   spálí a kolik z něj zbylo, se nikdo nedozví. NEXUS to spočítá porovnáním
//   nominálu proti skutečně uplatněné slevě.
//
// CO TENHLE MODUL DĚLÁ A CO NE:
//   DĚLÁ:   čistý výpočet -- nominál mínus uplatněno, s ošetřením případů,
//           kdy vstupy nedávají smysl.
//   NEDĚLÁ: nevolá Shoptet API (to je `ShoptetApiClient`), nezapisuje do D1
//           (to je volající), neřeší retry (to je `IntentExecutor`).
//
// Je to Rule ve smyslu `core/canonical/rules/Rule.ts`: čistá funkce,
// deterministická, bez I/O. Proto se dá otestovat bez sítě i bez databáze.

/** Výsledek auditu jednoho uplatnění. */
export type VoucherAuditOutcome =
    /** Vyčerpáno beze zbytku -- nic k zaúčtování. */
    | {
          readonly kind: 'FULLY_REDEEMED';
          readonly redeemedMinor: number;
          readonly burnedUnclaimedMinor: 0;
      }
    /** Část propadla -- `burnedUnclaimedMinor` jde do účetnictví. */
    | {
          readonly kind: 'PARTIALLY_REDEEMED';
          readonly redeemedMinor: number;
          readonly burnedUnclaimedMinor: number;
      }
    /**
     * Uplatněno VÍC, než byl nominál. Nemělo by nastat -- ale kdyby ano,
     * je to incident, ne záporné číslo k tichému zaúčtování.
     */
    | {
          readonly kind: 'OVER_REDEEMED';
          readonly redeemedMinor: number;
          readonly nominalMinor: number;
      }
    /**
     * Slevám v objednávce nerozumíme. NEZAPISUJE se nula -- ta by
     * v účetnictví znamenala "nic nepropadlo", což může být lež.
     */
    | { readonly kind: 'UNRECOGNISED_DISCOUNTS' }
    /**
     * Slevová položka na objednávce JE, ale nese nulovou částku --
     * typicky procentní kupón, u kterého Shoptet slevu promítl přímo
     * do cen produktů (§18.8). Kolik z poukazu propadlo, z tohohle
     * odvodit nelze; zapsat nulu by byla lež stejně jako u
     * `UNRECOGNISED_DISCOUNTS`.
     */
    | { readonly kind: 'DISCOUNT_NOT_ITEMISED' }
    /** Objednávka žádnou slevu z tohohle poukazu nenese. */
    | { readonly kind: 'NO_VOUCHER_DISCOUNT' };

export interface VoucherAuditInput {
    /** Nominální hodnota poukazu v haléřích. */
    readonly nominalMinor: number;
    /** Součet slev z objednávky (`sumOrderDiscountsMinor`). */
    readonly discountsMinor: number;
    /**
     * `false` = tvaru slev v odpovědi nerozumíme. Musí se propsat, ne
     * spolknout -- viz `UNRECOGNISED_DISCOUNTS`.
     */
    readonly discountsRecognised: boolean;
    /**
     * Objednávka nese slevovou položku, i když s nulovou částkou
     * (`sumOrderDiscountsMinor().couponPresent`).
     *
     * PROČ TO NESTAČÍ ODVODIT Z `discountsMinor === 0`: u procentního
     * kupónu Shoptet slevovou položku vrátí s částkou `0.00`, protože
     * slevu už promítl do cen produktů (§18.8). Nula tedy znamená
     * "kupón tu je, ale hodnotu z něj nevyčteme" -- ne "nic se
     * neuplatnilo". Bez tohohle rozlišení by audit zapsal, že nepropadlo
     * nic, zatímco propadnout mohl celý nominál.
     *
     * Nepovinné kvůli zpětné kompatibilitě volajících; když chybí,
     * chová se nula jako dřív (`NO_VOUCHER_DISCOUNT`).
     */
    readonly couponPresent?: boolean;
}

/**
 * Spočítá, kolik z poukazu propadlo.
 *
 * Fail-loud: kde si nejsme jistí, vrací se stav, který volajícího donutí
 * rozhodnout, místo aby se zapsala nula. Účetní podklad s tichou nulou je
 * horší než chybějící podklad -- ten je aspoň vidět.
 */
export function auditVoucherRedemption(input: VoucherAuditInput): VoucherAuditOutcome {
    const { nominalMinor, discountsMinor, discountsRecognised } = input;

    if (!Number.isSafeInteger(nominalMinor) || nominalMinor <= 0) {
        throw new Error(
            `auditVoucherRedemption: nominalMinor musí být kladné celé číslo haléřů, ` +
                `dostal ${nominalMinor}.`,
        );
    }

    if (!discountsRecognised) {
        return { kind: 'UNRECOGNISED_DISCOUNTS' };
    }

    if (!Number.isSafeInteger(discountsMinor) || discountsMinor < 0) {
        // Záporná nebo nesmyslná sleva není "nula" -- je to nepochopený vstup.
        return { kind: 'UNRECOGNISED_DISCOUNTS' };
    }

    if (discountsMinor === 0) {
        // Slevová položka na objednávce je, jen bez vyčíslené částky.
        // Viz `couponPresent` -- nula tu neznamená "neuplatněno".
        if (input.couponPresent === true) {
            return { kind: 'DISCOUNT_NOT_ITEMISED' };
        }
        return { kind: 'NO_VOUCHER_DISCOUNT' };
    }

    if (discountsMinor > nominalMinor) {
        // Uplatněno víc, než poukaz nesl. Buď objednávka obsahuje i jinou
        // slevu než náš poukaz, nebo se něco pokazilo. V obou případech
        // to musí vidět člověk.
        return { kind: 'OVER_REDEEMED', redeemedMinor: discountsMinor, nominalMinor };
    }

    if (discountsMinor === nominalMinor) {
        return {
            kind: 'FULLY_REDEEMED',
            redeemedMinor: discountsMinor,
            burnedUnclaimedMinor: 0,
        };
    }

    return {
        kind: 'PARTIALLY_REDEEMED',
        redeemedMinor: discountsMinor,
        burnedUnclaimedMinor: nominalMinor - discountsMinor,
    };
}

/**
 * Má se výsledek zapsat do `vouchers.burned_unclaimed_amount`?
 *
 * Jen u `PARTIALLY_REDEEMED` a `FULLY_REDEEMED` -- ostatní stavy znamenají,
 * že hodnotu neznáme, a sloupec musí zůstat `NULL`. `NULL` říká "ještě
 * nevíme"; nula by říkala "nic nepropadlo", a to je jiné tvrzení.
 */
export function shouldPersistBurnedAmount(
    outcome: VoucherAuditOutcome,
): outcome is Extract<VoucherAuditOutcome, { burnedUnclaimedMinor: number }> {
    return outcome.kind === 'PARTIALLY_REDEEMED' || outcome.kind === 'FULLY_REDEEMED';
}

/** Vyžaduje výsledek lidský zásah? */
export function requiresManualReview(outcome: VoucherAuditOutcome): boolean {
    return (
        outcome.kind === 'OVER_REDEEMED' ||
        outcome.kind === 'UNRECOGNISED_DISCOUNTS' ||
        // Kupón uplatněn, částka nevyčíslená -- propadlou hodnotu musí
        // dopočítat člověk z cen produktů, stroj ji z API nedostane.
        outcome.kind === 'DISCOUNT_NOT_ITEMISED'
    );
}
