/** Čistá business logika rezervace (bez infrastruktury, testovatelná). */

export type BookingLike = { status: string; held_until?: Date | string | null }

/** Hold vyprší, pokud je dávno po held_until (dá se smazat/uvolnit, viz expireStaleHolds). */
export function isHoldExpired(booking: BookingLike, at: Date = new Date()): boolean {
  if (booking.status !== "held" || !booking.held_until) return false
  return new Date(booking.held_until).getTime() <= at.getTime()
}

export function clampHoldMinutes(minutes: number | undefined, fallback = 15, max = 60): number {
  const m = Number.isFinite(minutes) ? Math.trunc(minutes as number) : fallback
  return Math.min(Math.max(m, 1), max)
}

export const UNIQUE_VIOLATION = /duplicate key|unique constraint|23505/i
