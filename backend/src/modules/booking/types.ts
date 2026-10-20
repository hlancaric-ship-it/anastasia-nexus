export type BookingStatus = "held" | "confirmed" | "canceled" | "completed"

export type BookingDTO = {
  id: string
  customer_id: string
  product_id: string
  calendar_id?: string
  order_id: string | null
  status: BookingStatus
  starts_at: Date | string
  ends_at: Date | string
  held_until: Date | string | null
  canceled_at: Date | string | null
  cancel_reason: string | null
  notes: string | null
  metadata: Record<string, unknown> | null
}

export type HoldSlotInput = {
  customer_id: string
  product_id: string
  tenant_id?: string
  starts_at: Date
  ends_at: Date
  /** Jak dlouho hold čeká na potvrzení (zaplacení), než vyprší. */
  holdMinutes?: number
  /** Server-configured preparation time after a consultation. */
  bufferMinutes?: number
  /** Kalendář (výchozí CALENDAR_ID); obsazenost a zámek platí nad ním, ne nad produktem. */
  calendar_id?: string
  /** Časová zóna oken kalendáře (výchozí Europe/Bratislava). */
  timezone?: string
}

export type ConfirmBookingInput = { id: string; order_id: string }
