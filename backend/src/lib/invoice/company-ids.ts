/**
 * Firemné údaje odberateľa z pokladne (IČO, DIČ, IČ DPH). Prichádzajú z prehliadača do `cart.metadata`,
 * preto ich server pred zápisom aj pri tlači faktúry overí formátom (SK a CZ). Neplatná hodnota sa
 * do košíka nezapíše (400) a na faktúru sa nikdy nedostane ľubovoľný text.
 */
export const COMPANY_ID_KEYS = ["company_ico", "company_dic", "company_ic_dph"] as const
export type CompanyIdKey = (typeof COMPANY_ID_KEYS)[number]

const FORMAT: Record<CompanyIdKey, RegExp> = {
  company_ico: /^\d{6,8}$/,
  company_dic: /^(CZ)?\d{8,10}$/,
  company_ic_dph: /^[A-Z]{2}[0-9A-Z]{8,12}$/,
}
export const COMPANY_NAME_MAX = 120

export const normalizeCompanyId = (value: unknown): string =>
  typeof value === "string" ? value.replace(/\s+/g, "").toUpperCase() : ""

/** Platná normalizovaná hodnota, alebo "" (prázdna alebo neplatná). */
export function validCompanyId(key: CompanyIdKey, value: unknown): string {
  const v = normalizeCompanyId(value)
  return v && FORMAT[key].test(v) ? v : ""
}

/** Kľúče z tela požiadavky, ktoré nie sú prázdny reťazec ani platná hodnota. */
export function invalidCompanyFields(body: unknown): string[] {
  if (!body || typeof body !== "object") return []
  const b = body as Record<string, unknown>
  const bad: string[] = []
  const md = b.metadata
  if (md && typeof md === "object" && !Array.isArray(md)) {
    for (const key of COMPANY_ID_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(md, key)) continue
      const value = (md as Record<string, unknown>)[key]
      if (value === "" || value === null) continue
      if (typeof value !== "string" || !validCompanyId(key, value)) bad.push(key)
    }
  }
  for (const addr of ["billing_address", "shipping_address"]) {
    const company = (b[addr] as Record<string, unknown> | undefined)?.company
    if (company != null && (typeof company !== "string" || company.length > COMPANY_NAME_MAX)) bad.push(`${addr}.company`)
  }
  return bad
}
