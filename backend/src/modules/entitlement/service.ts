import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import Entitlement from "./models/entitlement"
import { isActiveAt } from "./policy"
import type { EntitlementDTO, EntitlementAccessGuard, GrantEntitlementInput, GrantResult } from "./types"

const UNIQUE_VIOLATION = /duplicate key|unique constraint|23505/i

class EntitlementModuleService extends MedusaService({ Entitlement }) implements EntitlementAccessGuard {
  /**
   * Idempotentní udělení přístupu. Stejný dedupe_key nikdy nevytvoří druhý záznam;
   * zrušený záznam se NEOŽIVUJE (znovuzpřístupnění je vědomá akce admina s novým klíčem).
   */
  async grant(input: GrantEntitlementInput): Promise<GrantResult> {
    if (!input.customer_id || !input.product_id || !input.dedupe_key) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "customer_id, product_id a dedupe_key jsou povinné")
    }
    const existing = await this.findByDedupeKey(input.dedupe_key)
    if (existing) return { entitlement: existing, created: false }

    try {
      const created = (await this.createEntitlements({
        customer_id: input.customer_id,
        product_id: input.product_id,
        variant_id: input.variant_id ?? null,
        order_id: input.order_id ?? null,
        status: "active",
        source: input.source,
        granted_at: new Date(),
        expires_at: input.expires_at ?? null,
        granted_by: input.granted_by ?? null,
        dedupe_key: input.dedupe_key,
        metadata: input.metadata ?? null,
      })) as unknown as EntitlementDTO
      return { entitlement: created, created: true }
    } catch (error) {
      // souběh dvou událostí (order.placed + payment.captured): prohrávající vlákno si záznam načte
      const message = error instanceof Error ? error.message : String(error)
      if (UNIQUE_VIOLATION.test(message)) {
        const winner = await this.findByDedupeKey(input.dedupe_key)
        if (winner) return { entitlement: winner, created: false }
      }
      throw error
    }
  }

  async findByDedupeKey(dedupeKey: string): Promise<EntitlementDTO | null> {
    const [found] = (await this.listEntitlements({ dedupe_key: dedupeKey }, { take: 1 })) as unknown as EntitlementDTO[]
    return found ?? null
  }

  /** Zruší jeden přístup. Již zrušený vrací beze změny (idempotentní). */
  async revoke(id: string, reason: string | null = null): Promise<EntitlementDTO> {
    const current = (await this.retrieveEntitlement(id)) as unknown as EntitlementDTO
    if (current.status === "revoked") return current
    return (await this.updateEntitlements({
      id,
      status: "revoked",
      revoked_at: new Date(),
      revoke_reason: reason,
    })) as unknown as EntitlementDTO
  }

  /** Zruší všechny aktivní přístupy objednávky. Vrací počet skutečně zrušených. */
  async revokeByOrder(orderId: string, reason: string): Promise<number> {
    if (!orderId) return 0
    const active = (await this.listEntitlements(
      { order_id: orderId, status: "active" },
      { take: 500 }
    )) as unknown as EntitlementDTO[]
    if (!active.length) return 0
    const now = new Date()
    await this.updateEntitlements(
      active.map((e) => ({ id: e.id, status: "revoked" as const, revoked_at: now, revoke_reason: reason }))
    )
    return active.length
  }

  /** Aktivní = status active a (bez expirace nebo expirace v budoucnu). */
  async listActiveForCustomer(
    customerId: string,
    pagination: { limit?: number; offset?: number } = {},
    at: Date = new Date()
  ): Promise<{ data: EntitlementDTO[]; count: number }> {
    const limit = Math.min(Math.max(Math.trunc(pagination.limit ?? 50), 1), 200)
    const offset = Math.max(Math.trunc(pagination.offset ?? 0), 0)
    const [data, count] = (await this.listAndCountEntitlements(
      {
        customer_id: customerId,
        status: "active",
        $or: [{ expires_at: null }, { expires_at: { $gt: at } }],
      },
      { take: limit, skip: offset, order: { granted_at: "DESC" } }
    )) as unknown as [EntitlementDTO[], number]
    return { data, count }
  }

  /** Kontrola pro doručení chráněného média (vlna 2). */
  async findActiveAccess(customerId: string, productId: string, at: Date = new Date()): Promise<EntitlementDTO | null> {
    if (!customerId || !productId) return null
    const rows = (await this.listEntitlements(
      { customer_id: customerId, product_id: productId, status: "active" },
      { take: 50 }
    )) as unknown as EntitlementDTO[]
    return rows.find((e) => isActiveAt(e, at)) ?? null
  }
}

export default EntitlementModuleService
