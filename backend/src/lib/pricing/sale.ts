/**
 * Akčná (výpredajová) cena z metadát produktu/variantu.
 *
 * Administrácia zapisuje `metadata.vyprodej = { active, akcna_cena, do }`.
 * Backend ju doteraz NEČÍTAL – cena sa počítala len z Medusa price listu,
 * takže vypnutá alebo vypršaná výpredajová cena stále platila.
 *
 * Pravidlo (jedno miesto, jedno pravidlo):
 *   - `metadata.vyprodej` chýba → platí cenový zoznam (doterajšie správanie),
 *   - `metadata.vyprodej` existuje a `active !== true` → výpredaj NEplatí,
 *   - `metadata.vyprodej` existuje a `do` je v minulosti → výpredaj NEplatí,
 *   - inak je výpredajová cena `akcna_cena` (ak je platná a menšia než základná
 *     cena); ak `akcna_cena` chýba alebo je neplatná, použije sa cena z cenového
 *     zoznamu. Zákazník nikdy nezaplatí viac než cenový zoznam.
 */

export type SaleMetadata = {
  /** vypnutá výpredajová cena (`active: false`) */
  active: boolean
  /** akčná cena v EUR (null = nemá) */
  amount: number | null
  /** platí do (ISO dátum alebo null = bez konca) */
  until: string | null
}

export type SaleResolution = {
  /** cena bez výpredajovej zľavy (z ktorej sa počíta zľava) */
  basePrice: number
  /** výpredajová cena (null = žiadna výpredajová cena) */
  salePrice: number | null
  /** čo rozhodlo o výsledku (pre log a audit) */
  source: "price-list" | "metadata" | "none" | "expired" | "inactive"
}

/** Prečíta `metadata.vyprodej` (ak je to vôbec platný záznam). */
export function readSaleMetadata(value: unknown): SaleMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const meta = value as Record<string, unknown>
  const rawAmount = meta.akcna_cena
  const amount = typeof rawAmount === "number" && Number.isFinite(rawAmount) ? rawAmount : null
  const until = typeof meta.do === "string" && meta.do.trim() ? meta.do.trim() : null
  return { active: meta.active === true, amount, until }
}

/** Je výpredajová cena po dátume `do` vypršala? */
export function saleExpired(metadata: SaleMetadata | null, now: Date = new Date()): boolean {
  if (!metadata?.until) return false
  const until = new Date(metadata.until.length <= 10 ? `${metadata.until}T23:59:59.999Z` : metadata.until)
  const time = until.getTime()
  if (!Number.isFinite(time)) return false
  return now.getTime() >= time
}

/**
 * Rozhodne základnú cenu a výpredajovú cenu.
 *
 * `originalAmount` = cena z kataloga bez cenového zoznamu, `currentAmount` =
 * cena s cenovým zoznamom (ak je zoznam aplikovaný).
 */
export function resolveSalePrice(params: {
  originalAmount: number
  currentAmount: number
  metadata?: unknown
  now?: Date
}): SaleResolution {
  const { originalAmount, currentAmount } = params
  const basePrice = Number.isFinite(originalAmount) && originalAmount >= currentAmount ? originalAmount : currentAmount
  const metadata = readSaleMetadata(params.metadata)
  const priceListSale = Number.isFinite(currentAmount) && currentAmount > 0 && currentAmount < basePrice ? currentAmount : null

  // Žiadne metadáta = cenový zoznam rozhoduje (doterajšie správanie).
  if (!metadata) {
    return { basePrice, salePrice: priceListSale, source: priceListSale ? "price-list" : "none" }
  }
  if (!metadata.active) return { basePrice, salePrice: null, source: "inactive" }
  if (saleExpired(metadata, params.now)) return { basePrice, salePrice: null, source: "expired" }

  const metadataSale = metadata.amount !== null && metadata.amount > 0 && metadata.amount < basePrice ? metadata.amount : null
  if (metadataSale !== null) return { basePrice, salePrice: metadataSale, source: "metadata" }
  return { basePrice, salePrice: priceListSale, source: priceListSale ? "price-list" : "none" }
}
