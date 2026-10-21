/**
 * POST /admin/nexus/orders/:id/cancel { reason } – zrušenie objednávky s povinným dôvodom.
 *
 * Jadro (AdminCancelOrder) neprijíma dôvod, preto ho ukladáme do metadát objednávky
 * (`anastasia_cancel`: dôvod, kto a kedy) a zapisujeme do auditu. Bez dôvodu sa
 * objednávka zrušiť nedá – vie sa, kto a prečo ju zrušil.
 */
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { cancelOrderWorkflow } from "@medusajs/medusa/core-flows"
import { adminActor, auditAdminChange } from "../../../../../../lib/observability/audit"

const MAX_REASON = 500

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: "Prihláste sa do administrácie." })
  const reason = String((req.body ?? ({} as any)).reason ?? "").trim()
  if (!reason) return res.status(400).json({ message: "Dôvod zrušenia je povinný." })
  if (reason.length > MAX_REASON) {
    return res.status(400).json({ message: `Dôvod zrušenia je príliš dlhý (najviac ${MAX_REASON} znakov).` })
  }
  const orderId = req.params.id
  try {
    const orders = req.scope.resolve(Modules.ORDER) as any
    const order = await orders.retrieveOrder(orderId)
    if (order.status === "canceled") {
      return res.status(409).json({ message: "Objednávka už je zrušená." })
    }
    await cancelOrderWorkflow(req.scope).run({ input: { order_id: orderId, canceled_by: actor } })
    const at = new Date().toISOString()
    const metadata = { ...(order.metadata ?? {}), anastasia_cancel: { reason, by: actor, at } }
    await orders.updateOrders(orderId, { metadata })
    await auditAdminChange(req, "order.cancel", "order", orderId, null, { reason, by: actor, at })
    return res.status(200).json({ order_id: orderId, canceled: true, reason, by: actor, at })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("POST /admin/nexus/orders/:id/cancel zlyhal", error as Error)
    return res.status(503).json({ message: "Objednávku sa nepodarilo zrušiť. Skúte to znova." })
  }
}
