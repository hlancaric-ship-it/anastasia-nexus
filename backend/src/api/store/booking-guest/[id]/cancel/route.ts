import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { BOOKING_MODULE } from "../../../../../modules/booking"
import type BookingModuleService from "../../../../../modules/booking/service"
import { guestOwner } from "../../../../../modules/booking/service"
import { loadGuestCart } from "../../helpers"

/** POST /store/booking-guest/:id/cancel { cart_id }: hosť uvoľní svoj nezaplatený termín. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const cart = await loadGuestCart(req, (req.body as { cart_id?: unknown } | undefined)?.cart_id)
    const service = req.scope.resolve(BOOKING_MODULE) as BookingModuleService
    const [booking] = cart ? await service.listBookings({ id: req.params.id, customer_id: guestOwner(cart.id), status: "held" }, { take: 1 }) : []
    if (!booking) return res.status(404).json({ type: "not_found" })
    await service.cancel(booking.id, "customer_request")
    return res.status(200).json({ canceled: true })
  } catch (error) {
    if (error instanceof MedusaError && error.type === MedusaError.Types.NOT_ALLOWED) return res.status(409).json({ type: "not_allowed" })
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("POST /store/booking-guest/:id/cancel zlyhalo", error as Error)
    return res.status(500).json({ type: "unexpected_state" })
  }
}
