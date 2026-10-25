import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { BOOKING_MODULE } from "../../../../modules/booking"
import type BookingModuleService from "../../../../modules/booking/service"
import { hashRequestToken, isRequestToken } from "../../../../modules/booking/request-policy"
import { productHandle } from "../../../../lib/booking-requests"

/** GET /store/booking-requests/:id?t=token: stav schválenej žiadosti pre stránku platby (len so správnym tokenom z e-mailu). */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  const token = (req.query as Record<string, unknown>)?.t
  if (!isRequestToken(token)) return res.status(404).json({ type: "not_found" })
  try {
    const service = req.scope.resolve(BOOKING_MODULE) as BookingModuleService
    const [request] = await service.listBookingRequests({ id: req.params.id }, { take: 1 })
    if (!request || request.status !== "approved" || !request.booking_id || request.token_hash !== hashRequestToken(token)) return res.status(404).json({ type: "not_found" })
    const [booking] = await service.listBookings({ id: request.booking_id }, { take: 1 })
    const active = !!booking && (booking.status === "confirmed" || (booking.status === "held" && (!booking.held_until || new Date(booking.held_until).getTime() > Date.now())))
    return res.json({ request: {
      id: request.id, product_id: request.product_id, product_handle: await productHandle(req.scope, request.product_id),
      starts_at: request.starts_at, ends_at: request.ends_at, name: request.name,
      booking_id: request.booking_id, booking_status: booking?.status ?? null, held_until: booking?.held_until ?? null,
      payable: active && booking.status === "held", paid: booking?.status === "confirmed",
    } })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("GET /store/booking-requests/:id zlyhalo", error as Error)
    return res.status(500).json({ type: "unexpected_state" })
  }
}
