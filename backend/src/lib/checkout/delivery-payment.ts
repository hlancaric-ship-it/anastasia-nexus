import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * Doprava a platby 1:1 podľa starého webu (ecTransportType, ecPaymentType, ecSysConst):
 * - Kuriér 6,00 € s DPH, zdarma od 60,00 € hodnoty tovaru (`item_total`, nativne pravidlo ceny Medusa),
 * - Osobný odber 0 € (Lucrat spol. s r.o., Sokolská 88, 960 01 Zvolen),
 * - Na dobierku +2,00 € s DPH – len fyzický tovar a len s kuriérom (enableForEp=0),
 * - Kartou online (Stripe), Prevodom na účet (VS = číslo objednávky).
 *
 * Poplatok za dobierku je súčasťou ceny samostatnej možnosti dopravy „Kuriér – na dobierku“
 * (8 € / 2 € pri doprave zdarma). Je to riadna položka objednávky s DPH, cenu drží Medusa v DB
 * a upraviť ju jde v adminu; klient ju nikdy neposiela ani nepočíta. Výber dopravy a platby robí
 * výhradne server (`/store/nexus-checkout/options`), checkout ich konzistenciu znova overí.
 */

export const STRIPE_PROVIDER_ID = "pp_stripe_stripe"
export const COD_PROVIDER_ID = "pp_cod_cod"
export const BANK_TRANSFER_PROVIDER_ID = "pp_bank_transfer_bank_transfer"

export type PaymentMethodCode = "cod" | "card" | "bank_transfer"
export type DeliveryCode = "courier" | "pickup"
export type ShippingTypeCode = "courier" | "courier_cod" | "pickup" | "digital"

/** Poradie ako na starom webe. */
export const PAYMENT_METHODS: ReadonlyArray<{ code: PaymentMethodCode; provider_id: string; label: string }> = [
  { code: "cod", provider_id: COD_PROVIDER_ID, label: "Na dobierku" },
  { code: "card", provider_id: STRIPE_PROVIDER_ID, label: "Kartou online" },
  { code: "bank_transfer", provider_id: BANK_TRANSFER_PROVIDER_ID, label: "Prevodom na účet" },
]

export const MANUAL_PROVIDER_IDS: ReadonlySet<string> = new Set([COD_PROVIDER_ID, BANK_TRANSFER_PROVIDER_ID])

export function paymentMethodByProvider(providerId: string | null | undefined): PaymentMethodCode | null {
  return PAYMENT_METHODS.find((method) => method.provider_id === providerId)?.code ?? null
}

/** SafeOrder (NEXUS) pozná dobierku podľa kódu `cod`; ostatné providery idú pod vlastným ID. */
export function safeOrderPaymentMethod(providerId: string): string {
  if (providerId === COD_PROVIDER_ID) return "cod"
  if (providerId === BANK_TRANSFER_PROVIDER_ID) return "bank_transfer"
  return providerId
}

/** Platobné údaje pre prevod (zo starého webu, verejné údaje predávajúceho). */
export const BANK_TRANSFER_ACCOUNT = {
  beneficiary: "LUCRAT spol. s r.o.",
  bank: "Tatra banka",
  iban: "SK17 1100 0000 0026 2409 8906",
  swift: "TATRSKBX",
} as const

export const PICKUP_ADDRESS = "Lucrat spol. s r.o., Sokolská 88, 960 01 Zvolen"

/** Variabilný symbol = číslo objednávky (len číslice, max. 10 znakov). */
export function variableSymbol(displayId: unknown): string | null {
  const value = typeof displayId === "number" ? String(displayId) : typeof displayId === "string" ? displayId.trim() : ""
  return /^\d{1,10}$/.test(value) ? value : null
}

export type BankTransferInstructions = typeof BANK_TRANSFER_ACCOUNT & { variable_symbol: string; amount: number; currency_code: string }

