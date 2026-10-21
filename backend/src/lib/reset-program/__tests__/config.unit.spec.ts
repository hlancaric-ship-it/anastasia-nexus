import {
  RESET_JOURNAL_METRICS,
  RESET_PROGRAM_KEY,
  RESET_PROGRAM_TOTAL_WEEKS,
  effectiveJournalMetrics,
  parseJournalMetrics,
  programKeyForProduct,
} from "../config"

describe("Zrkadielko – konfigurácia metrik", () => {
  it("predvolené metriky sú tie potvrdené zo starého webu (1–10)", () => {
    expect(RESET_JOURNAL_METRICS.map((metric) => metric.key)).toEqual(["energia", "spanok", "stres"])
    for (const metric of RESET_JOURNAL_METRICS) {
      expect(metric.min).toBe(1)
      expect(metric.max).toBe(10)
      expect(metric.label.length).toBeGreaterThan(0)
    }
  })

  it("program má 16 týždňov", () => {
    expect(RESET_PROGRAM_TOTAL_WEEKS).toBe(16)
  })

  it("prepis metrik v metadátach sa použije, neplatný prepis sa ignoruje", () => {
    const valid = [{ key: "energia", label: "Energia", min: 1, max: 10, order: 10 }, { key: "nalada", label: "Nálada", min: 1, max: 10, order: 20 }]
    expect(parseJournalMetrics(valid)?.map((metric) => metric.key)).toEqual(["energia", "nalada"])
    expect(effectiveJournalMetrics({ reset_journal_metrics: valid }).map((metric) => metric.key)).toEqual(["energia", "nalada"])
    // neplatný prepis -> predvolený zoznam (fail-safe)
    expect(effectiveJournalMetrics({ reset_journal_metrics: [{ key: "energia", label: "", min: 1, max: 10 }] }).map((metric) => metric.key)).toEqual(["energia", "spanok", "stres"])
    expect(effectiveJournalMetrics({ reset_journal_metrics: "nesmysel" }).map((metric) => metric.key)).toEqual(["energia", "spanok", "stres"])
    expect(effectiveJournalMetrics(null).map((metric) => metric.key)).toEqual(["energia", "spanok", "stres"])
  })

  it("prepis odmietne duplicitné kľúče, zlé rozsahy a nečíselné hodnoty", () => {
    expect(parseJournalMetrics([{ key: "energia", label: "E", min: 1, max: 10 }, { key: "energia", label: "E2" }])).toBeNull()
    expect(parseJournalMetrics([{ key: "energia", label: "E", min: 0, max: 10 }])).toBeNull()
    expect(parseJournalMetrics([{ key: "energia", label: "E", min: 1, max: 11 }])).toBeNull()
    expect(parseJournalMetrics([{ key: "energia", label: "E", min: 1, max: 10, order: 1.5 }])).toBeNull()
    expect(parseJournalMetrics([{ key: "E NERGIA", label: "E" }])).toBeNull()
    expect(parseJournalMetrics([])).toBeNull()
  })

  it("programový kľúč sa berie z metadát alebo z handle produktu", () => {
    expect(programKeyForProduct({ handle: "reset-40-plus" })).toBe(RESET_PROGRAM_KEY)
    expect(programKeyForProduct({ handle: "nic-nemusis" })).toBeNull()
    expect(programKeyForProduct({ handle: "nic-nemusis", metadata: { program_key: "reset-40-plus" } })).toBe(RESET_PROGRAM_KEY)
    expect(programKeyForProduct(null)).toBeNull()
  })
})
