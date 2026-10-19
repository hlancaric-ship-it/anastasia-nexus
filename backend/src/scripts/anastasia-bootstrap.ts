import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  createCustomerGroupsWorkflow,
  createDefaultsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateRegionsWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"
import { resolveDeployEnv } from "../lib/deploy-env"

/**
 * Bootstrap e-shopu ANASTASIA (LUCRAT s.r.o., SK).
 *
 * Spuštění (idempotentní, lze opakovat):
 *   npx medusa exec ./src/scripts/anastasia-bootstrap.ts
 * Na Medusa Cloud (bez `medusa exec`) ho spouští data migration script
 * src/migration-scripts/anastasia-bootstrap.ts při prvním deployi prostředí.
 *
 * Vytvoří: store (EUR), sales channel, publishable API klíč, region Slovensko (EUR, ceny
 * včetně DPH), daňové sazby SK, sklad, shipping profily + možnosti (zásilka, digitální
 * bez dopravy), zákaznické skupiny věrnostních úrovní.
 *
 * Cenotvorba (slevy, věrnost) zde NENÍ - ta je výhradně na backendu přes NEXUS
 * (src/api/store/nexus-cart). Tento skript jen zakládá základní entity.
 */

// ---------------------------------------------------------------------------
// Konfigurace (čisté funkce a konstanty - pokryto unit testy)
// ---------------------------------------------------------------------------

export const CURRENCY_CODE = "eur"
export const STORE_NAME = "ANASTASIA"
export const SALES_CHANNEL_NAME = "ANASTASIA e-shop"
export const REGION_NAME = "Slovensko"
export const API_KEY_TITLE = "ANASTASIA storefront"
export const STOCK_LOCATION_NAME = "Sklad ANASTASIA"
export const PHYSICAL_FULFILLMENT_SET_NAME = "Zásielky - Slovensko"
export const DIGITAL_FULFILLMENT_SET_NAME = "Digitálne produkty"
export const DIGITAL_PROFILE_NAME = "Digitálne produkty"
export const STRIPE_PROVIDER_ID = "pp_stripe_stripe"
export const SYSTEM_PROVIDER_ID = "pp_system_default"
/** Klub ANASTASIA: samostatný Stripe provider pro členství (první platba i obnova). */
export const MEMBERSHIP_PROVIDER_ID = "pp_membership_stripe_membership"
export const TAX_PROVIDER_ID = "tp_system"

/**
 * Sazby DPH SR platné od 1. 1. 2025: základní 23 %, snížená 19 % a 5 %.
 * Starý e-shop (ecProductPrice.vatRate) používal hlavně 23 % (27 z 30 cen), dále 19 a 20 %
 * (20 % = sazba před 2025). Ceny ve starém e-shopu jsou koncové včetně DPH
 * (price_1_WithVat), proto je region v Medusě "tax inclusive".
 * Sazby před ostrým provozem potvrdit s účetní.
 */
export const SK_VAT_RATES = [
  { code: "SK-DPH-23", name: "DPH SR 23 % (základní)", rate: 23, is_default: true },
  { code: "SK-DPH-19", name: "DPH SR 19 % (snížená)", rate: 19, is_default: false },
  { code: "SK-DPH-5", name: "DPH SR 5 % (snížená)", rate: 5, is_default: false },
] as const

/**
 * Věrnostní úrovně jako zákaznické skupiny. POZOR: NEXUS adapter
 * (src/api/store/nexus-cart/route.ts) dnes rozpoznává úroveň jen z názvu skupiny
 * ve tvaru /^ZR\d+$/. Mapování na kód NEXUS tieru je proto uloženo v metadata.nexus_tier
 * a musí odpovídat klíčům loyaltyTiers v MEDUSA_PRICING_POLICY_JSON.
 */
