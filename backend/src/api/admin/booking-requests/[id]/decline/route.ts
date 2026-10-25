import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { BOOKING_MODULE } from "../../../../../modules/booking"
import type BookingModuleService from "../../../../../modules/booking/service"
import { RequestStateError } from "../../../../../modules/booking/service"
import { notifySafe, productHandle } from "../../../../../lib/booking-requests"
import { resolveStorefrontOrigin } from "../../../../../lib/feeds/policy"

/** POST /admin/booking-requests/:id/decline { reason? }: klient dostane e-mail s výzvou navrhnúť iný termín. */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const raw = (req.body as { reason?: unknown } | undefined)?.reason
  const reason = typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 600) : null
  try {
    const service = req.scope.resolve(BOOKING_MODULE) as BookingModuleService
    const request = await service.declineRequest({ id: req.params.id, reason })
    const origin = resolveStorefrontOrigin()
    const handle = await productHandle(req.scope, request.product_id)
    const url = origin ? `${origin}/konzultacie/rezervacia${handle ? `?typ=${encodeURIComponent(handle)}` : ""}` : null
    const sent = await notifySafe(req.scope, {
      to: request.email, template: "booking-request-declined-sk", resource_type: "booking_request", resource_id: request.id, idempotency_key: `booking-request.declined:${request.id}`,
      data: { name: request.name, starts_at: new Date(request.starts_at).toISOString(), ends_at: new Date(request.ends_at).toISOString(), reason, url },
    })
    return res.json({ ok: true, email_sent: sent, request: { id: request.id, status: "declined" } })
  } catch (error) {
    if (error instanceof RequestStateError) return res.status(409).json({ message: "Žiadosť už bola vybavená." })
    if (error instanceof MedusaError && error.type === MedusaError.Types.NOT_FOUND) return res.status(404).json({ message: "Žiadosť neexistuje" })
    logger.error("POST /admin/booking-requests/:id/decline zlyhalo", error as Error)
    return res.status(500).json({ message: "Zamietnutie zlyhalo" })
  }
}
