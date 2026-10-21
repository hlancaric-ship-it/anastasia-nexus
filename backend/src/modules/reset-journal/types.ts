export type ResetJournalEntryDTO = {
  id: string
  tenant_id: string
  customer_id: string
  entitlement_id: string | null
  program: string
  week: number | null
  entry_date: Date | string
  metrics: Record<string, number>
  created_at: Date | string
  updated_at: Date | string
}

export type CreateJournalEntryInput = {
  customer_id: string
  program: string
  entitlement_id?: string | null
  /** Týždeň 1–16 (overí sa v policy – hodnota príde z requestu). */
  week?: unknown
  entry_date: string | Date
  metrics: unknown
}

export type UpdateJournalEntryInput = {
  /** Týždeň 1–16 (overí sa v policy – hodnota príde z requestu). */
  week?: unknown
  entry_date?: string | Date
  metrics?: unknown
}
