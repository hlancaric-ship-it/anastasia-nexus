/**
 * POST /admin/nexus/orders/:id/refund { payment_id, amount, note, restock }
 *
 * Vrátenie peňazí (jadro) + voliteľné vrátenie tovaru na sklad (inventúra) + audit.
 * Dôvod vrátenia je povinný – pri vrátení peňazí sa musí vedieť, prečo.
 *
 * Vrátenie na sklad: ku každej položke objednávky sa zvýši dostupné množstvo
 * (stocked_quantity) a uvoľní rezervácia (reserved_quantity). Tovar, ktorý bol
 * zrušený pred odoslaním, tak ostane v sklade a už ho neblokuje; tovar, ktorý sa
 * vracia, sa do skladu vráti.
 */
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { refundPaymentWorkflow } from "@medusajs/medusa/core-flows"
import { adminActor, auditAdminChange } from "../../../../../../lib/observability/audit"

const MAX_NOTE = 500

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: "Prihláste sa do administrácie." })
  const body = (req.body ?? {}) as { payment_id?: unknown; amount?: unknown; note?: unknown; restock?: unknown }
  const paymentId = String(body.payment_id ?? "").trim()
  const amount = Number(body.amount)
  const note = String(body.note ?? "").trim()
  const restock = body.restock === true
  if (!paymentId) return res.status(400).json({ message: "Vyberte platbu, ktorú chcete vrátiť." })
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: "Zadajte sumu vrátenia." })
  if (!note) return res.status(400).json({ message: "Dôvod vrátenia je povinný." })
  if (note.length > MAX_NOTE) {
    return res.status(400).json({ message: `Dôvod vrátenia je príliš dlhý (najviac ${MAX_NOTE} znakov).` })
  }
  const orderId = req.params.id
  try {
    const orders = req.scope.resolve(Modules.ORDER) as any
    const order = await orders.retrieveOrder(orderId, { relations: ["items"] })
    await refundPaymentWorkflow(req.scope).run({ input: { payment_id: paymentId, amount, note, created_by: actor } })
    let restocked = 0
    if (restock) restocked = await restockToStock(req, order)
    await auditAdminChange(req, "order.refund", "order", orderId, null, {
      payment_id: paymentId, amount, note, restock, restocked,
    })
    return res.status(200).json({ order_id: orderId, refunded: amount, note, restock, restocked })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("POST /admin/nexus/orders/:id/refund zlyhal", error as Error)
    return res.status(503).json({ message: "Vrátenie peňazí sa nepodarilo. Skúte to znova." })
  }
}

/**
 * Vráti tovar objednávky na sklad: zvýši dostupné množstvo a uvoľní rezerváciu.
 * Vracia počet vrátených kusov (0, ak sa tovar nedal priradiť k skladovej položke).
 */
async function restockToStock(req: AuthenticatedMedusaRequest, order: any): Promise<number> {
  const inventory = req.scope.resolve(Modules.INVENTORY) as any
  const items: any[] = Array.isArray(order?.items) ? order.items : []
  const skus = [...new Set(items.map((i) => i?.variant_sku).filter((s): s is string => typeof s === "string" && s.length > 0))]
  if (!skus.length) return 0
  const inventoryItems = await inventory.listInventoryItems({ sku: skus }, { take: 200 })
  const bySku = new Map<string, any>((inventoryItems ?? []).map((item: any) => [item.sku, item]))
  let restocked = 0
  for (const item of items) {
    const quantity = Math.trunc(Number(item?.quantity ?? 0))
    const sku = item?.variant_sku
    const inventoryItem = typeof sku === "string" ? bySku.get(sku) : null
    if (quantity <= 0 || !inventoryItem) continue
    const levels = await inventory.listInventoryLevels({ inventory_item_id: inventoryItem.id })
    for (const level of levels ?? []) {
      const stocked = Number(level.stocked_quantity ?? 0)
      const reserved = Number(level.reserved_quantity ?? 0)
      await inventory.updateInventoryLevels([{
        id: level.id,
        location_id: level.location_id,
        stocked_quantity: stocked + quantity,
        reserved_quantity: Math.max(0, reserved - quantity),
      }])
      restocked += quantity
    }
  }
  return restocked
}
