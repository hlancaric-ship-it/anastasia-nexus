import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { BOOKING_MODULE } from "../../../modules/booking"
import type BookingModuleService from "../../../modules/booking/service"
import { loadBookableProduct, offeredSlots } from "../../../modules/booking/offer"
import { utcToLocalDate } from "../../../modules/booking/slots"
import { SlotNotAvailableError, SlotTakenError } from "../../../modules/booking/service"

function requireCustomer(req: AuthenticatedMedusaRequest, res: MedusaResponse): string | null {
  const id = req.auth_context?.actor_type === "customer" ? req.auth_context.actor_id : undefined
  if (!id) res.status(401).json({ type: "unauthorized", message: "Přihlášení je povinné" })
  return id ?? null
}

/** GET /store/bookings: vlastní rezervace přihlášené zákaznice. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireCustomer(req, res)
  if (!customerId) return
  try {
    const service = req.scope.resolve(BOOKING_MODULE) as BookingModuleService
    const [data, count] = await (service as any).listAndCountBookings({ customer_id: customerId }, { order: { starts_at: "DESC" }, take: 100 })
    return res.status(200).json({ bookings: data, count })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("GET /store/bookings selhalo", error as Error)
    return res.status(500).json({ type: "unexpected_state", message: "Načtení rezervací selhalo" })
  }
}

/** POST /store/bookings { product_id, starts_at }: zarezervuje nabízený termín (held, do checkoutu). */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireCustomer(req, res)
  if (!customerId) return
  const body = (req.body ?? {}) as { product_id?: unknown; starts_at?: unknown }
  const productId = typeof body.product_id === "string" ? body.product_id.trim() : ""
  const startsAtRaw = typeof body.starts_at === "string" ? body.starts_at : ""
  if (!productId || !startsAtRaw) return res.status(400).json({ type: "invalid_data", message: "product_id a starts_at jsou povinné" })

  try {
    const requested = new Date(startsAtRaw)
    if (!Number.isFinite(requested.getTime())) return res.status(400).json({ type: "invalid_data", message: "starts_at musí být platný čas" })
    const product = await loadBookableProduct(req.scope, productId)
    if (!product) return res.status(404).json({ type: "not_found", message: "Produkt nemá rezervace" })
    const config = product.config
    const day = utcToLocalDate(requested, config.timezone)
    const offered = (await offeredSlots(req.scope, config, day, day)).find((s) => new Date(s.start).getTime() === requested.getTime())
    // Server nevěří klientovi: požadovaný začátek musí být MEZI skutečně nabízenými sloty (fail-closed).
    if (!offered) return res.status(409).json({ type: "slot_not_offered", message: "Tento termín už není nabízen, zvolte prosím jiný." })

    const bookingService = req.scope.resolve(BOOKING_MODULE) as BookingModuleService
    const booking = await bookingService.holdSlot({
      customer_id: customerId,
      product_id: productId,
      starts_at: new Date(offered.start),
      ends_at: new Date(offered.end),
      bufferMinutes: config.bufferMinutes,
      timezone: config.timezone,
    })
    res.setHeader("Cache-Control", "no-store")
    return res.status(201).json({ booking })
  } catch (error) {
    if (error instanceof SlotNotAvailableError) return res.status(409).json({ type: "slot_not_offered", message: "Tento termín už není nabízen, zvolte prosím jiný." })
    if (error instanceof SlotTakenError) return res.status(409).json({ type: "slot_taken", message: "Termín právě obsadil někdo jiný, zvolte prosím jiný." })
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("POST /store/bookings selhalo", error as Error)
    return res.status(500).json({ type: "unexpected_state", message: "Rezervace selhala" })
  }
}
