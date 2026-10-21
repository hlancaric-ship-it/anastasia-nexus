/**
 * Konfigurácia členskej zóny RESET 40+ (Zrkadielko).
 *
 * JEDNÉ miesto, kde sa definuje zoznam metrik a rám programu:
 *  - `RESET_JOURNAL_METRICS` – metriky Zrkadielka (hodnotenie 1–10),
 *  - `RESET_PROGRAM_*`       – počet týždňov, dni s pracovnými listami a odkaz na vstupný dotazník.
 *
 * Zoznam metrik sa dá prepísať v metadátach produktu (`reset_journal_metrics`) bez zásahu do kódu.
 * Neplatný prepis sa ignoruje a použije sa predvolený zoznam (fail-safe: radšej default než prázdna tabuľka).
 *
 * Obsah metrik NEDOPLŇUJEME odhadom. Zo screenshotov starého webu je potvrdené
 * DÁTUM, ENERGIA (1–10), SPÁNOK (1–10), STRES (1–10); ďalší stĺpec sa na screenshotu začína
 * na „NA…“ a jeho názov musí potvrdiť Lucia (pozri `docs/wp/reset-zrkadielko.md`).
 */

/** Program, ktorému Zrkadielko patrí. Zodpovedá handle produktu RESET 40+. */
export const RESET_PROGRAM_KEY = "reset-40-plus"

/** Počet týždňov programu (zo starého webu: „Týždeň číslo 1 >> … Týždeň číslo 16 >>“). */
export const RESET_PROGRAM_TOTAL_WEEKS = 16

/** Dni s pracovným listom v každom týždni (zo starého webu: „2. deň … 7. deň“). */
export const RESET_PROGRAM_WORKLIST_DAYS: readonly number[] = Object.freeze([2, 3, 4, 5, 6, 7])

/** Odkaz na vstupný dotazník programu (zo starého webu – externá služba Tally). */
export const RESET_ENTRY_QUESTIONNAIRE_URL = "https://tally.so/r/440GBr"

/** Časové pásmo zákazníka: deň v Zrkadielku sa posudzuje podľa kalendárneho dňa v Bratislave. */
export const RESET_JOURNAL_TIMEZONE = "Europe/Bratislava"

export type JournalMetric = {
  /** Stabilný kľúč metriky (uloží sa do `metrics` JSONB). */
  key: string
  /** Názov stĺpca pre zákazníka (slovenčina). */
  label: string
  /** Minimálna hodnota. */
  min: number
  /** Maximálna hodnota. */
  max: number
  /** Poradie stĺpca v tabuľke (vzostupne). */
  order: number
}

/**
 * Predvolené metriky Zrkadielka.
 * Len tie, ktoré sú potvrdené zo starého webu – nič nevymýšľame.
 */
export const RESET_JOURNAL_METRICS: readonly JournalMetric[] = Object.freeze([
  { key: "energia", label: "Energia", min: 1, max: 10, order: 10 },
  { key: "spanok", label: "Spánok", min: 1, max: 10, order: 20 },
  { key: "stres", label: "Stres", min: 1, max: 10, order: 30 },
])

const METRIC_KEY = /^[a-z0-9_]{1,40}$/
const METRIC_LABEL_MAX = 80

/** Normalizuje kľúč metriky (trim + malé písmená). */
export function normalizeMetricKey(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

/**
 * Prečíta zoznam metrik z metadát produktu.
 * Vráti `null`, keď je prepis chybný – volajúci potom použije predvolený zoznam.
 */
export function parseJournalMetrics(raw: unknown): JournalMetric[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 50) return null
  const result: JournalMetric[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null
    const source = item as Record<string, unknown>
    const key = normalizeMetricKey(source.key)
    if (!METRIC_KEY.test(key) || seen.has(key)) return null
    const label = typeof source.label === "string" ? source.label.trim() : ""
    if (!label || label.length > METRIC_LABEL_MAX) return null
    const min = source.min === undefined ? 1 : source.min
    const max = source.max === undefined ? 10 : source.max
    if (!Number.isInteger(min) || !Number.isInteger(max)) return null
    if ((min as number) < 1 || (max as number) > 10 || (min as number) > (max as number)) return null
    const order = source.order === undefined ? (result.length + 1) * 10 : source.order
    if (!Number.isInteger(order) || (order as number) < 0 || (order as number) > 10_000) return null
    seen.add(key)
    result.push({ key, label, min: min as number, max: max as number, order: order as number })
  }
  return result.sort((a, b) => a.order - b.order)
}

/**
 * Účinný zoznam metrik pre daný produkt.
 * Predvolený zoznam platí, kým sa metadáta produktu neprepisujú.
 */
export function effectiveJournalMetrics(metadata: Record<string, unknown> | null | undefined): JournalMetric[] {
  const parsed = parseJournalMetrics(metadata?.reset_journal_metrics)
  return parsed ?? RESET_JOURNAL_METRICS.map((metric) => ({ ...metric }))
}

/**
 * Programový kľúč produktu.
 * Priorita: explicitné `metadata.program_key` → handle `reset-40-plus` → nič.
 */
export function programKeyForProduct(product: { handle?: string | null; metadata?: Record<string, unknown> | null } | null | undefined): string | null {
  if (!product) return null
  const explicit = product.metadata?.program_key
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim()
  if (typeof product.handle === "string" && product.handle.trim() === RESET_PROGRAM_KEY) return RESET_PROGRAM_KEY
  return null
}