export const LOYALTY_GROUPS = [
  { name: "Bronze", nexus_tier: "ZR1", rank: 1 },
  { name: "Silver", nexus_tier: "ZR2", rank: 2 },
  { name: "Gold", nexus_tier: "ZR3", rank: 3 },
  { name: "VIP", nexus_tier: "ZR4", rank: 4 },
] as const

/** Doprava z DB starého e-shopu: kurýr 6,00 EUR s DPH. */
export const COURIER_PRICE_EUR = 6

/**
 * Doprava zdarma od částky (EUR s DPH, `item_total` košíku) – nativní pravidlo ceny Medusa
 * shipping option, uložené v DB a upravitelné v adminu. Nevyplněno = bez dopravy zdarma
 * (hodnotu určí Lucky). Medusa cenu dopravy přepočítá při každé změně košíku.
 */
export function parseFreeShippingThreshold(raw: string | undefined): number | null {
  const value = (raw ?? "").trim()
  if (!value) return null
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(value) || Number(value) <= 0) {
    throw new Error(`Invalid ANASTASIA_FREE_SHIPPING_FROM_EUR: "${value}" (expected positive EUR amount, max 2 decimals)`)
  }
  return Number(value)
}

export function parseCountries(raw: string | undefined): string[] {
  const list = (raw || "sk")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean)
  const unique = Array.from(new Set(list))
  if (!unique.length) {
    throw new Error("ANASTASIA_REGION_COUNTRIES must contain at least one country code")
  }
  for (const code of unique) {
    if (!/^[a-z]{2}$/.test(code)) {
      throw new Error(`Invalid ISO-2 country code in ANASTASIA_REGION_COUNTRIES: "${code}"`)
    }
  }
  return unique
}

export function pickPaymentProviders(availableIds: string[], isProduction: boolean): string[] {
  if (availableIds.includes(STRIPE_PROVIDER_ID)) {
    return availableIds.includes(MEMBERSHIP_PROVIDER_ID) ? [STRIPE_PROVIDER_ID, MEMBERSHIP_PROVIDER_ID] : [STRIPE_PROVIDER_ID]
  }
  if (isProduction) {
    throw new Error(`Payment provider ${STRIPE_PROVIDER_ID} is not registered; set STRIPE_API_KEY and STRIPE_WEBHOOK_SECRET`)
  }
  return [SYSTEM_PROVIDER_ID]
}

const SHIPPING_RULES = [
  { attribute: "enabled_in_store", value: "true", operator: "eq" as const },
  { attribute: "is_return", value: "false", operator: "eq" as const },
]

export function buildShippingOptionInputs(args: {
  regionId: string
  physicalZoneId: string
  digitalZoneId: string
  physicalProfileId: string
  digitalProfileId: string
  freeShippingFromEur?: number | null
}) {
  const free = args.freeShippingFromEur
  const freeRules = free ? [{ attribute: "item_total", operator: "gte" as const, value: free }] : null
  return [
    {
      name: "Kuriér (zásielka)",
      price_type: "flat" as const,
      provider_id: "manual_manual",
      service_zone_id: args.physicalZoneId,
      shipping_profile_id: args.physicalProfileId,
      type: { label: "Kuriér", description: "Doručenie zásielky kuriérom.", code: "courier" },
      prices: [
        { currency_code: CURRENCY_CODE, amount: COURIER_PRICE_EUR },
        { region_id: args.regionId, amount: COURIER_PRICE_EUR },
        ...(freeRules
          ? [
              { currency_code: CURRENCY_CODE, amount: 0, rules: freeRules },
              { region_id: args.regionId, amount: 0, rules: freeRules },
            ]
          : []),
      ],
      rules: SHIPPING_RULES,
    },
    {
      name: "Digitálny produkt (bez dopravy)",
      price_type: "flat" as const,
      provider_id: "manual_manual",
      service_zone_id: args.digitalZoneId,
      shipping_profile_id: args.digitalProfileId,
      type: { label: "Digitálne", description: "Digitálny produkt, bez fyzického doručenia.", code: "digital" },
      prices: [
        { currency_code: CURRENCY_CODE, amount: 0 },
        { region_id: args.regionId, amount: 0 },
      ],
      rules: SHIPPING_RULES,
    },
  ]
}

