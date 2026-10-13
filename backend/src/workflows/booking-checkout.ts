import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import type BookingModuleService from "../modules/booking/service"

/** Validate the same immutable snapshot that Medusa will turn into an order. */
export async function claimCartBooking(cart: any, container: MedusaContainer) {
  if (cart.completed_at) return
  const ids = [...new Set<string>(cart.items.map((item: any) => item.product_id).filter(Boolean))]
  const { data: products } = ids.length ? await container.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "product", fields: ["id", "metadata"], filters: { id: ids } }) : { data: [] }
  const bookable = products.filter((product: any) => product.metadata?.booking)
  const id = cart.metadata?.booking_id
  if (!bookable.length && !id) return
  if (bookable.length !== 1 || typeof id !== "string" || !id.trim()) throw new MedusaError(MedusaError.Types.INVALID_DATA, "BOOKING_REQUIRED")
  const items = cart.items.filter((item: any) => item.product_id === bookable[0].id)
  if (items.reduce((sum: number, item: any) => sum + Number(item.quantity), 0) !== 1) throw new MedusaError(MedusaError.Types.INVALID_DATA, "BOOKING_QUANTITY_INVALID")
  const customerId = cart.customer_id || cart.customer?.id
  if (!customerId) throw new MedusaError(MedusaError.Types.INVALID_DATA, "BOOKING_CUSTOMER_REQUIRED")
  return await container.resolve<BookingModuleService>("booking").claimForCheckout({
    id, cart_id: cart.id, customer_id: customerId, product_id: bookable[0].id,
  })
}
