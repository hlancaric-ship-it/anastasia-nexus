import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { BOOKING_MODULE } from "../../../modules/booking"
import type BookingModuleService from "../../../modules/booking/service"
import { DEFAULT_BOOKING_CONFIG, generateSlots } from "../../../modules/booking/slots"

const MAX_RANGE_DAYS = 31

function parseDate(value: unknown): string | null {
  const s = Array.isArray(value) ? value[0] : value
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

/** GET /store/booking-slots?product_id&from&to : volné termíny pro konzultaci (veřejné, bez PII). */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const productId = typeof req.query?.product_id === "string" ? req.query.product_id : ""
  const from = parseDate(req.query?.from)
  const to = parseDate(req.query?.to)
  if (!productId || !from || !to || from > to) {
    return res.status(400).json({ type: "invalid_data", message: "product_id, from a to (YYYY-MM-DD, from <= to) jsou povinné" })
  }
  const spanDays = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000
  if (spanDays > MAX_RANGE_DAYS) {
    return res.status(400).json({ type: "invalid_data", message: `Rozsah smí být nejvýš ${MAX_RANGE_DAYS} dní` })
  }

  try {
    const query: any = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: products } = await query.graph({ entity: "product", fields: ["id", "metadata"], filters: { id: productId } })
    const product = products?.[0]
    if (!product) return res.status(404).json({ type: "not_found", message: "Produkt neexistuje" })
    const bookingMeta = (product.metadata?.booking ?? null) as Record<string, unknown> | null
    if (!bookingMeta) return res.status(404).json({ type: "not_found", message: "Produkt nemá rezervace" })

    const bookingService = req.scope.resolve(BOOKING_MODULE) as BookingModuleService
    const busy = await bookingService.listActiveInRange(productId, new Date(from), new Date(`${to}T23:59:59Z`))
    const slots = generateSlots({
      config: { ...DEFAULT_BOOKING_CONFIG, ...(typeof bookingMeta === "object" ? bookingMeta : {}) },
      rules: Array.isArray((bookingMeta as any).rules) ? (bookingMeta as any).rules : [],
      exceptions: Array.isArray((bookingMeta as any).exceptions) ? (bookingMeta as any).exceptions : [],
      busy,
      fromDate: from,
      toDate: to,
    })
    res.setHeader("Cache-Control", "no-store")
    return res.status(200).json({ product_id: productId, slots })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("GET /store/booking-slots selhalo", error as Error)
    return res.status(500).json({ type: "unexpected_state", message: "Načtení termínů selhalo" })
  }
}