// ---------------------------------------------------------------------------
// Pomocné funkce
// ---------------------------------------------------------------------------

type Logger = { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void }

async function step<T>(logger: Logger, name: string, fn: () => Promise<T>): Promise<T> {
  logger.info(`[anastasia-bootstrap] ${name}...`)
  try {
    return await fn()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`[anastasia-bootstrap] ${name} FAILED: ${message}`)
    throw new Error(`anastasia-bootstrap step "${name}" failed: ${message}`)
  }
}

// ---------------------------------------------------------------------------
// Hlavní skript
// ---------------------------------------------------------------------------

export default async function anastasiaBootstrap({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as unknown as Logger
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const fulfillmentService = container.resolve(Modules.FULFILLMENT) as any
  const taxService = container.resolve(Modules.TAX) as any
  const paymentService = container.resolve(Modules.PAYMENT) as any

  // Nasazené prostředí (Medusa Cloud nebo NODE_ENV=production) nesmí skončit s pp_system_default místo Stripe.
  const isProduction = resolveDeployEnv().isDeployed
  const countries = parseCountries(process.env.ANASTASIA_REGION_COUNTRIES)
  const warehouseCity = (process.env.ANASTASIA_WAREHOUSE_CITY || "Bratislava").trim()
  const warehouseCountry = (process.env.ANASTASIA_WAREHOUSE_COUNTRY || "SK").trim().toUpperCase()
  const warehouseAddress = (process.env.ANASTASIA_WAREHOUSE_ADDRESS || "").trim()
  const freeShippingFrom = parseFreeShippingThreshold(process.env.ANASTASIA_FREE_SHIPPING_FROM_EUR)

  const findFirst = async (entity: string, filters: Record<string, unknown>, fields: string[] = ["id"]) => {
    const { data } = await query.graph({ entity, fields, filters } as any)
    return (data && data[0]) as any
  }

  // 1) Sales channel
  const salesChannel = await step(logger, "sales channel", async () => {
    const existing = await findFirst("sales_channel", { name: SALES_CHANNEL_NAME })
    if (existing) return existing
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: [{ name: SALES_CHANNEL_NAME, description: "Hlavný predajný kanál ANASTASIA" }] },
    })
    return result[0]
  })

  // 2) Store: měna EUR, výchozí sales channel
  await step(logger, "store (EUR)", async () => {
    let store = await findFirst("store", {}, ["id", "name", "supported_currencies.*"])
    if (!store) {
      // Prázdná DB při prvním deployi (migration script běží před prvním `medusa start`, který store zakládá):
      // stejný idempotentní workflow, který Medusa spouští při startu.
      await createDefaultsWorkflow(container).run()
      store = await findFirst("store", {}, ["id", "name", "supported_currencies.*"])
    }
    if (!store) throw new Error("No store found after createDefaultsWorkflow")
    await updateStoresWorkflow(container).run({
      input: {
        selector: { id: store.id },
        update: {
          name: STORE_NAME,
          // Ceny v katalógu sú koncové (s DPH). Produkty majú cenu len podľa meny (bez pravidla region_id),
          // preto Medusa berie preferenciu MENY, nie regiónu; bez is_tax_inclusive by k 50 € pripočítala 23 %.
          supported_currencies: [{ currency_code: CURRENCY_CODE, is_default: true, is_tax_inclusive: true }],
          default_sales_channel_id: salesChannel.id,
        },
      },
    })
  })

  // 3) Publishable API klíč pro storefront
  const publishableKey = await step(logger, "publishable API key", async () => {
    let key = await findFirst("api_key", { title: API_KEY_TITLE, type: "publishable" }, ["id", "token", "title"])
    if (!key) {
      const { result } = await createApiKeysWorkflow(container).run({
        input: { api_keys: [{ title: API_KEY_TITLE, type: "publishable", created_by: "anastasia-bootstrap" }] },
      })
      key = result[0]
    }
    await linkSalesChannelsToApiKeyWorkflow(container).run({
      input: { id: key.id, add: [salesChannel.id] },
    })
    return key
  })

  // 4) Region Slovensko (EUR, ceny včetně DPH)
  const region = await step(logger, "region", async () => {
    const providers = (await paymentService.listPaymentProviders({}, { take: 100 })) as Array<{ id: string }>
    const paymentProviders = pickPaymentProviders(providers.map((p) => p.id), isProduction)
    if (paymentProviders[0] === SYSTEM_PROVIDER_ID) {
      logger.warn(`[anastasia-bootstrap] Stripe provider not registered (missing STRIPE_API_KEY); region uses ${SYSTEM_PROVIDER_ID} - local development only`)
    }
    const existing = await findFirst("region", { name: REGION_NAME }, ["id", "payment_providers.id"])
    if (existing) {
      // Idempotence s dorovnáním: starší region mohl vzniknout bez Stripe (dřív nebyl klíč).
      // Když je teď Stripe registrovaný, ale na regionu chybí, napojíme ho (jinak storefront
      // Stripe nenabídne). Jen přidáváme, nikdy neodebíráme ručně nastavené providery.
      const current = new Set(((existing.payment_providers ?? []) as Array<{ id: string }>).map((p) => p.id))
      const missing = paymentProviders.filter((id) => !current.has(id))
      if (missing.length === 0) {
        logger.info(`[anastasia-bootstrap] region "${REGION_NAME}" already exists (${existing.id}) with payment providers, skipping`)
        return existing
      }
      await updateRegionsWorkflow(container).run({
        input: { selector: { id: existing.id }, update: { payment_providers: [...current, ...missing] } },
      })
      logger.info(`[anastasia-bootstrap] region "${REGION_NAME}" (${existing.id}): doplněn platební provider ${missing.join(", ")}`)
      return existing
    }
    const { result } = await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: REGION_NAME,
            currency_code: CURRENCY_CODE,
            countries,
            payment_providers: paymentProviders,
            is_tax_inclusive: true,
          },
        ],
      },
    })
    return result[0]
  })

  // 5) Daňové regiony a sazby DPH
  await step(logger, "tax regions + DPH", async () => {
    for (const country of countries) {
      let taxRegion = await findFirst("tax_region", { country_code: country })
      if (!taxRegion) {
        const isSk = country === "sk"
        const { result } = await createTaxRegionsWorkflow(container).run({
          input: [
            {
              country_code: country,
              provider_id: TAX_PROVIDER_ID,
              ...(isSk ? { default_tax_rate: { rate: SK_VAT_RATES[0].rate, code: SK_VAT_RATES[0].code, name: SK_VAT_RATES[0].name } } : {}),
            },
          ],
        })
        taxRegion = result[0]
        if (!isSk) {
          logger.warn(`[anastasia-bootstrap] tax region "${country}" created WITHOUT a default rate (DPH for other EU countries must be set up with the accountant, OSS)`)
        }
      }
      if (country !== "sk") continue
      for (const rate of SK_VAT_RATES) {
        const existing = (await taxService.listTaxRates({ tax_region_id: taxRegion.id, code: rate.code }, { take: 1 })) as unknown[]
        if (existing.length) continue
        await taxService.createTaxRates({
          tax_region_id: taxRegion.id,
          code: rate.code,
          name: rate.name,
          rate: rate.rate,
          is_default: rate.is_default,
        })
      }
    }
  })

  // 6) Sklad
  const stockLocation = await step(logger, "stock location", async () => {
    let location = await findFirst("stock_location", { name: STOCK_LOCATION_NAME })
    if (!location) {
      const { result } = await createStockLocationsWorkflow(container).run({
        input: {
          locations: [
            {
              name: STOCK_LOCATION_NAME,
              address: { city: warehouseCity, country_code: warehouseCountry, address_1: warehouseAddress },
            },
          ],
        },
      })
      location = result[0]
      await link.create({
        [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
        [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
      })
    }
    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: { id: location.id, add: [salesChannel.id] },
    })
    return location
  })

  // 7) Shipping profily
  const profiles = await step(logger, "shipping profiles", async () => {
    let physical = await findFirst("shipping_profile", { type: "default" })
    if (!physical) {
      const { result } = await createShippingProfilesWorkflow(container).run({
        input: { data: [{ name: "Fyzické produkty", type: "default" }] },
      })
      physical = result[0]
    }
    let digital = await findFirst("shipping_profile", { name: DIGITAL_PROFILE_NAME })
    if (!digital) {
      const { result } = await createShippingProfilesWorkflow(container).run({
        input: { data: [{ name: DIGITAL_PROFILE_NAME, type: "digital" }] },
      })
      digital = result[0]
    }
    return { physical, digital }
  })

  // 8) Fulfillment sety a service zóny
  const sets = await step(logger, "fulfillment sets", async () => {
    const ensureSet = async (name: string, zoneName: string) => {
      let set = await findFirst("fulfillment_set", { name }, ["id", "service_zones.id", "service_zones.name"])
      if (!set) {
        set = await fulfillmentService.createFulfillmentSets({
          name,
          type: "shipping",
          service_zones: [
            { name: zoneName, geo_zones: countries.map((country_code) => ({ country_code, type: "country" })) },
          ],
        })
        await link.create({
          [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
          [Modules.FULFILLMENT]: { fulfillment_set_id: set.id },
        })
      }
      const zone = (set.service_zones || [])[0]
      if (!zone?.id) throw new Error(`Fulfillment set "${name}" has no service zone`)
      return { id: set.id as string, zoneId: zone.id as string }
    }
    return {
      physical: await ensureSet(PHYSICAL_FULFILLMENT_SET_NAME, REGION_NAME),
      digital: await ensureSet(DIGITAL_FULFILLMENT_SET_NAME, `Digitálne - ${REGION_NAME}`),
    }
  })

  // 9) Shipping options
  await step(logger, "shipping options", async () => {
    const inputs = buildShippingOptionInputs({
      regionId: region.id,
      physicalZoneId: sets.physical.zoneId,
      digitalZoneId: sets.digital.zoneId,
      physicalProfileId: profiles.physical.id,
      digitalProfileId: profiles.digital.id,
      freeShippingFromEur: freeShippingFrom,
    })
    const missing: typeof inputs = []
    for (const input of inputs) {
      const existing = await findFirst("shipping_option", { name: input.name })
      if (!existing) missing.push(input)
    }
    if (missing.length) {
      await createShippingOptionsWorkflow(container).run({ input: missing })
    }
  })

  // 10) Zákaznické skupiny (věrnostní úrovně)
  await step(logger, "customer groups (loyalty)", async () => {
    const missing: Array<{ name: string; metadata: Record<string, unknown> }> = []
    for (const group of LOYALTY_GROUPS) {
      const existing = await findFirst("customer_group", { name: group.name })
      if (!existing) {
        missing.push({ name: group.name, metadata: { loyalty: true, nexus_tier: group.nexus_tier, rank: group.rank } })
      }
    }
    if (missing.length) {
      await createCustomerGroupsWorkflow(container).run({ input: { customersData: missing } })
    }
  })

  logger.info("[anastasia-bootstrap] DONE")
  logger.info(`[anastasia-bootstrap] publishable key (pro storefront NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY): ${publishableKey.token}`)
}
