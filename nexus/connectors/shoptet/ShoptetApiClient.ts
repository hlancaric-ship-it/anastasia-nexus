// ShoptetApiClient -- HTTP klient pro Shoptet REST API.
//
// Každé volání prochází `ReadOnlyGuard`. Token, se kterým NEXUS pracuje, je
// PRODUKČNÍ okfish.sk -- zápis je proto blokovaný konstrukčně, ne konvencí.
//
// OVĚŘENO NAŽIVO 7.9.2026 (§17 návrhu):
//   - autentizace hlavičkou `Shoptet-Private-API-Token`
//     (`Shoptet-Access-Token` vrací 401)
//   - `Content-Type: application/vnd.shoptet.v1.0+json`
//   - parametr `?limit=` NENÍ podporovaný (vrací 400)
//
// CO TENHLE KLIENT NEDĚLÁ:
//   - neretryuje. Rozhodnutí o retry patří `IntentExecutor`, který jediný
//     ví, jestli je bezpečný (u UNKNOWN u systému bez idempotence není).
//   - nemapuje na canonical model. To je věc konektoru, ne přenosové vrstvy.

import {
    assertRequestAllowed,
    READ_ONLY,
    type ShoptetAccessMode,
} from './ReadOnlyGuard.js';

const API_BASE = 'https://api.myshoptet.com/api';
const ACCEPT = 'application/vnd.shoptet.v1.0+json';

/** Timeout jednoho volání. Shoptet bývá rychlý; delší čekání je zaseknutí. */
const REQUEST_TIMEOUT_MS = 8000;

export class ShoptetApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        /**
         * `true` = prokazatelně se nic nestalo (4xx). `false` = nevíme
         * (5xx, timeout, síť). Mapuje se na `FAILED` vs `UNKNOWN`
         * v `IntentExecutor` -- proto to nese klient, který jediný zná
         * skutečný status.
         */
        readonly definiteFailure: boolean,
    ) {
        super(message);
        this.name = 'ShoptetApiError';
    }
}

/** Cena, jak ji Shoptet vrací u položky i u objednávky. */
export interface ShoptetPrice {
    readonly withVat?: number | string;
    readonly withoutVat?: number | string;
    readonly vat?: number | string;
    readonly vatRate?: number | string;
}

/**
 * Položka objednávky. Slevy NEJSOU samostatný klíč -- jsou položkami
 * v `items`, rozlišenými polem `itemType` (§18.8, ověřeno 7.9.2026).
 */
export interface ShoptetOrderItem {
    readonly itemType?: string;
    readonly name?: string;
    readonly code?: string | null;
    readonly amount?: number | string;
    readonly itemPrice?: ShoptetPrice;
    readonly unitPrice?: ShoptetPrice;
    readonly [key: string]: unknown;
}

/**
 * Slevové `itemType`, které Shoptet na objednávce používá.
 *
 * OVĚŘENO na 400 objednávkách okfish.sk (7.9.2026): `discount-coupon`
 * (79×) a `volume-discount` (3×). Dřívější odhady `discount` / `coupon`
 * byly OBA špatné a v datech se nevyskytují.
 *
 * Neznámý slevový typ raději nechceme uhodnout -- `sumOrderDiscountsMinor`
 * proto hlásí `recognised: false`, místo aby ho tiše ignorovala.
 */
export const DISCOUNT_ITEM_TYPES: readonly string[] = ['discount-coupon', 'volume-discount'];

/** Nezáporné `itemType`, o kterých víme, že slevou nejsou. */
const NON_DISCOUNT_ITEM_TYPES: readonly string[] = ['product', 'shipping', 'billing', 'gift'];

/**
 * Objednávka -- jen pole, která voucher audit potřebuje.
 *
 * VĚDOMĚ NEÚPLNÉ: modelovat celou objednávku by znamenalo přebírat
 * závislost na tvaru, který se může měnit. Nezmapovaná pole se ignorují.
 */
export interface ShoptetOrder {
    readonly code?: string;
    readonly creationTime?: string;
    readonly price?: ShoptetPrice;
    readonly items?: readonly ShoptetOrderItem[];
    readonly [key: string]: unknown;
}

export class ShoptetApiClient {
    constructor(
        private readonly token: string,
        /** Výchozí read-only. Zápis se musí povolit vědomě. */
        private readonly access: ShoptetAccessMode = READ_ONLY,
    ) {
        if (token.trim() === '') {
            throw new Error('ShoptetApiClient: prázdný token.');
        }
    }

