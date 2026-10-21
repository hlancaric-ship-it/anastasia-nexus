import {
  BANK_TRANSFER_PROVIDER_ID, COD_PROVIDER_ID, STRIPE_PROVIDER_ID, CheckoutChoiceError,
  assertDeliveryPaymentConsistency, bankTransferInstructions, freeShippingThreshold, paymentMethodByProvider,
  resolvePhysicalShippingType, safeOrderPaymentMethod, shippingSatisfied, variableSymbol,
} from "../delivery-payment"
import { buildShippingOptionInputs } from "../../../scripts/anastasia-bootstrap"
import { grantEntitlementsForOrder } from "../../../modules/entitlement/order-sync"
import { isOrderPaid } from "../../../modules/entitlement/policy"
import { BankTransferPaymentProvider, CodPaymentProvider } from "../../../modules/payment-manual/service"

const physical = { hasPhysical: true, hasDigital: false, physicalProfileIds: ["sp_p"], digitalProfileIds: [], methodTypes: [] as any[] }
const digital = { hasPhysical: false, hasDigital: true, physicalProfileIds: [], digitalProfileIds: ["sp_d"], methodTypes: [] as any[] }
const code = (fn: () => unknown) => { try { fn(); return null } catch (e) { return e instanceof CheckoutChoiceError ? e.code : String(e) } }

describe("výber dopravy a platby (server)", () => {
  it("dobierka len s fyzickým tovarom a kuriérom → server zvolí kuriéra na dobierku", () => {
    expect(resolvePhysicalShippingType(physical, "courier", "cod")).toBe("courier_cod")
    expect(code(() => resolvePhysicalShippingType(physical, "pickup", "cod"))).toBe("COD_NOT_AVAILABLE")
    expect(resolvePhysicalShippingType(physical, "pickup", "bank_transfer")).toBe("pickup")
    expect(resolvePhysicalShippingType(physical, "courier", "card")).toBe("courier")
    expect(code(() => resolvePhysicalShippingType(physical, undefined, "card"))).toBe("DELIVERY_REQUIRED")
  })
  it("zakáže dobierku pre čisto digitálny košík (starý web enableForEp=0)", () => {
    expect(code(() => resolvePhysicalShippingType(digital, "courier", "cod"))).toBe("COD_NOT_AVAILABLE")
    expect(resolvePhysicalShippingType(digital, undefined, "bank_transfer")).toBeNull()
    expect(resolvePhysicalShippingType(digital, undefined, "card")).toBeNull()
  })
  it("checkout odmietne nekonzistentnú dobierku aj pri obídení pokladne cez Store API", () => {
    expect(code(() => assertDeliveryPaymentConsistency({ ...digital, methodTypes: ["digital"] }, [COD_PROVIDER_ID]))).toBe("COD_NOT_AVAILABLE")
    expect(code(() => assertDeliveryPaymentConsistency({ ...physical, methodTypes: ["courier"] }, [COD_PROVIDER_ID]))).toBe("COD_NOT_AVAILABLE")
    expect(code(() => assertDeliveryPaymentConsistency({ ...physical, methodTypes: ["courier_cod"] }, [STRIPE_PROVIDER_ID]))).toBe("COD_SHIPPING_WITHOUT_COD_PAYMENT")
    expect(code(() => assertDeliveryPaymentConsistency({ ...physical, methodTypes: [undefined as any] }, [STRIPE_PROVIDER_ID]))).toBe("SHIPPING_OPTION_UNKNOWN")
    expect(code(() => assertDeliveryPaymentConsistency({ ...physical, methodTypes: ["courier_cod"] }, [COD_PROVIDER_ID]))).toBeNull()
    expect(code(() => assertDeliveryPaymentConsistency({ ...physical, methodTypes: ["pickup"] }, [BANK_TRANSFER_PROVIDER_ID]))).toBeNull()
  })
  it("doprava zdarma od 60 €: kuriér 6 € → 0 €, poplatok za dobierku zostáva 2 € s DPH", () => {
    const options = buildShippingOptionInputs({ regionId: "reg_1", physicalZoneId: "z", digitalZoneId: "zd", physicalProfileId: "sp_p", digitalProfileId: "sp_d", freeShippingFromEur: 60 })
    const toPrices = (o: any) => o.prices.map((p: any) => ({ amount: p.amount, price_rules: (p.rules || []).map((r: any) => ({ ...r })) }))
    const courier = options.find((o) => o.type.code === "courier")!
    const cod = options.find((o) => o.type.code === "courier_cod")!
    expect(freeShippingThreshold(toPrices(courier))).toBe(60)
    expect(freeShippingThreshold(toPrices(cod))).toBeNull() // dobierka nie je „zadarmo“, len bez ceny dopravy
    // Rozdiel cien (= poplatok, ktorý server vracia ako fee) je 2 € pod aj nad hranicou.
    const base = (o: any) => o.prices.find((p: any) => !p.rules).amount
    const free = (o: any) => o.prices.find((p: any) => p.rules).amount
    expect(base(cod) - base(courier)).toBe(2)
    expect(free(cod) - free(courier)).toBe(2)
  })
  it("platba sa nepripraví bez dopravy pre každý prepravný profil", () => {
    const items = [{ requires_shipping: true, product: { shipping_profile: { id: "sp_p" } } }, { requires_shipping: false, product: { shipping_profile: { id: "sp_d" } } }]
    expect(shippingSatisfied(items, [])).toBe(false)
    expect(shippingSatisfied(items, ["sp_d"])).toBe(false)
    expect(shippingSatisfied(items, ["sp_p"])).toBe(true)
    expect(shippingSatisfied([{ requires_shipping: true, product: null }], ["sp_p"])).toBe(false)
  })
  it("prevod: IBAN Tatra banky a VS = číslo objednávky", () => {
    expect(bankTransferInstructions({ display_id: 1042, total: 66, currency_code: "eur" })).toMatchObject({ iban: "SK17 1100 0000 0026 2409 8906", bank: "Tatra banka", variable_symbol: "1042", amount: 66 })
    expect(bankTransferInstructions({ display_id: "x1", total: 66 })).toBeNull()
    expect(variableSymbol("12345678901")).toBeNull()
  })
  it("provider ↔ kód metódy a SafeOrder mapovanie", () => {
    expect(paymentMethodByProvider(COD_PROVIDER_ID)).toBe("cod")
    expect(paymentMethodByProvider(BANK_TRANSFER_PROVIDER_ID)).toBe("bank_transfer")
    expect(paymentMethodByProvider(STRIPE_PROVIDER_ID)).toBe("card")
    expect(safeOrderPaymentMethod(COD_PROVIDER_ID)).toBe("cod")
    expect(safeOrderPaymentMethod(BANK_TRANSFER_PROVIDER_ID)).toBe("bank_transfer")
    expect(safeOrderPaymentMethod(STRIPE_PROVIDER_ID)).toBe(STRIPE_PROVIDER_ID)
  })
})

