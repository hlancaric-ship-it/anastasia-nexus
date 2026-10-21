/**
 * Dátový model štruktúry programu RESET 40+ (členská zóna).
 *
 * Starý web mal v zóne programu:
 *  - stránku programu: „Vyplňte prosím VSTUPNÝ DOTAZNÍK“ + odkaz na externý dotazník,
 *    zoznam „Týždeň číslo 1 >> … Týždeň číslo 16 >>“ a „Záverečné zhrnutie >>“,
 *  - stránku týždňa: text, „Stiahnuť materiály pre samoštúdium >>“ a pracovné listy
 *    po dňoch („2. deň – stiahnuť pracovný list“ … „7. deň“).
 *
 * Model dáva programu 16 týždňov + záverečné zhrnutie + materiály a pracovné listy po dňoch
 * + odkaz na vstupný dotazník. OBSAH (texty, súbory) sa nedoplňuje odhadom – dodá ho Lucia
 * alebo import (produkt → `metadata.program_structure`).
 */

import {
  RESET_ENTRY_QUESTIONNAIRE_URL,
  RESET_PROGRAM_TOTAL_WEEKS,
  RESET_PROGRAM_WORKLIST_DAYS,
} from "./config"

export type ProgramMaterial = {
  /** Kľúč chráneného súboru (rovnaký register ako `metadata.protected_media`). */
  key: string
  /** Názov pre zákazníčku. */
  title: string
  /** Druh obsahu. */
  kind: "document" | "audio" | "video"
}

export type ProgramDay = {
  /** Číslo dňa v týždni (2–7 = pracovné listy). */
  day: number
  /** Názov dňa pre zákazníčku (napr. „2. deň“). */
  label: string
  /** Materiály dňa (pracovný list a pod.). */
  materials: ProgramMaterial[]
}

export type ProgramWeek = {
  /** Číslo týždňa (1–16). */
  week: number
  /** Názov týždňa (null = ešte nedodané Luciou). */
  title: string | null
  /** Úvodný text týždňa (null = ešte nedodané Luciou). */
  intro: string | null
  /** Materiály na samoštúdium. */
  materials: ProgramMaterial[]
  /** Pracovné listy po dňoch. */
  days: ProgramDay[]
}

export type ProgramStructure = {
  /** Kľúč programu (napr. `reset-40-plus`). */
  program: string
  /** Počet týždňov programu. */
  total_weeks: number
  /** Odkaz na vstupný dotazník (null = ešte nedodaný). */
  entry_questionnaire_url: string | null
  /** Záverečné zhrnutie (null = ešte nedodané). */
  final_summary: { title: string | null; materials: ProgramMaterial[] } | null
  /** Týždne 1…16. */
  weeks: ProgramWeek[]
}

const MATERIAL_KINDS = new Set(["document", "audio", "video"])
const MAX_MATERIALS = 200
const MAX_TITLE = 200
const MATERIAL_KEY = /^[A-Za-z0-9._\-/]{1,300}$/

function parseMaterials(raw: unknown): ProgramMaterial[] {
  if (!Array.isArray(raw)) return []
  const result: ProgramMaterial[] = []
  const seen = new Set<string>()
  for (const item of raw.slice(0, MAX_MATERIALS)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const source = item as Record<string, unknown>
    const key = typeof source.key === "string" ? source.key.trim() : ""
    if (!key || !MATERIAL_KEY.test(key) || key.includes("..") || seen.has(key)) continue
    const title = typeof source.title === "string" ? source.title.trim().slice(0, MAX_TITLE) : ""
    if (!title) continue
    const kind = typeof source.kind === "string" && MATERIAL_KINDS.has(source.kind) ? (source.kind as ProgramMaterial["kind"]) : "document"
    seen.add(key)
    result.push({ key, title, kind })
  }
  return result
}

function parseText(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const value = raw.trim().slice(0, 2000)
  return value ? value : null
}

/**
 * Prečíta štruktúru programu z metadát produktu.
 * Vráti `null`, keď v metadátach nič použiteľné nie je – volajúci potom použije kostru programu.
 * Poškodené týždne a materiály sa preskakujú, aby sa zákazníčke nikdy neukázala rozbitá štruktúra.
 */