    /**
     * `GET /api/orders/{code}`. Číslo objednávky je to, co přijde
     * ve webhooku jako `eventInstance`.
     */
    async getOrder(orderCode: string): Promise<ShoptetOrder> {
        const body = await this.get(`/orders/${encodeURIComponent(orderCode)}`);
        const order = (body as { data?: { order?: unknown } }).data?.order;

        if (order === undefined || order === null) {
            throw new ShoptetApiError(
                `Objednávka ${orderCode}: odpověď neobsahuje data.order.`,
                200,
                // Odpověď dorazila a byla čitelná -- jen jinak, než čekáme.
                // Retry ji nezmění, takže je to prokazatelné selhání.
                true,
            );
        }

        return order as ShoptetOrder;
    }

    private async get(path: string): Promise<unknown> {
        const url = `${API_BASE}${path}`;

        // Guard PŘED odesláním. U GET projde vždy, ale kontrola tu je
        // proto, aby ji nikdo nemohl obejít přidáním jiné metody.
        assertRequestAllowed({ method: 'GET', url }, this.access);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Shoptet-Private-API-Token': this.token,
                    'Content-Type': ACCEPT,
                },
                signal: controller.signal,
                // Redirect by mohl token poslat na cizí host.
                redirect: 'manual',
            });

            if (!response.ok) {
                throw new ShoptetApiError(
                    `Shoptet API vrátilo ${response.status} pro ${path}.`,
                    response.status,
                    // 4xx = požadavek byl odmítnut, nic se nestalo.
                    // 5xx a 429 = nevíme, server mohl něco udělat a spadnout.
                    response.status >= 400 && response.status < 500 && response.status !== 429,
                );
            }

            return await response.json();
        } catch (error) {
            if (error instanceof ShoptetApiError) throw error;

            const isAbort = error instanceof Error && error.name === 'AbortError';
            throw new ShoptetApiError(
                isAbort
                    ? `Shoptet API timeout po ${REQUEST_TIMEOUT_MS} ms (${path}).`
                    : `Shoptet API selhalo (${path}): ${error instanceof Error ? error.message : String(error)}`,
                0,
                // Timeout ani síťová chyba NEJSOU prokazatelné selhání --
                // požadavek mohl dorazit a odpověď se ztratit.
                false,
            );
        } finally {
            clearTimeout(timer);
        }
    }
}

/**
 * Součet slev na objednávce v HALÉŘÍCH (kladné číslo = o kolik se snižuje).
 *
 * TVAR OVĚŘEN NAŽIVO 7.9.2026 na 400 objednávkách okfish.sk (§18.8):
 * samostatný klíč `discounts` NEEXISTUJE. Slevy jsou položkami v `items`
 * s `itemType` z `DISCOUNT_ITEM_TYPES`, částka je v `itemPrice.withVat`
 * a je ZÁPORNÁ.
 *
 * POZOR NA NULOVÝ KUPÓN -- 78 ze 79 nalezených `discount-coupon` mělo
 * částku `0.00`. Procentní kupón (`Zľava 20%`) je totiž u Shoptetu jen
 * ŠTÍTEK: sleva je už promítnutá do cen jednotlivých produktů, ne do
 * slevové položky. Součet produktů pak sedí na `order.price.withVat`
 * na haléř (ověřeno na 2026001507: 59,46 + 3,90 dopravy = 63,36).
 *
 * DŮSLEDEK PRO AUDIT: nula tady znamená "kupón byl uplatněn, ale jeho
 * hodnotu z téhle položky nevyčteme", NE "nic se neuplatnilo". Proto
 * `couponPresent` -- volající musí obojí rozlišit, jinak by u procentního
 * kupónu spočítal propadlou částku ze špatného základu.
 */