export function bankTransferInstructions(order: { display_id?: unknown; total?: unknown; currency_code?: string | null }): BankTransferInstructions | null {
  const vs = variableSymbol(order.display_id)
  const amount = amountValue(order.total)
  if (!vs || !Number.isFinite(amount) || amount <= 0) return null
  return { ...BANK_TRANSFER_ACCOUNT, variable_symbol: vs, amount, currency_code: (order.currency_code || "eur").toLowerCase() }
}

export function amountValue(value: unknown): number {
  const numeric = typeof value === "object" && value !== null ? (value as any).numeric ?? (value as any).value : value
  if (typeof numeric !== "number" && (typeof numeric !== "string" || !numeric.trim())) return NaN
  return Number(numeric)
}

export class CheckoutChoiceError extends Error {
  constructor(public code: string, public status = 400) {
    super(code)
  }
}

type Container = Pick<MedusaContainer, "resolve">

export type CartShape = {
  hasPhysical: boolean
  hasDigital: boolean
  /** shipping_profile_id fyzického tovaru (default profil) */
  physicalProfileIds: string[]
  digitalProfileIds: string[]
  /** typ (code) zvolených možností dopravy */
  methodTypes: ShippingTypeCode[]
}

/**
 * Z ID profilov položiek a ID zvolených možností dopravy zistí, čo je v košíku fyzické a čo
 * zvolila zákazníčka. Typy berie z DB (shipping_profile.type, shipping_option.type.code),
 * nikdy z requestu.
 */
export async function loadCartShape(container: Container, input: { profileIds: string[]; shippingOptionIds: string[] }): Promise<CartShape> {
  const profileIds = [...new Set(input.profileIds.filter(Boolean))]
  const optionIds = [...new Set(input.shippingOptionIds.filter(Boolean))]
  const query = profileIds.length || optionIds.length ? container.resolve(ContainerRegistrationKeys.QUERY) as any : null
  const [profiles, options] = await Promise.all([
    profileIds.length ? query!.graph({ entity: "shipping_profile", fields: ["id", "type"], filters: { id: profileIds } }) : { data: [] },
    optionIds.length ? query!.graph({ entity: "shipping_option", fields: ["id", "type.code"], filters: { id: optionIds } }) : { data: [] },
  ])
  const typeById = new Map<string, string>((profiles.data || []).map((p: any) => [p.id, p.type]))
  if (profileIds.some((id) => !typeById.has(id))) throw new CheckoutChoiceError("SHIPPING_PROFILE_UNKNOWN", 409)
  const digitalProfileIds = profileIds.filter((id) => typeById.get(id) === "digital")
  const physicalProfileIds = profileIds.filter((id) => typeById.get(id) !== "digital")
  const codeById = new Map<string, string>((options.data || []).map((o: any) => [o.id, o.type?.code]))
  const methodTypes = input.shippingOptionIds.filter(Boolean).map((id) => codeById.get(id) as ShippingTypeCode)
  return { hasPhysical: physicalProfileIds.length > 0, hasDigital: digitalProfileIds.length > 0, physicalProfileIds, digitalProfileIds, methodTypes }
}

/**
 * Pravidlá výberu (čistá funkcia):
 * - fyzický tovar vyžaduje kuriéra alebo osobný odber,
 * - dobierka len pri fyzickom tovare a kuriérovi (starý web: enableForEp=0),
 * - digitálny košík doručenie nemá.
 * Vracia typ fyzickej možnosti dopravy, ktorý má server nastaviť (alebo null pri čisto digitálnom košíku).
 */
export function resolvePhysicalShippingType(shape: Pick<CartShape, "hasPhysical">, delivery: DeliveryCode | null | undefined, payment: PaymentMethodCode): ShippingTypeCode | null {
  if (!shape.hasPhysical) {
    if (payment === "cod") throw new CheckoutChoiceError("COD_NOT_AVAILABLE")
    return null
  }
  if (delivery !== "courier" && delivery !== "pickup") throw new CheckoutChoiceError("DELIVERY_REQUIRED")
  if (payment === "cod") {
    if (delivery !== "courier") throw new CheckoutChoiceError("COD_NOT_AVAILABLE")
    return "courier_cod"
  }
  return delivery
}

