import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { JournalError } from "../../../modules/reset-journal/policy"

/** ID prihláseného zákazníka (alebo null, keď nie je prihlásený). */
export function requireCustomer(req: AuthenticatedMedusaRequest, res: MedusaResponse): string | null {
  const id = req.auth_context?.actor_type === "customer" ? req.auth_context.actor_id : undefined
  if (!id) {
    res.status(401).json({ type: "unauthorized", message: "Prihlásenie je povinné." })
    return null
  }
  return id
}

/** Preloží chybu pravidla Zrkadielka na HTTP odpoveď (bez stack trace v klientovi). */
export function sendJournalError(req: AuthenticatedMedusaRequest, res: MedusaResponse, error: unknown) {
  if (error instanceof JournalError) {
    return res.status(error.status).json({ type: error.code, message: journalMessage(error.code) })
  }
  req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("Zrkadielko: požiadavka zlyhala", error as Error)
  return res.status(500).json({ type: "unexpected_state", message: "Uloženie záznamu sa nepodarilo. Skúste to prosím neskôr." })
}

/** Zrozumiteľný text pre zákazníčku (bez interných kódov). */
export function journalMessage(code: string): string {
  switch (code) {
    case "JOURNAL_DATE_IN_FUTURE":
      return "Dátum nemôže byť v budúcnosti."
    case "JOURNAL_DATE_INVALID":
      return "Dátum záznamu nie je platný."
    case "JOURNAL_METRIC_OUT_OF_RANGE":
      return "Hodnota musí byť v rozsahu 1 až 10."
    case "JOURNAL_METRIC_UNKNOWN":
      return "Neznáma položka hodnotenia."
    case "JOURNAL_METRIC_INVALID":
      return "Hodnota hodnotenia musí byť celé číslo."
    case "JOURNAL_METRICS_EMPTY":
      return "Vyplňte aspoň jednu položku hodnotenia."
    case "JOURNAL_METRICS_INVALID":
      return "Hodnotenia nie sú vo správnom formáte."
    case "JOURNAL_WEEK_INVALID":
      return "Týždeň musí byť číslo od 1 do 16."
    case "JOURNAL_DAILY_LIMIT":
      return "Pre tento deň máte zaplnený denný limit záznamov."
    case "JOURNAL_ENTRY_INVALID":
      return "Záznam sa nepodarilo uložiť."
    default:
      return "Požiadavku sa nepodarilo vybaviť. Skúste to prosím neskôr."
  }
}

/** Formát záznamu pre zákazníčku (bez technických polí). */
export function journalEntryDTO(entry: {
  id: string
  week?: number | null
  entry_date: Date | string
  metrics: unknown
  created_at?: Date | string
  updated_at?: Date | string
}) {
  return {
    id: entry.id,
    week: entry.week ?? null,
    date: typeof entry.entry_date === "string" ? entry.entry_date.slice(0, 10) : new Date(entry.entry_date).toISOString().slice(0, 10),
    metrics: (entry.metrics ?? {}) as Record<string, number>,
    created_at: entry.created_at ?? null,
    updated_at: entry.updated_at ?? null,
  }
}
