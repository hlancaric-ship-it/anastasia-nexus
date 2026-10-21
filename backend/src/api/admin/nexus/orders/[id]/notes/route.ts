/**
 * POST /admin/nexus/orders/:id/notes { body } – poznámka k objednávke.
 *
 * Poznámky sú v metadátach objednávky (`anastasia_notes`) s autorom a časom, takže
 * sa vie, kto a kedy ich napísal. Každá poznámka sa zapíše aj do auditu.
 */
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { adminActor, auditAdminChange } from "../../../../../../lib/observability/audit"

const MAX_NOTE = 2000
const MAX_NOTES = 50

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!adminActor(req)) return res.status(401).json({ message: "Prihláste sa do administrácie." })
  try {
    const orders = req.scope.resolve(Modules.ORDER) as any
    const order = await orders.retrieveOrder(req.params.id)
    const notes = Array.isArray(order.metadata?.anastasia_notes) ? order.metadata.anastasia_notes : []
    return res.json({ notes })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("GET /admin/nexus/orders/:id/notes zlyhal", error as Error)
    return res.status(404).json({ message: "Objednávka sa nenašla." })
  }
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: "Prihláste sa do administrácie." })
  const text = String((req.body ?? ({} as any)).body ?? "").trim()
  if (!text) return res.status(400).json({ message: "Poznámka nemôže byť prázdna." })
  if (text.length > MAX_NOTE) {
    return res.status(400).json({ message: `Poznámka je príliš dlhá (najviac ${MAX_NOTE} znakov).` })
  }
  const orderId = req.params.id
  try {
    const orders = req.scope.resolve(Modules.ORDER) as any
    const order = await orders.retrieveOrder(orderId)
    const at = new Date().toISOString()
    const notes = Array.isArray(order.metadata?.anastasia_notes) ? order.metadata.anastasia_notes : []
    const note = { body: text, by: actor, by_email: await adminEmail(req, actor), at }
    const metadata = { ...(order.metadata ?? {}), anastasia_notes: [...notes, note].slice(-MAX_NOTES) }
    await orders.updateOrders(orderId, { metadata })
    await auditAdminChange(req, "order.note_created", "order", orderId, null, { note: text.slice(0, 200), by: actor, at })
    return res.status(201).json({ note })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("POST /admin/nexus/orders/:id/notes zlyhal", error as Error)
    return res.status(503).json({ message: "Poznámku sa nepodarilo uložiť. Skúte to znova." })
  }
}

/** E-mail autora poznámky (na zobrazenie v administrácii). Bez e-mailu stačí ID. */
async function adminEmail(req: AuthenticatedMedusaRequest, actor: string): Promise<string | null> {
  try {
    const user = await (req.scope.resolve(Modules.USER) as any).retrieveUser(actor)
    return typeof user?.email === "string" ? user.email : null
  } catch {
    return null
  }
}