export function parseProgramStructure(raw: unknown, program: string): ProgramStructure | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const source = raw as Record<string, unknown>
  const weeks: ProgramWeek[] = []
  const seenWeeks = new Set<number>()
  if (Array.isArray(source.weeks)) {
    for (const item of source.weeks.slice(0, 64)) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue
      const weekSource = item as Record<string, unknown>
      const week = Number(weekSource.week)
      if (!Number.isInteger(week) || week < 1 || week > RESET_PROGRAM_TOTAL_WEEKS || seenWeeks.has(week)) continue
      seenWeeks.add(week)
      const days: ProgramDay[] = []
      if (Array.isArray(weekSource.days)) {
        const seenDays = new Set<number>()
        for (const dayItem of weekSource.days.slice(0, 32)) {
          if (!dayItem || typeof dayItem !== "object" || Array.isArray(dayItem)) continue
          const daySource = dayItem as Record<string, unknown>
          const day = Number(daySource.day)
          if (!Number.isInteger(day) || day < 1 || day > 31 || seenDays.has(day)) continue
          seenDays.add(day)
          days.push({
            day,
            label: parseText(daySource.label) ?? `${day}. deň`,
            materials: parseMaterials(daySource.materials),
          })
        }
      }
      weeks.push({
        week,
        title: parseText(weekSource.title),
        intro: parseText(weekSource.intro),
        materials: parseMaterials(weekSource.materials),
        days: days.sort((a, b) => a.day - b.day),
      })
    }
  }
  const finalRaw = source.final_summary
  const finalSummary =
    finalRaw && typeof finalRaw === "object" && !Array.isArray(finalRaw)
      ? {
          title: parseText((finalRaw as Record<string, unknown>).title) ?? "Záverečné zhrnutie",
          materials: parseMaterials((finalRaw as Record<string, unknown>).materials),
        }
      : null
  const questionnaire = parseText(source.entry_questionnaire_url)
  const totalWeeks = Number.isInteger(source.total_weeks) && Number(source.total_weeks) > 0 && Number(source.total_weeks) <= RESET_PROGRAM_TOTAL_WEEKS
    ? Number(source.total_weeks)
    : RESET_PROGRAM_TOTAL_WEEKS
  if (!weeks.length && !finalSummary && !questionnaire) return null
  return {
    program,
    total_weeks: totalWeeks,
    entry_questionnaire_url: questionnaire,
    final_summary: finalSummary,
    weeks: weeks.sort((a, b) => a.week - b.week),
  }
}

/**
 * Kostra programu: 16 týždňov, dni s pracovnými listami a odkaz na vstupný dotazník.
 * Obsah (texty a súbory) je prázdny – dodá Lucia alebo import.
 * `content_ready` hovorí, či sú týždne reálne naplnené.
 */
export function programSkeleton(program: string): ProgramStructure & { content_ready: boolean } {
  const weeks: ProgramWeek[] = []
  for (let week = 1; week <= RESET_PROGRAM_TOTAL_WEEKS; week++) {
    weeks.push({
      week,
      title: null,
      intro: null,
      materials: [],
      days: RESET_PROGRAM_WORKLIST_DAYS.map((day) => ({ day, label: `${day}. deň`, materials: [] })),
    })
  }
  return {
    program,
    total_weeks: RESET_PROGRAM_TOTAL_WEEKS,
    entry_questionnaire_url: RESET_ENTRY_QUESTIONNAIRE_URL,
    final_summary: { title: "Záverečné zhrnutie", materials: [] },
    weeks,
    content_ready: false,
  }
}

/**
 * Účinná štruktúra programu pre daný produkt.
 * Metadáta produktu sú prvoradé; ak chýbajú alebo sú nepoužiteľné, vráti sa kostra programu.
 */
export function effectiveProgramStructure(
  metadata: Record<string, unknown> | null | undefined,
  program: string,
): ProgramStructure & { content_ready: boolean } {
  const parsed = parseProgramStructure(metadata?.program_structure, program)
  if (parsed) {
    const filled = parsed.weeks.some((week) => week.materials.length || week.days.some((day) => day.materials.length) || week.intro || week.title)
    return { ...parsed, content_ready: filled }
  }
  return programSkeleton(program)
}
