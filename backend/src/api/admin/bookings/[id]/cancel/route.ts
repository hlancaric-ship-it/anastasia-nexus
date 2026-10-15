import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { BOOKING_MODULE } from "../../../../../modules/booking"
import type BookingModuleService from "../../../../../modules/booking/service"
import { auditAdminChange } from "../../../../../lib/observability/audit"
import { notify } from "../../../../../lib/notify"

/** POST /admin/bookings/:id/cancel { reason? } */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const id = req.params?.id
  if (!id) return res.status(400).json({ type: "invalid_data", message: "Chybí id" })
  const reasonRaw = (req.body as { reason?: unknown } | undefined)?.reason
  const reason = typeof reasonRaw === "string" && reasonRaw.trim() ? reasonRaw.trim().slice(0, 500) : "admin_canceled"
  try {
    const service = req.scope.resolve(BOOKING_MODULE) as BookingModuleService
    const [before] = await service.listBookings({ id }, { take: 1 })
    const booking = await service.cancel(id, reason)
    // zákaznici upozorníme jen na zrušení potvrzeného termínu (ne na propadlý / nezaplacený hold)
    if (before?.status === "confirmed") await notify(req.scope, { type: "booking.canceled", booking_id: id })
    await auditAdminChange(req, "booking.cancel", "booking", id, null, { status: (booking as { status?: string })?.status ?? "cancelled", reason })
    return res.status(200).json({ booking })
  } catch (error) {
    if (error instanceof MedusaError && error.type === MedusaError.Types.NOT_FOUND) {
      return res.status(404).json({ type: "not_found", message: "Rezervace neexistuje" })
    }
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("POST /admin/bookings/:id/cancel selhalo", error as Error)
    return res.status(500).json({ type: "unexpected_state", message: "Zrušení selhalo" })
  }
}
