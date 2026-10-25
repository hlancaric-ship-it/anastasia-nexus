import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { BOOKING_MODULE } from "../../../../../modules/booking"
import type BookingModuleService from "../../../../../modules/booking/service"
import { RequestStateError, SlotTakenError } from "../../../../../modules/booking/service"
import { loadBookableProduct } from "../../../../../modules/booking/offer"
import { APPROVED_HOLD_HOURS, hashRequestToken, newRequestToken } from "../../../../../modules/booking/request-policy"
import { notifySafe, productTitle, requestPayUrl } from "../../../../../lib/booking-requests"

/** POST /admin/booking-requests/:id/approve: podrží termín klientovi na 72 h a pošle mu odkaz na platbu. */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const service = req.scope.resolve(BOOKING_MODULE) as BookingModuleService
    const [current] = await service.listBookingRequests({ id: req.params.id }, { take: 1 })
    if (!current) return res.status(404).json({ message: "Žiadosť neexistuje" })
    const product = await loadBookableProduct(req.scope, current.product_id)
    if (!product) return res.status(409).json({ message: "Konzultácia už nie je v ponuke, žiadosť sa nedá schváliť." })
    const token = newRequestToken()
    const { request, booking } = await service.approveRequest({ id: current.id, token_hash: hashRequestToken(token), bufferMinutes: product.config.bufferMinutes, holdHours: APPROVED_HOLD_HOURS })
    const url = requestPayUrl(request.id, token)
    if (!url) logger.error("[booking-request] chýba ANASTASIA_SITE_URL – odkaz na platbu sa nedá zostaviť")
    const sent = url ? await notifySafe(req.scope, {
      to: request.email, template: "booking-request-approved-sk", resource_type: "booking_request", resource_id: request.id, idempotency_key: `booking-request.approved:${request.id}`,
      data: { name: request.name, product_title: await productTitle(req.scope, request.product_id), starts_at: new Date(request.starts_at).toISOString(), ends_at: new Date(request.ends_at).toISOString(), held_until: booking.held_until, url },
    }) : false
    return res.json({ ok: true, email_sent: sent, request: { id: request.id, status: "approved", booking: { id: booking.id, status: booking.status, held_until: booking.held_until } } })
  } catch (error) {
    if (error instanceof SlotTakenError) return res.status(409).json({ message: "V tomto čase už je iný termín. Žiadosť zamietnite alebo najprv uvoľnite kalendár." })
    if (error instanceof RequestStateError) return res.status(409).json({ message: "Žiadosť už bola vybavená." })
    if (error instanceof MedusaError && error.type === MedusaError.Types.NOT_FOUND) return res.status(404).json({ message: "Žiadosť neexistuje" })
    logger.error("POST /admin/booking-requests/:id/approve zlyhalo", error as Error)
    return res.status(500).json({ message: "Schválenie zlyhalo" })
  }
}
