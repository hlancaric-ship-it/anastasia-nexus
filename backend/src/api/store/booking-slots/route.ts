import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { isIsoDate } from "../../../modules/booking/availability"
import { loadBookableProduct, offeredSlots } from "../../../modules/booking/offer"

const MAX_RANGE_DAYS = 31

function parseDate(value: unknown): string | null {
  const s = Array.isArray(value) ? value[0] : value
  return isIsoDate(s) ? s : null
}

/**
 * GET /store/booking-slots?product_id&from&to : volné termíny typu konzultace (veřejné, bez PII).
 * Okna = ručně zadané úseky kalendáře, obsazenost = všechny typy v kalendáři.
 */
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
    const product = await loadBookableProduct(req.scope, productId)
    if (!product) return res.status(404).json({ type: "not_found", message: "Produkt nemá rezervace" })
    const slots = await offeredSlots(req.scope, product.config, from, to)
    res.setHeader("Cache-Control", "no-store")
    return res.status(200).json({ product_id: productId, slots })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("GET /store/booking-slots selhalo", error as Error)
    return res.status(500).json({ type: "unexpected_state", message: "Načtení termínů selhalo" })
  }
}
