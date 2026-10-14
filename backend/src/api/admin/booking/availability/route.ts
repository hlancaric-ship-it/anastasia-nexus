import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { BOOKING_MODULE } from "../../../../modules/booking"
import { BOOKING_TIMEZONE, isIsoDate, mondayOf, validateWeekInput, weekDates } from "../../../../modules/booking/availability"
import { AvailabilityConflictError, type CalendarBookingRow } from "../../../../modules/booking/service"
import type BookingModuleService from "../../../../modules/booking/service"
import { addDays, zonedToUtc } from "../../../../modules/booking/slots"
import { requireAdmin } from "../types/helpers"
import { auditAdminChange } from "../../../../lib/observability/audit"

type Scope = AuthenticatedMedusaRequest["scope"]

/** Rezervace s jménem zákaznice a názvem typu pro přehled v adminu. */
async function describeBookings(scope: Scope, rows: CalendarBookingRow[]) {
  if (!rows.length) return []
  const query: any = scope.resolve(ContainerRegistrationKeys.QUERY)
  const customerIds = [...new Set(rows.map((b) => b.customer_id))]
  const productIds = [...new Set(rows.map((b) => b.product_id))]
  const [{ data: customers }, { data: products }] = await Promise.all([
    query.graph({ entity: "customer", fields: ["id", "first_name", "last_name", "email"], filters: { id: customerIds } }),
    query.graph({ entity: "product", fields: ["id", "title"], filters: { id: productIds }, withDeleted: true }),
  ])
  const customerById = new Map<string, any>((customers ?? []).map((c: any) => [c.id, c]))
  const productById = new Map<string, any>((products ?? []).map((p: any) => [p.id, p]))
  return rows.map((b) => {
    const c = customerById.get(b.customer_id)
    const name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ").trim() : ""
    return {
      id: b.id,
      status: b.status,
      paid: b.status === "confirmed",
      in_checkout: b.in_checkout,
      order_id: b.order_id,
      starts_at: b.starts_at.toISOString(),
      ends_at: b.ends_at.toISOString(),
      held_until: b.held_until?.toISOString() ?? null,
      buffer_minutes: b.buffer_minutes,
      customer: { id: b.customer_id, name: name || c?.email || "Zákaznice", email: c?.email ?? null },
      product: { id: b.product_id, title: productById.get(b.product_id)?.title ?? "Neznámý typ" },
    }
  })
}

async function weekView(scope: Scope, weekStart: string) {
  const service = scope.resolve(BOOKING_MODULE) as BookingModuleService
  const dates = weekDates(weekStart)
  const from = zonedToUtc(dates[0], 0, BOOKING_TIMEZONE)!
  const to = zonedToUtc(addDays(dates[6], 1), 0, BOOKING_TIMEZONE)!
  const [windows, bookings] = await Promise.all([
    service.listAvailability(dates[0], dates[6]),
    service.listCalendarBookings(from, to),
  ])
  return {
    week_start: weekStart,
    timezone: BOOKING_TIMEZONE,
    days: dates.map((date) => ({
      date,
      ranges: windows.filter((w) => w.date === date).map((w) => ({ start_time: w.start_time, end_time: w.end_time })),
    })),
    bookings: await describeBookings(scope, bookings),
  }
}

/** GET /admin/booking/availability?week_start=YYYY-MM-DD : volné úseky a obsazené termíny týdne (po–ne). */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!requireAdmin(req)) return res.status(401).json({ message: "Vyžaduje se přihlášení správce." })
  const raw = Array.isArray(req.query?.week_start) ? req.query.week_start[0] : req.query?.week_start
  if (!isIsoDate(raw)) return res.status(400).json({ message: "week_start musí být datum ve tvaru YYYY-MM-DD" })
  try {
    return res.json(await weekView(req.scope, mondayOf(raw)))
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("GET /admin/booking/availability selhalo", error as Error)
    return res.status(500).json({ message: "Volné termíny se nepodařilo načíst." })
  }
}

/**
 * POST /admin/booking/availability { week_start, days: [{ date, ranges: [{ start_time, end_time }] }] }
 * Nahradí celý týden. Den bez úseků = zavřeno. 409, pokud by aktivní rezervace vypadla z úseků.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!requireAdmin(req)) return res.status(401).json({ message: "Vyžaduje se přihlášení správce." })
  const parsed = validateWeekInput(req.body)
  if (!parsed.ok) return res.status(400).json({ message: parsed.errors.join("; "), errors: parsed.errors })
  try {
    const service = req.scope.resolve(BOOKING_MODULE) as BookingModuleService
    await service.replaceWeekAvailability(parsed.value)
    await auditAdminChange(req, "booking_availability.set_week", "booking_week", parsed.value.week_start, null, { days: parsed.value.days })
    return res.json(await weekView(req.scope, parsed.value.week_start))
  } catch (error) {
    if (error instanceof AvailabilityConflictError) {
      const conflicts = await describeBookings(req.scope, error.bookings).catch(() => [])
      return res.status(409).json({
        type: "availability_conflict",
        message: "Některé úseky nejde odebrat ani zkrátit, protože do nich zasahuje rezervace. Nejdřív ji přesuňte nebo zrušte.",
        conflicts,
      })
    }
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("POST /admin/booking/availability selhalo", error as Error)
    return res.status(500).json({ message: "Volné termíny se nepodařilo uložit." })
  }
}
