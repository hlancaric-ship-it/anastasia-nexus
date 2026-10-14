import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { BOOKING_MODULE } from "../../modules/booking"
import { recordEvent } from "../observability/events"

/**
 * Jednotný vstup pro zákaznická upozornění z backendu.
 *
 * Pravidla:
 * - adresát se dohledá na serveru z vlastníka entity (nikdy ze vstupu klienta);
 * - `idempotency_key` = typ + ID entity → opakovaný subscriber / retry nepošle druhý e-mail;
 * - data šablony nesou jen ID, termín a odkaz – žádné osobní údaje ani poznámky;
 * - `notify` nikdy nevyhodí: selhání upozornění nesmí shodit platbu ani zrušení objednávky.
 */
export type NotifyEvent =
  | { type: "booking.confirmed"; booking_id: string; order_id?: string | null }
  | { type: "booking.canceled"; booking_id: string; order_id?: string | null }

export type NotifyResult = { status: "sent" | "duplicate" | "skipped"; reason?: string }

export const NOTIFY_TEMPLATES = {
  "booking.confirmed": "booking-confirmed-sk",
  "booking.canceled": "booking-canceled-sk",
} as const satisfies Record<NotifyEvent["type"], string>

const SUBJECTS: Record<NotifyEvent["type"], string> = {
  "booking.confirmed": "Vaša konzultácia je potvrdená",
  "booking.canceled": "Vaša konzultácia bola zrušená",
}

/** Důvody zrušení, které smí do šablony (technické kódy); volný text adminu se mapuje na "other". */
const PUBLIC_CANCEL_REASONS = new Set(["order_canceled", "customer_request", "admin_canceled"])

type BookingRow = { id: string; customer_id: string | null; status: string; starts_at: Date | string; ends_at: Date | string; cancel_reason?: string | null }
type NotificationService = {
  createNotifications: (data: Record<string, unknown>) => Promise<unknown>
  listNotifications: (filters: Record<string, unknown>, config?: Record<string, unknown>) => Promise<Array<{ id: string }>>
}

const env = (name: string) => (process.env[name] || "").trim()
const iso = (value: Date | string) => (value instanceof Date ? value : new Date(value)).toISOString()

export function notifyIdempotencyKey(event: NotifyEvent): string {
  return `${event.type}:${event.booking_id}`
}

export async function notify(container: MedusaContainer, event: NotifyEvent): Promise<NotifyResult> {
  const template = NOTIFY_TEMPLATES[event.type]
  const base = { notify_type: event.type, template, booking_id: event.booking_id, order_id: event.order_id ?? undefined }
  try {
    const bookings = container.resolve(BOOKING_MODULE) as { listBookings: (f: Record<string, unknown>, c?: Record<string, unknown>) => Promise<BookingRow[]> }
    const [booking] = await bookings.listBookings({ id: event.booking_id }, { take: 1 })
    if (!booking) return skipped(container, base, "BOOKING_NOT_FOUND")
    const expected = event.type === "booking.confirmed" ? "confirmed" : "canceled"
    if (booking.status !== expected) return skipped(container, base, "STATUS_MISMATCH")
    if (!booking.customer_id) return skipped(container, base, "NO_CUSTOMER")

    const query = container.resolve(ContainerRegistrationKeys.QUERY) as { graph: (q: Record<string, unknown>) => Promise<{ data: Array<{ email?: string | null }> }> }
    const { data } = await query.graph({ entity: "customer", fields: ["id", "email"], filters: { id: booking.customer_id } })
    const to = data?.[0]?.email?.trim()
    if (!to) return skipped(container, base, "NO_EMAIL")

    const notifications = container.resolve(Modules.NOTIFICATION) as unknown as NotificationService
    const idempotency_key = notifyIdempotencyKey(event)
    const existing = await notifications.listNotifications({ idempotency_key }, { take: 1, select: ["id"] })
    if (existing?.length) {
      await recordEvent(container, "info", "notification", "duplicate_suppressed", base)
      return { status: "duplicate" }
    }

    const accountUrl = env("ACCOUNT_BOOKINGS_URL")
    const reason = event.type === "booking.canceled" ? (booking.cancel_reason ?? null) : null
    await notifications.createNotifications({
      to,
      channel: "email",
      template,
      idempotency_key,
      resource_id: booking.id,
      resource_type: "booking",
      data: {
        subject: SUBJECTS[event.type],
        booking_id: booking.id,
        starts_at: iso(booking.starts_at),
        ends_at: iso(booking.ends_at),
        url: accountUrl || null,
        ...(event.type === "booking.canceled" ? { cancel_kind: reason && PUBLIC_CANCEL_REASONS.has(reason) ? reason : "other" } : {}),
      },
    })
    await recordEvent(container, "info", "notification", "sent", base)
    return { status: "sent" }
  } catch (error) {
    await recordEvent(container, "error", "notification", "send_failed", { ...base, error })
    return { status: "skipped", reason: "SEND_FAILED" }
  }
}

async function skipped(container: MedusaContainer, fields: Record<string, unknown>, reason: string): Promise<NotifyResult> {
  await recordEvent(container, "warn", "notification", "skipped", { ...fields, skip_reason: reason })
  return { status: "skipped", reason }
}
