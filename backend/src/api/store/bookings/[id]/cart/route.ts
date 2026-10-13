import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { updateCartWorkflow } from "@medusajs/medusa/core-flows"
import type BookingModuleService from "../../../../../modules/booking/service"

/** Only an authenticated owner can authorize which cart purchases a hold.
 * Cart.customer_id alone is insufficient: guest carts can be resolved by email. */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = req.auth_context?.actor_type === "customer" ? req.auth_context.actor_id : undefined
  if (!customerId) return res.status(401).json({ type: "unauthorized" })
  const cartId = (req.body as { cart_id?: unknown })?.cart_id
  if (typeof cartId !== "string" || !cartId) return res.status(400).json({ type: "invalid_data" })
  const bookings = req.scope.resolve<BookingModuleService>("booking")
  try {
    const booking = await bookings.retrieveBooking(req.params.id)
    if (booking.customer_id !== customerId) return res.status(404).json({ type: "not_found" })
    const { data } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "cart", fields: ["id", "customer_id", "completed_at", "items.product_id", "items.quantity"], filters: { id: cartId } })
    const cart = data[0]
    if (!cart || cart.customer_id !== customerId) return res.status(404).json({ type: "not_found" })
    if (cart.completed_at || cart.items?.filter(item => item?.product_id === booking.product_id).reduce((sum, item) => sum + Number(item?.quantity), 0) !== 1) return res.status(409).json({ type: "invalid_cart" })
    await bookings.authorizeCart({ id: booking.id, customer_id: customerId, cart_id: cartId })
    await updateCartWorkflow(req.scope).run({ input: { id: cartId, metadata: { booking_id: booking.id } } })
    return res.status(200).json({ booking_id: booking.id, cart_id: cartId })
  } catch (error) {
    if (error instanceof MedusaError && error.type === MedusaError.Types.NOT_FOUND) return res.status(404).json({ type: "not_found" })
    if (error instanceof MedusaError && error.type === MedusaError.Types.NOT_ALLOWED) return res.status(409).json({ type: "booking_unavailable" })
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("Booking cart attachment failed", error as Error)
    return res.status(500).json({ type: "unexpected_state" })
  }
}
