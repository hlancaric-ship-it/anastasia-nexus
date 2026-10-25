import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateCartWorkflow } from "@medusajs/medusa/core-flows"
import { BOOKING_MODULE } from "../../../modules/booking"
import type BookingModuleService from "../../../modules/booking/service"
import { SlotNotAvailableError, SlotTakenError } from "../../../modules/booking/service"
import { loadBookableProduct, offeredSlots } from "../../../modules/booking/offer"
import { utcToLocalDate } from "../../../modules/booking/slots"
import { loadGuestCart, productQuantity } from "./helpers"

/**
 * POST /store/booking-guest { cart_id, product_id, starts_at }: hosť bez registrácie podrží termín pre svoj košík.
 * Košík už musí obsahovať práve jednu konzultáciu tohto typu, termín sa rovno naviaže na košík (metadata.booking_id).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as { cart_id?: unknown; product_id?: unknown; starts_at?: unknown }
  const productId = typeof body.product_id === "string" ? body.product_id.trim() : ""
  const requested = new Date(typeof body.starts_at === "string" ? body.starts_at : "")
  if (!productId || !Number.isFinite(requested.getTime())) return res.status(400).json({ type: "invalid_data", message: "product_id a starts_at sú povinné" })
  try {
    const cart = await loadGuestCart(req, body.cart_id)
    if (!cart) return res.status(404).json({ type: "not_found", message: "Košík neexistuje" })
    if (productQuantity(cart, productId) !== 1) return res.status(409).json({ type: "invalid_cart", message: "Košík musí obsahovať práve jednu konzultáciu" })
    const product = await loadBookableProduct(req.scope, productId)
    if (!product) return res.status(404).json({ type: "not_found", message: "Produkt nemá rezervácie" })
    const config = product.config
    const day = utcToLocalDate(requested, config.timezone)
    const offered = (await offeredSlots(req.scope, config, day, day)).find((s) => new Date(s.start).getTime() === requested.getTime())
    if (!offered) return res.status(409).json({ type: "slot_not_offered", message: "Tento termín už nie je ponúkaný." })

    const bookings = req.scope.resolve(BOOKING_MODULE) as BookingModuleService
    const booking = await bookings.holdGuestSlot({
      cart_id: cart.id, customer_id: "", product_id: productId,
      starts_at: new Date(offered.start), ends_at: new Date(offered.end),
      bufferMinutes: config.bufferMinutes, timezone: config.timezone,
    })
    await updateCartWorkflow(req.scope).run({ input: { id: cart.id, metadata: { booking_id: booking.id } } })
    res.setHeader("Cache-Control", "no-store")
    return res.status(201).json({ booking: publicBooking(booking) })
  } catch (error) {
    if (error instanceof SlotNotAvailableError) return res.status(409).json({ type: "slot_not_offered", message: "Tento termín už nie je ponúkaný." })
    if (error instanceof SlotTakenError) return res.status(409).json({ type: "slot_taken", message: "Termín práve obsadil niekto iný." })
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("POST /store/booking-guest zlyhalo", error as Error)
    return res.status(500).json({ type: "unexpected_state", message: "Rezervácia zlyhala" })
  }
}

/** Hosťovi sa nevracia customer_id ani metadata, len to, čo potrebuje pokladňa. */
export const publicBooking = (b: any) => ({ id: b.id, product_id: b.product_id, status: b.status, starts_at: b.starts_at, ends_at: b.ends_at, held_until: b.held_until })
