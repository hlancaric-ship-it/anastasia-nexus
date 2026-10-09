import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { BOOKING_MODULE } from "../../../../../modules/booking"
import type BookingModuleService from "../../../../../modules/booking/service"

/** POST /store/bookings/:id/cancel: zákaznice ruší jen svou vlastní rezervaci. */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = req.auth_context?.actor_type === "customer" ? req.auth_context.actor_id : undefined
  if (!customerId) return res.status(401).json({ type: "unauthorized", message: "Přihlášení je povinné" })
  const id = req.params?.id
  if (!id) return res.status(400).json({ type: "invalid_data", message: "Chybí id" })

  try {
    const service = req.scope.resolve(BOOKING_MODULE) as BookingModuleService
    const current = await (service as any).retrieveBooking(id)
    if (current.customer_id !== customerId) return res.status(404).json({ type: "not_found", message: "Rezervace neexistuje" })
    const booking = await service.cancel(id, "customer_request")
    return res.status(200).json({ booking })
  } catch (error) {
    if (error instanceof MedusaError && error.type === MedusaError.Types.NOT_FOUND) {
      return res.status(404).json({ type: "not_found", message: "Rezervace neexistuje" })
    }
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("POST /store/bookings/:id/cancel selhalo", error as Error)
    return res.status(500).json({ type: "unexpected_state", message: "Zrušení selhalo" })
  }
}
