import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { storedCouponCode } from "./coupon"

/**
 * Použitie kupónu (limit použití) – jedna objednávka = jedno použitie.
 *
 * Medusa nedokáže započítať použitie kupónu, ktorý sa v košíku uplatňuje
 * cez NEXUS (Medusa vlastný promotion engine sa nepoužije), takže počítadlo
 * `promotion.used` by zostalo na nule a jednorazový kupón by sa dal použiť
 * donekonečno. Proto sa použitie zapíše až PO vytvorení objednávky.
 *
 * Zápis je **idempotentný podľa ID objednávky**: objednávka si do metadát
 * uloží značku `nexus_coupon_usage` a započíta sa iba raz. Opakovaný checkout
 * (alebo druhý pokus o zápis) nespôsobí druhé použitie kupónu – predtým sa
 * použitie kupónu s limitom započítalo dvakrát (raz Medusa registráciou
 * v hooku dokončenia košíka, raz zápisom nižšie) a jednorazový kupón zomrel
 * už po prvom použití.
 *
 * Značka na objednávke aj zvýšenie počítadla prebehnú v jednom atomickom
 * príkaze (CTE): zvýšenie sa vykoná iba vtedy, keď značku získala práve táto
 * objednávka. Podmienka na limit je v tom istom UPDATE (atomicky, bez pretečenia).
 *
 * Funkcia nikdy nevyhodí chybu: selhanie zápisu nesmie zrušiť hotovú objednávku.
 */
export type CouponUsageResult = {
  promotion_id: string | null
  /** použitie sa započítalo */
  counted: boolean
  /** limit bol medzitým vyčerpaný – objednávka stojí, admin to uvidí v audite */
  exhausted: boolean
  /** objednávka už bola započítaná (opakovaný checkout) – nič sa nemení */
  duplicate: boolean
}

const EMPTY: CouponUsageResult = { promotion_id: null, counted: false, exhausted: false, duplicate: false }

export async function recordCouponUsage(
  scope: MedusaContainer,
  input: { cartId: string; orderId: string },
): Promise<CouponUsageResult> {
  try {
    const query = scope.resolve(ContainerRegistrationKeys.QUERY) as any
    const { data } = await query.graph({ entity: "cart", fields: ["id", "metadata"], filters: { id: input.cartId } })
    // Promotion sa určí podľa kódu, nikdy podľa `promotion_id` z metadát košíka: metadáta
    // môže klient prepísať a podvrhnutým ID by sa započítalo použitie inej (alebo žiadnej) akcie.
    const code = storedCouponCode(data?.[0]?.metadata)
    const promotionId = code ? await promotionIdForCode(scope, code) : null
    if (!promotionId) return EMPTY
    const db = scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
    const result = await db.raw(
      `WITH claim AS (
         UPDATE "order"
            SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                  'nexus_coupon_usage', jsonb_build_object(
                    'promotion_id', ?::text,
                    'counted_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                  ))
          WHERE id = ? AND deleted_at IS NULL
            AND metadata->'nexus_coupon_usage' IS NULL
         RETURNING id
       ), counted AS (
         UPDATE promotion
            SET used = COALESCE(used, 0) + 1, updated_at = now()
          WHERE id = ? AND deleted_at IS NULL AND (\"limit\" IS NULL OR COALESCE(used, 0) < \"limit\")
            AND EXISTS (SELECT 1 FROM claim)
         RETURNING id
       )
       SELECT (SELECT count(*)::int FROM claim) AS claimed, (SELECT count(*)::int FROM counted) AS counted`,
      [promotionId, input.orderId, promotionId],
    )
    const rows = Array.isArray(result?.rows) ? result.rows : []
    const claimed = Number(rows[0]?.claimed ?? 0) > 0
    const counted = Number(rows[0]?.counted ?? 0) > 0
    if (!claimed) {
      // Objednávka už bola započítaná (opakovaný checkout) – počítadlo sa nemení.
      return { promotion_id: promotionId, counted: false, exhausted: false, duplicate: true }
    }
    return { promotion_id: promotionId, counted, exhausted: !counted, duplicate: false }
  } catch {
    return EMPTY
  }
}

/**
 * ID akcie (promotion) podľa kódu kupónu. Kód je v Meduse unikátny; pri nejednoznačnosti
 * alebo chybe sa vráti null a volajúci postupuje fail closed.
 */
export async function promotionIdForCode(scope: MedusaContainer, code: string): Promise<string | null> {
  const normalized = typeof code === "string" ? code.trim() : ""
  if (!normalized) return null
  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data } = await query.graph({ entity: "promotion", fields: ["id", "code"], filters: { code: normalized } })
  const rows = Array.isArray(data) ? data : []
  if (rows.length !== 1 || typeof rows[0]?.id !== "string") return null
  return rows[0].id
}

/**
 * Stav limitu kupónu – read-only kontrola pred vytvorením objednávky.
 * Vyčerpaný limit zablokuje checkout (zákazník si kupón nezaplatí).
 */
export async function couponLimitState(
  scope: MedusaContainer,
  promotionId: string,
): Promise<{ limit: number | null; used: number; exhausted: boolean }> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data } = await query.graph({ entity: "promotion", fields: ["id", "limit", "used"], filters: { id: promotionId } })
  const row = data?.[0]
  const limit = typeof row?.limit === "number" ? row.limit : null
  const used = typeof row?.used === "number" ? row.used : Number(row?.used ?? 0) || 0
  return { limit, used, exhausted: limit !== null && used >= limit }
}

/**
 * Read-only predbežná kontrola pred dokončením košíka: vyčerpaný kupón (a košík bez vlastnej
 * rezervácie) odmietne checkout skôr, než Medusa zamkne košík. Inak súbežné dokončenie
 * (webhook platby) držalo zámok `cart_<id>` a zákazník dostal chybu zámku namiesto
 * COUPON_LIMIT_EXHAUSTED. Autoritatívna kontrola ostáva atomická `reserveUsage` v hooku –
 * pri chybe vyhľadávania sa preto nič neblokuje.
 */
export async function assertCouponNotExhausted(scope: MedusaContainer, cartId: string): Promise<void> {
  let exhausted = false
  try {
    const query = scope.resolve(ContainerRegistrationKeys.QUERY) as any
    const { data } = await query.graph({ entity: "cart", fields: ["id", "metadata", "completed_at"], filters: { id: cartId } })
    const cart = data?.[0]
    const code = storedCouponCode(cart?.metadata)
    if (!code || cart?.completed_at) return
    const promotionId = await promotionIdForCode(scope, code)
    if (!promotionId) return
    const db = scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
    const own = await db("coupon_usage_reservation").where({ cart_id: cartId, promotion_id: promotionId }).whereIn("status", ["reserved", "confirmed"]).first("id")
    if (own) return
    exhausted = (await couponLimitState(scope, promotionId)).exhausted
  } catch {
    return
  }
  if (exhausted) throw new Error("COUPON_LIMIT_EXHAUSTED")
}

/** Zámok košíka drží iné dokončenie (napr. webhook platby) – stav sa nezmenil, dá sa zopakovať. */
export function isCartLockError(message: string): boolean {
  return /^Failed to acquire lock for key\b/.test(message) || message === "Timed-out acquiring lock."
}
