import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * Použitie kupónu (limit použití).
 *
 * Medusa nedokáže započítať použitie kupónu, ktorý sa v košíku uplatňuje
 * cez NEXUS (Medusa vlastný promotion engine sa nepoužije), takže počítadlo
 * `promotion.used` by zostalo na nule a jednorazový kupón by sa dal použiť
 * donekonečno. Proto sa použitie zapíše až PO vytvorení objednávky, atomicky
 * (jediný UPDATE s podmienkou na limit) – dva súbežné nákupy sa tak o jedno
 * použitie nesporia.
 *
 * Funkcia nikdy nevyhodí chybu: selhanie zápisu nesmie zrušiť hotovú objednávku.
 */
export type CouponUsageResult = {
  promotion_id: string | null
  /** použitie sa započítalo */
  counted: boolean
  /** limit bol medzitým vyčerpaný – objednávka stojí, admin to uvidí v audite */
  exhausted: boolean
}

export async function recordCouponUsage(scope: MedusaContainer, cartId: string): Promise<CouponUsageResult> {
  const empty: CouponUsageResult = { promotion_id: null, counted: false, exhausted: false }
  try {
    const query = scope.resolve(ContainerRegistrationKeys.QUERY) as any
    const { data } = await query.graph({ entity: "cart", fields: ["id", "metadata"], filters: { id: cartId } })
    const stored = data?.[0]?.metadata?.nexus_coupon as { promotion_id?: unknown } | undefined
    const promotionId = typeof stored?.promotion_id === "string" ? stored.promotion_id : null
    if (!promotionId) return empty
    const db = scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
    const result = await db.raw(
      `UPDATE promotion SET used = COALESCE(used, 0) + 1, updated_at = now()
       WHERE id = ? AND deleted_at IS NULL AND (limit IS NULL OR COALESCE(used, 0) < limit)
       RETURNING id`,
      [promotionId],
    )
    const rows = Array.isArray(result?.rows) ? result.rows : []
    return { promotion_id: promotionId, counted: rows.length > 0, exhausted: rows.length === 0 }
  } catch {
    return empty
  }
}
