import { authenticate, type MedusaNextFunction, type MedusaRequest, type MedusaResponse, type MiddlewareRoute } from "@medusajs/framework/http"
import { BOOKING_MODULE } from "../modules/booking"
import { ENTITLEMENT_MODULE } from "../modules/entitlement"
import { isActiveAt } from "../modules/entitlement/policy"

/**
 * Zmazanie produktu (aj typu konzultácie – je to produkt) len vtedy, keď nič živé nezávisí od neho.
 *
 * Medusa produkt zmaže mäkko, ale registr chránených médií je v jeho metadátach: zmazaním digitálneho
 * produktu by zákazník prišiel o zaplatený obsah. Rovnako nesmie zmiznúť typ s budúcou rezerváciou
 * alebo čakajúcou žiadosťou o termín. Vtedy 409 a návrh produkt skryť (koncept) alebo archivovať.
 * Pri chybe overenia sa nemaže (503).
 */
const BLOCKED_MESSAGE = "Produkt sa nedá zmazať: zákazníci k nemu majú aktívny prístup alebo rezerváciu. Skryte ho (Koncept) alebo archivujte."

export async function productDeletionBlockers(scope: { resolve: (key: string) => any }, productId: string, now = new Date()): Promise<string[]> {
  const blockers: string[] = []
  const entitlements = await scope.resolve(ENTITLEMENT_MODULE).listEntitlements({ product_id: productId, status: "active" }, { take: 500 })
  if (entitlements.some((e: { status: string; expires_at?: Date | string | null }) => isActiveAt(e, now))) blockers.push("active_access")
  const booking = scope.resolve(BOOKING_MODULE)
  const bookings = await booking.listBookings({ product_id: productId, status: ["held", "confirmed"] }, { take: 500 })
  if (bookings.some((b: { ends_at: Date | string }) => new Date(b.ends_at).getTime() > now.getTime())) blockers.push("upcoming_booking")
  const requests = await booking.listBookingRequests({ product_id: productId, status: ["pending"] }, { take: 1 })
  if (requests.length) blockers.push("pending_booking_request")
  return blockers
}

async function rejectBlocked(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction, ids: unknown[]) {
  if (!ids.length) return next()
  if (ids.length > 100 || !ids.every((id) => typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id))) {
    return void res.status(400).json({ message: "Neplatný zoznam produktov na zmazanie." })
  }
  try {
    for (const id of ids as string[]) {
      const blockers = await productDeletionBlockers(req.scope as never, id)
      if (blockers.length) return void res.status(409).json({ code: "PRODUCT_IN_USE", product_id: id, blockers, message: BLOCKED_MESSAGE })
    }
  } catch {
    return void res.status(503).json({ message: "Overenie, či sa produkt dá zmazať, je dočasne nedostupné. Skúste to znova." })
  }
  return next()
}

export function guardProductDelete(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  return rejectBlocked(req, res, next, [req.params.id])
}

/** Hromadné `POST /admin/products/batch` s kľúčom `delete`. */
export function guardProductBatchDelete(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const ids = (req.body as { delete?: unknown } | undefined)?.delete
  if (ids === undefined || ids === null) return next()
  if (!Array.isArray(ids)) return void res.status(400).json({ message: "Neplatný zoznam produktov na zmazanie." })
  return rejectBlocked(req, res, next, ids)
}

const adminAuth = authenticate("user", ["session", "bearer", "api-key"])

export const adminProductDeleteMiddlewares: MiddlewareRoute[] = [
  { matcher: "/admin/products/:id", method: ["DELETE"], middlewares: [adminAuth, guardProductDelete] },
  { matcher: "/admin/products/batch", method: ["POST"], middlewares: [adminAuth, guardProductBatchDelete] },
]