/**
 * Konzistencia pred vytvorením objednávky (validate hook completeCart). Platí pre každú cestu
 * dokončenia, aj keby niekto obišiel `/store/nexus-checkout/options` priamo Store API:
 * dobierka ⇔ možnosť dopravy „courier_cod“, a len s fyzickým tovarom. Neznámy typ zvolenej
 * možnosti dopravy = fail closed.
 */
export function assertDeliveryPaymentConsistency(shape: CartShape, providerIds: string[]): void {
  const cod = providerIds.filter((id) => id === COD_PROVIDER_ID)
  const codShipping = shape.methodTypes.filter((type) => type === "courier_cod").length
  if (shape.methodTypes.some((type) => !type)) throw new CheckoutChoiceError("SHIPPING_OPTION_UNKNOWN", 409)
  if (cod.length) {
    if (!shape.hasPhysical || codShipping !== 1 || cod.length !== providerIds.length) throw new CheckoutChoiceError("COD_NOT_AVAILABLE", 409)
  } else if (codShipping) {
    throw new CheckoutChoiceError("COD_SHIPPING_WITHOUT_COD_PAYMENT", 409)
  }
  // Povinnosť dopravy pre fyzický tovar overuje sama Medusa (validateShippingStep v completeCart).
}

/** Najvyššia hranica „zdarma“ z pravidiel ceny (item_total gte X → 0 €). */
export function freeShippingThreshold(prices: Array<{ amount?: unknown; currency_code?: string | null; price_rules?: Array<{ attribute?: string; operator?: string; value?: unknown }> | null }> | null | undefined): number | null {
  let threshold: number | null = null
  for (const price of prices || []) {
    if (amountValue(price.amount) !== 0) continue
    for (const rule of price.price_rules || []) {
      const value = Number(rule.value)
      if (rule.attribute === "item_total" && (rule.operator === "gte" || rule.operator === "gt") && Number.isFinite(value) && value > 0) {
        threshold = threshold === null ? value : Math.min(threshold, value)
      }
    }
  }
  return threshold
}

/**
 * Rovnaké pravidlo ako Medusa validateShippingStep v completeCart: každá položka s `requires_shipping`
 * musí mať zvolenú dopravu pre svoj prepravný profil. Kontroluje sa PRED vytvorením platby,
 * aby zákazníčka nezaplatila za košík, z ktorého objednávka nemôže vzniknúť.
 */
export function shippingSatisfied(
  items: Array<{ requires_shipping?: boolean | null; product?: { shipping_profile?: { id?: string | null } | null } | null } | null> | null | undefined,
  methodProfileIds: Array<string | null | undefined>,
): boolean {
  const covered = new Set(methodProfileIds.filter(Boolean))
  return (items || []).filter((item) => item?.requires_shipping).every((item) => {
    const profile = item?.product?.shipping_profile?.id
    return Boolean(profile && covered.has(profile))
  })
}

export async function assertCartShippingReady(container: Container, cartId: string): Promise<void> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data } = await query.graph({
    entity: "cart",
    fields: ["id", "items.id", "items.requires_shipping", "items.product.shipping_profile.id", "shipping_methods.shipping_option_id"],
    filters: { id: cartId },
  })
  const cart = data?.[0]
  if (!cart) throw new CheckoutChoiceError("CART_NOT_FOUND", 404)
  const optionIds = (cart.shipping_methods || []).map((m: any) => m?.shipping_option_id).filter(Boolean)
  const options = optionIds.length ? (await query.graph({ entity: "shipping_option", fields: ["id", "shipping_profile_id"], filters: { id: optionIds } })).data || [] : []
  if (!shippingSatisfied(cart.items, options.map((o: any) => o.shipping_profile_id))) throw new CheckoutChoiceError("SHIPPING_REQUIRED", 409)
}
