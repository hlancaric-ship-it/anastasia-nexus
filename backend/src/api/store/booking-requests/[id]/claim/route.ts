import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateCartWorkflow } from "@medusajs/medusa/core-flows"
import { BOOKING_MODULE } from "../../../../../modules/booking"
import type BookingModuleService from "../../../../../modules/booking/service"
import { guestOwner, RequestStateError } from "../../../../../modules/booking/service"
import { hashRequestToken, isRequestToken } from "../../../../../modules/booking/request-policy"
import { loadGuestCart, productQuantity } from "../../../booking-guest/helpers"

/**
 * POST /store/booking-requests/:id/claim { t, cart_id }: schválený termín sa naviaže na košík.
 * Prihlásený zákazník na svoj košík, hosť na košík bez účtu. Doklad je token z e-mailu.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  const body = (req.body ?? {}) as { t?: unknown; cart_id?: unknown }
  if (!isRequestToken(body.t) || typeof body.cart_id !== "string") return res.status(400).json({ type: "invalid_data" })
  try {
    const service = req.scope.resolve(BOOKING_MODULE) as BookingModuleService
    const [request] = await service.listBookingRequests({ id: req.params.id }, { take: 1 })
    if (!request) return res.status(404).json({ type: "not_found" })
    const customerId = req.auth_context?.actor_type === "customer" ? req.auth_context.actor_id : undefined
    let owner: string
    let items: Array<{ product_id?: string | null; quantity?: number | null }>
    if (customerId) {
      const { data } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "cart", fields: ["id", "customer_id", "completed_at", "items.product_id", "items.quantity"], filters: { id: body.cart_id } })
      const cart = data?.[0]
      if (!cart || cart.completed_at || cart.customer_id !== customerId) return res.status(404).json({ type: "cart_not_found" })
      owner = customerId
      items = (cart.items || []).filter(Boolean) as typeof items
    } else {
      const cart = await loadGuestCart(req, body.cart_id)
      if (!cart) return res.status(404).json({ type: "cart_not_found" })
      owner = guestOwner(cart.id)
      items = cart.items
    }
    if (productQuantity({ id: body.cart_id, items }, request.product_id) !== 1) return res.status(409).json({ type: "invalid_cart", message: "Košík musí obsahovať práve jednu túto konzultáciu" })
    const booking = await service.claimApprovedRequest({ id: request.id, token_hash: hashRequestToken(body.t), cart_id: body.cart_id, owner })
    await updateCartWorkflow(req.scope).run({ input: { id: body.cart_id, metadata: { booking_id: booking.id } } })
    return res.json({ booking: { id: booking.id, product_id: booking.product_id, status: booking.status, starts_at: booking.starts_at, ends_at: booking.ends_at, held_until: booking.held_until } })
  } catch (error) {
    if (error instanceof RequestStateError) return res.status(409).json({ type: error.code.toLowerCase() })
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("POST /store/booking-requests/:id/claim zlyhalo", error as Error)
    return res.status(500).json({ type: "unexpected_state" })
  }
}
