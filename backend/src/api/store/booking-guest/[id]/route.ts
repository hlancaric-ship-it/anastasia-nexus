import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { BOOKING_MODULE } from "../../../../modules/booking"
import type BookingModuleService from "../../../../modules/booking/service"
import { guestOwner } from "../../../../modules/booking/service"
import { loadGuestCart } from "../helpers"
import { publicBooking } from "../route"

/** GET /store/booking-guest/:id?cart_id=: stav podržaného termínu hosťa pred platbou. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const cart = await loadGuestCart(req, req.query?.cart_id)
    const [booking] = cart ? await (req.scope.resolve(BOOKING_MODULE) as BookingModuleService).listBookings({ id: req.params.id, customer_id: guestOwner(cart.id) }, { take: 1 }) : []
    if (!booking) return res.status(404).json({ type: "not_found" })
    res.setHeader("Cache-Control", "no-store")
    return res.status(200).json({ booking: publicBooking(booking) })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("GET /store/booking-guest/:id zlyhalo", error as Error)
    return res.status(500).json({ type: "unexpected_state" })
  }
}