export function sumOrderDiscountsMinor(order: ShoptetOrder): {
    readonly totalMinor: number;
    readonly recognised: boolean;
    /** Objednávka nese slevovou položku (i s nulovou částkou). */
    readonly couponPresent: boolean;
} {
    const items = order.items;

    if (!Array.isArray(items)) {
        // Bez `items` nevíme nic -- typicky zkrácená odpověď ze seznamu
        // `/api/orders`, kde položky nejsou. Audit musí načíst detail.
        return { totalMinor: 0, recognised: false, couponPresent: false };
    }

    let total = 0;
    let couponPresent = false;

    for (const item of items) {
        const type = item?.itemType;
        if (typeof type !== 'string') {
            // Položka bez typu -- nevíme, jestli je to sleva. Nehádáme.
            return { totalMinor: 0, recognised: false, couponPresent };
        }

        if (!DISCOUNT_ITEM_TYPES.includes(type)) {
            // Neznámý typ, který zároveň není v ověřené nezáporné sadě,
            // může být sleva, o které nevíme. Hlásíme, místo abychom ji
            // zahodili a podhodnotili účetní podklad.
            if (!NON_DISCOUNT_ITEM_TYPES.includes(type)) {
                return { totalMinor: 0, recognised: false, couponPresent };
            }
            continue;
        }

        couponPresent = true;

        const parsed = parseAmountToMinor(item.itemPrice?.withVat);
        if (parsed === null) {
            return { totalMinor: 0, recognised: false, couponPresent };
        }

        // Shoptet vrací slevu záporně; audit pracuje s kladnou částkou.
        total += Math.abs(parsed);
    }

    return { totalMinor: total, recognised: true, couponPresent };
}

/**
 * Kolik jednotek kreditního poukazu objednávka obsahuje (§18 krok 3).
 *
 * Hodnota poukazu se tvoří MNOŽSTVÍM produktu za 1 Kč: 1500 Kč = 1500 ks
 * (§1 návrhu). Vrací se proto počet kusů, ne cena -- cenu si NEXUS
 * dopočítá sám a nespoléhá na to, co přišlo z e-shopu.
 *
 * POZOR NA VÍC ŘÁDKŮ: týž produkt může být v objednávce rozdělený do
 * několika položek (Shoptet je neslučuje vždy). Množství se proto sčítá
 * napříč všemi shodami, ne bere z první.
 *
 * `recognised: false` znamená "nevíme" -- chybějící `items` nebo
 * nečitelné množství. Volající NESMÍ takový výsledek brát jako nulu
 * a poukaz nevystavit potichu.
 */
export function sumVoucherUnits(
    order: ShoptetOrder,
    voucherProductCode: string,
): {
    readonly units: number;
    readonly recognised: boolean;
} {
    const wanted = voucherProductCode.trim();
    if (wanted === '') {
        // Prázdný kód by matchnul kdeco. Konfigurační chyba, ne nula.
        return { units: 0, recognised: false };
    }

    const items = order.items;
    if (!Array.isArray(items)) {
        return { units: 0, recognised: false };
    }

    let units = 0;
    for (const item of items) {
        // Jen skutečné produkty -- slevová ani dopravní položka poukaz nenese.
        if (item?.itemType !== 'product') continue;
        if (typeof item.code !== 'string' || item.code.trim() !== wanted) continue;

        const parsed = parseUnitCount(item.amount);
        if (parsed === null) {
            // Poukaz v objednávce JE, ale množství nepřečteme. Vystavit
            // ho na odhad = vydat cizí peníze.
            return { units: 0, recognised: false };
        }
        units += parsed;
    }

    return { units, recognised: true };
}

/**
 * Množství jako celé kusy. Shoptet vrací `"1500.000"`; desetinná část
 * musí být nulová -- půl kusu kreditu neexistuje a tiché zaokrouhlení
 * by měnilo částku.
 */
function parseUnitCount(value: number | string | undefined): number | null {
    if (value === undefined || value === null) return null;

    const text = typeof value === 'number' ? value.toString() : value.trim().replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(text)) return null;

    const numeric = Number(text);
    if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) return null;
    if (!Number.isSafeInteger(numeric)) return null;

    return numeric;
}

/**
 * Částka na celé haléře. Vrací `null` místo hádání -- volající pak ví,
 * že hodnotě nerozumí, místo aby počítal s nulou.
 */
function parseAmountToMinor(value: number | string | undefined): number | null {
    if (value === undefined || value === null) return null;

    const text = typeof value === 'number' ? value.toString() : value.trim().replace(',', '.');
    if (!/^-?\d+(\.\d{1,2})?$/.test(text)) return null;

    const [whole = '0', frac = ''] = text.split('.');
    const negative = whole.startsWith('-');
    const minor = Number(negative ? whole.slice(1) : whole) * 100 + Number(frac.padEnd(2, '0'));

    if (!Number.isSafeInteger(minor)) return null;
    return negative ? -minor : minor;
}
