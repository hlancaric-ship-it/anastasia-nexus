import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { BOOKING_MODULE } from "../../../modules/booking"
import type BookingModuleService from "../../../modules/booking/service"

/** GET /admin/booking-requests?status=pending|all: žiadosti klientov o vlastný termín s názvom konzultácie a stavom termínu. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  try {
    const service = req.scope.resolve(BOOKING_MODULE) as BookingModuleService
    const status = String((req.query as Record<string, unknown>)?.status ?? "all")
    const filters = ["pending", "approved", "declined"].includes(status) ? { status } : {}
    const requests = await service.listBookingRequests(filters as any, { take: 200, order: { created_at: "DESC" } })
    const productIds = [...new Set(requests.map((r: any) => r.product_id))]
    const bookingIds = requests.map((r: any) => r.booking_id).filter(Boolean)
    const { data: products } = productIds.length ? await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "product", fields: ["id", "title"], filters: { id: productIds } }) : { data: [] }
    const bookings = bookingIds.length ? await service.listBookings({ id: bookingIds }, { take: bookingIds.length }) : []
    const titles = new Map(products.map((p: any) => [p.id, p.title]))
    const byId = new Map(bookings.map((b: any) => [b.id, b]))
    res.setHeader("Cache-Control", "no-store")
    return res.json({ requests: requests.map((r: any) => {
      const b: any = r.booking_id ? byId.get(r.booking_id) : null
      return {
        id: r.id, status: r.status, product_id: r.product_id, product_title: titles.get(r.product_id) ?? null,
        starts_at: r.starts_at, ends_at: r.ends_at, name: r.name, email: r.email, phone: r.phone, note: r.note,
        decline_reason: r.decline_reason, decided_at: r.decided_at, created_at: r.created_at,
        booking: b ? { id: b.id, status: b.status, held_until: b.held_until, order_id: b.order_id } : null,
      }
    }) })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("GET /admin/booking-requests zlyhalo", error as Error)
    return res.status(500).json({ message: "Žiadosti sa nepodarilo načítať" })
  }
}
