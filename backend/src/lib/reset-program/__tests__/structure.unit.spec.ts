import { effectiveProgramStructure, parseProgramStructure, programSkeleton } from "../structure"
import { RESET_ENTRY_QUESTIONNAIRE_URL, RESET_PROGRAM_TOTAL_WEEKS } from "../config"

describe("Zrkadielko – štruktúra programu", () => {
  it("kostra má 16 týždňov, pracovné listy po dňoch, záverečné zhrnutie a vstupný dotazník", () => {
    const skeleton = programSkeleton("reset-40-plus")
    expect(skeleton.weeks).toHaveLength(RESET_PROGRAM_TOTAL_WEEKS)
    expect(skeleton.weeks[0].week).toBe(1)
    expect(skeleton.weeks[15].week).toBe(16)
    expect(skeleton.weeks[0].days.map((day) => day.day)).toEqual([2, 3, 4, 5, 6, 7])
    expect(skeleton.final_summary?.title).toBe("Záverečné zhrnutie")
    expect(skeleton.entry_questionnaire_url).toBe(RESET_ENTRY_QUESTIONNAIRE_URL)
    expect(skeleton.content_ready).toBe(false)
  })

  it("bez metadát sa vráti kostra programu", () => {
    const structure = effectiveProgramStructure(null, "reset-40-plus")
    expect(structure.weeks).toHaveLength(16)
    expect(structure.content_ready).toBe(false)
  })

  it("prečíta týždne, materiály a pracovné listy z metadát", () => {
    const parsed = parseProgramStructure(
      {
        weeks: [
          {
            week: 1,
            title: "Prvý týždeň",
            intro: "Úvod",
            materials: [{ key: "reset-40-plus/lekcia-01.pdf", title: "Materiály", kind: "document" }],
            days: [{ day: 2, label: "2. deň", materials: [{ key: "reset-40-plus/den-02.pdf", title: "Pracovný list", kind: "document" }] }],
          },
        ],
        final_summary: { title: "Záverečné zhrnutie", materials: [] },
        entry_questionnaire_url: "https://tally.so/r/440GBr",
      },
      "reset-40-plus",
    )
    expect(parsed?.weeks[0].week).toBe(1)
    expect(parsed?.weeks[0].materials[0].key).toBe("reset-40-plus/lekcia-01.pdf")
    expect(parsed?.weeks[0].days[0].materials[0].title).toBe("Pracovný list")
    expect(parsed?.final_summary?.title).toBe("Záverečné zhrnutie")
    expect(effectiveProgramStructure({ program_structure: { weeks: [{ week: 1, intro: "Úvod" }] } }, "reset-40-plus").content_ready).toBe(true)
  })

  it("poškodené údaje sa preskočia a štruktúra sa nestaví z citlivých polí", () => {
    const parsed = parseProgramStructure(
      {
        weeks: [
          { week: 99, materials: [] },
          { week: 0, materials: [] },
          { week: 1, materials: [{ key: "../tajne.pdf", title: "X" }, { key: "ok.pdf", title: "" }] },
        ],
      },
      "reset-40-plus",
    )
    expect(parsed?.weeks.map((week) => week.week)).toEqual([1])
    expect(parsed?.weeks[0].materials).toEqual([])
  })

  it("neúplné metadáta sa nepremenia na program", () => {
    expect(parseProgramStructure({}, "reset-40-plus")).toBeNull()
    expect(parseProgramStructure(null, "reset-40-plus")).toBeNull()
    expect(parseProgramStructure("text", "reset-40-plus")).toBeNull()
  })
})
