import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { adminActor } from "../../../lib/observability/audit"
import { RESET_PROGRAM_KEY, effectiveJournalMetrics, programKeyForProduct } from "../../../lib/reset-program/config"
import { effectiveProgramStructure } from "../../../lib/reset-program/structure"

/**
 * GET /admin/reset-program?product_id=… – konfigurácia členskej zóny RESET 40+ (len čítanie).
 *
 * Administrátor tu zistí, aké hodnotenia (metriky) a akú štruktúru programu má zákazníčka vidieť.
 * Zatiaľ je to IBA čítanie – zoznam metrik ani štruktúru programu sa cez API nemenia
 * (upravuje ich Lucia v metadátach produktu / import).
 *
 * Obsah záznamov Zrkadielka sa tu zámerne NEZOBRAZUJE: sú to údaje o zdraví/pohodí zákazníčky
 * a patria jej (prístup má len zákazníčka cez store API).
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store")
  if (!adminActor(req)) return res.status(401).json({ message: "Prihláste sa do administrácie." })
  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const rawId = req.query?.product_id
    const productId = typeof rawId === "string" ? rawId.trim() : Array.isArray(rawId) && typeof rawId[0] === "string" ? rawId[0].trim() : ""
    const filters = productId ? { id: productId } : { handle: RESET_PROGRAM_KEY }
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "title", "handle", "metadata"],
      filters,
    })
    const product = data?.[0]
    if (!product) return res.status(404).json({ message: "Produkt programu sa nenašiel." })
    const program = programKeyForProduct(product) ?? RESET_PROGRAM_KEY
    return res.status(200).json({
      program,
      product: { id: product.id, title: product.title, handle: product.handle ?? null },
      metrics: effectiveJournalMetrics(product.metadata),
      structure: effectiveProgramStructure(product.metadata, program),
      source: {
        metrics: "product.metadata.reset_journal_metrics",
        structure: "product.metadata.program_structure",
      },
    })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("GET /admin/reset-program selhalo", error as Error)
    return res.status(503).json({ message: "Konfiguráciu programu sa nepodarilo načítať. Skúste to znova." })
  }
}
