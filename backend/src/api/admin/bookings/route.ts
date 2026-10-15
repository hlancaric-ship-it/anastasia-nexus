import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { BOOKING_MODULE } from "../../../modules/booking"
import type BookingModuleService from "../../../modules/booking/service"

const str = (v: unknown) => { const s = Array.isArray(v) ? v[0] : v; return typeof s === "string" && s.trim() ? s.trim() : undefined }
const int = (v: unknown, fallback: number) => { const n = Number(Array.isArray(v) ? v[0] : v); return Number.isFinite(n) ? Math.trunc(n) : fallback }

/** GET /admin/bookings?customer_id&product_id&status: správa rezervací klientkou v adminu. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  try {
    const service = req.scope.resolve(BOOKING_MODULE) as BookingModuleService
    const filters: Record<string, unknown> = {}
    for (const key of ["customer_id", "product_id", "status"] as const) {
      const v = str(req.query?.[key])
      if (v) filters[key] = v
    }
    const limit = Math.min(Math.max(int(req.query?.limit, 50), 1), 200)
    const offset = Math.max(int(req.query?.offset, 0), 0)
    const [bookings, count] = await (service as any).listAndCountBookings(filters, { take: limit, skip: offset, order: { starts_at: "DESC" } })
    return res.status(200).json({ bookings, count, limit, offset })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("GET /admin/bookings selhalo", error as Error)
    return res.status(500).json({ type: "unexpected_state", message: "Načtení rezervací selhalo" })
  }
}
