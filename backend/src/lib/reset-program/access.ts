import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ENTITLEMENT_MODULE } from "../../modules/entitlement"
import type EntitlementModuleService from "../../modules/entitlement/service"
import { RESET_PROGRAM_KEY, effectiveJournalMetrics, programKeyForProduct, type JournalMetric } from "./config"
import { effectiveProgramStructure, type ProgramStructure } from "./structure"

export type ProgramAccess = {
  /** Kľúč programu (napr. `reset-40-plus`). */
  program: string
  /** Prístup, ktorým zákazníčka program otvorila. */
  entitlement_id: string
  /** Produkt programu. */
  product_id: string
  /** Účinný zoznam metrik Zrkadielka. */
  metrics: JournalMetric[]
  /** Štruktúra programu (týždne, pracovné listy, vstupný dotazník). */
  structure: ProgramStructure & { content_ready: boolean }
}

/**
 * Overí, že zákazníčka má platný prístup k programu, a načíta konfiguráciu Zrkadielka.
 *
 * Prístup sa určuje z AKTÍVNEHO entitlementu (nezrušený a neexpirovaný) na produkt programu.
 * Bez prístupu sa Zrkadielko nedá používať – vracia `null` (rozhodne route: 403).
 */
export async function resolveProgramAccess(
  scope: { resolve: (key: string) => any },
  customerId: string,
  program: string = RESET_PROGRAM_KEY,
): Promise<ProgramAccess | null> {
  if (!customerId) return null
  const entitlements = scope.resolve(ENTITLEMENT_MODULE) as EntitlementModuleService
  const { data } = await entitlements.listActiveForCustomer(customerId, { limit: 200 })
  if (!data?.length) return null

  const productIds = [...new Set(data.map((entitlement) => entitlement.product_id).filter(Boolean))]
  if (!productIds.length) return null

  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "title", "metadata"],
    filters: { id: productIds },
  })
  const byId = new Map<string, any>((products ?? []).map((product: any) => [product.id, product]))

  for (const entitlement of data) {
    const product = byId.get(entitlement.product_id)
    if (!product) continue
    if (programKeyForProduct(product) !== program) continue
    return {
      program,
      entitlement_id: entitlement.id,
      product_id: entitlement.product_id,
      metrics: effectiveJournalMetrics(product.metadata),
      structure: effectiveProgramStructure(product.metadata, program),
    }
  }
  return null
}