describe("manuálne platby (dobierka, prevod)", () => {
  it.each([[CodPaymentProvider, "cod"], [BankTransferPaymentProvider, "bank_transfer"]] as const)("%p len autorizuje – nič nestiahne", async (Provider, identifier) => {
    expect(Provider.identifier).toBe(identifier)
    const provider = new Provider({}, {})
    expect((await provider.initiatePayment({ amount: 10, currency_code: "eur" } as any)).status).toBe("pending")
    expect((await provider.authorizePayment({ data: {} } as any)).status).toBe("authorized")
  })
  it("prevod → objednávka nezaplatená a bez prístupov, po prijatí platby (capture) prístup vznikne", async () => {
    const unpaid = { id: "o1", status: "pending", total: 38, customer_id: "cus_1", items: [{ id: "i1", product_id: "p_ep", variant_id: "v1" }],
      payment_collections: [{ captured_amount: 0, refunded_amount: 0, payments: [{ captured_at: null, provider_id: BANK_TRANSFER_PROVIDER_ID }] }] }
    const captured = { ...unpaid, payment_collections: [{ captured_amount: 38, refunded_amount: 0, payments: [{ captured_at: "2026-10-21T10:00:00Z", provider_id: BANK_TRANSFER_PROVIDER_ID }] }] }
    expect(isOrderPaid(unpaid)).toBe(false)
    let order: any = unpaid
    const grant = jest.fn(async (input: any) => ({ entitlement: { id: "ent_1", ...input }, created: true }))
    const container: any = { resolve: (key: string) => key === "entitlement" ? { grant } : key === "query"
      ? { graph: async ({ entity }: any) => ({ data: entity === "order" ? [order] : [{ id: "p_ep", metadata: { digital: true }, shipping_profile: { type: "digital" } }] }) }
      : { warn: jest.fn(), info: jest.fn(), error: jest.fn() } }
    expect(await grantEntitlementsForOrder(container, "o1")).toMatchObject({ skipped: "NOT_PAID", granted: [] })
    expect(grant).not.toHaveBeenCalled()
    order = captured
    expect((await grantEntitlementsForOrder(container, "o1")).granted).toEqual(["ent_1"])
  })
})
