/**
 * Skupiny digitálnych produktov (návrh pre kategórie).
 *
 * Základ je stávajúca kategória „AI ANASTASIA ACADEMY“ v katalógu; nič
 * sa nemazí ani nezakladá – toto je iba zoskupenie v administrácii a v e-shope
 * a návrh ďalších kategórií pre vlastníka obchodu.
 */

export type DigitalProductGroup = {
  /** Stabilný identifikátor skupiny (pre URL a testy). */
  handle: string
  /** Názov, ktorý vidí zákazníčka aj Lucia. */
  label: string
  /** Existujúce (alebo navrhované) kategórie, ktoré do skupiny patria. */
  categories: string[]
}

/**
 * Navrhované skupiny. „AI ANASTASIA ACADEMY“ už v katalógu existuje,
 * zvyšok sú nové kategórie, ktoré môže Lucia založiť v administrácii.
 */
export const DIGITAL_PRODUCT_GROUPS: readonly DigitalProductGroup[] = Object.freeze([
  { handle: "academy-kurzy", label: "ACADEMY kurzy", categories: ["AI ANASTASIA ACADEMY"] },
  { handle: "audio-meditacie", label: "Audio a meditácie", categories: ["Audio a meditácie"] },
  { handle: "e-knihy-dokumenty", label: "E-knihy a dokumenty", categories: ["E-knihy a dokumenty"] },
  { handle: "konzultacie", label: "Konzultácie", categories: ["Konzultácie"] },
])

/** Kategórie, ktoré do niektorých skupiny patria (poradie = poradie v UI). */
export const DIGITAL_CATEGORY_NAMES: readonly string[] = Object.freeze(
  DIGITAL_PRODUCT_GROUPS.flatMap((group) => group.categories),
)

/**
 * Skupina pre dané kategórie produktu. Prvá zhoda v poradí skupín vyhráva,
 * aby bol výsledok vždy rovnaký.
 */
export function digitalGroupFor(categoryNames: Array<string | null | undefined>): DigitalProductGroup | null {
  const names = new Set(categoryNames.filter((name): name is string => typeof name === "string" && name.trim().length > 0).map((name) => name.trim()))
  for (const group of DIGITAL_PRODUCT_GROUPS) {
    if (group.categories.some((category) => names.has(category))) return group
  }
  return null
}

/** Názov skupiny (alebo pôvodná kategória, ak produkt do žiadnej skupiny nepatrí). */
export function digitalGroupLabel(categoryNames: Array<string | null | undefined>): string {
  const group = digitalGroupFor(categoryNames)
  if (group) return group.label
  const first = categoryNames.find((name) => typeof name === "string" && name.trim().length > 0)
  return first ? first.trim() : "Digitálne produkty"
}

/** Je produkt digitálny? Rozhoduje dopravný profil, nie kategória. */
export function isDigitalProduct(shippingProfileType: string | null | undefined): boolean {
  return shippingProfileType === "digital"
}
