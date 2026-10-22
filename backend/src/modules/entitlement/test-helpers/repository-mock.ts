/**
 * Deterministický in-memory mock pro entitlement repository metody.
 * Používá se pro unit testy, aby respektoval tenant izolaci.
 */

import type { EntitlementDTO } from "../types"

export interface MockEntitlementEntity extends EntitlementDTO {}

/**
 * Interní úložiště entit: klíč je tenant_id, hodnota je pole entitlementů
 */
export class MockEntitlementRepository {
  private entities: Map<string, MockEntitlementEntity[]> = new Map()
  private idCounter: number = 0

  /**
   * Reset interního úložiště pro reset testu
   */
  reset(): void {
    this.entities.clear()
    this.idCounter = 0
  }

  /**
   * Vytvoří jednu entitu s deterministickým ID a kompletní strukturou
   */
  private createEntity(input: Partial<EntitlementDTO>): EntitlementDTO {
    const tenantId = input.tenant_id || "default"
    this.idCounter++
    const now = new Date()
    
    return {
      id: `ent-mock-${this.idCounter}`,
      tenant_id: tenantId,
      customer_id: input.customer_id || "",
      product_id: input.product_id || "",
      variant_id: input.variant_id ?? null,
      order_id: input.order_id ?? null,
      status: (input.status as "active" | "revoked") || "active",
      source: (input.source as "order" | "admin" | "migration") || "order",
      granted_at: input.granted_at || now,
      expires_at: input.expires_at ?? null,
      revoked_at: input.revoked_at ?? null,
      revoke_reason: input.revoke_reason ?? null,
      granted_by: input.granted_by ?? null,
      dedupe_key: input.dedupe_key || "",
      metadata: input.metadata ?? null,
    }
  }

  /**
   * Mock createEntitlements() – vrací pole vytvořených entit
   * Respektuje unikátnost dvojice (tenant_id, dedupe_key)
   */
  async createEntitlements(
    inputs: Partial<EntitlementDTO>[]
  ): Promise<EntitlementDTO[]> {
    const created: EntitlementDTO[] = []

    for (const input of inputs) {
      const tenantId = input.tenant_id || "default"
      const dedupeKey = input.dedupe_key || ""

      // Kontrola unikátnosti (tenant_id, dedupe_key)
      const existing = this.findEntity(tenantId, dedupeKey)
      if (existing) {
        throw new Error(
          `Duplicate key violation: tenant_id=${tenantId}, dedupe_key=${dedupeKey}`
        )
      }

      const entity = this.createEntity(input)
      const entities = this.entities.get(tenantId) || []
      entities.push(entity)
      this.entities.set(tenantId, entities)
      created.push(entity)
    }

    return created
  }

  /**
   * Mock listEntitlements() – dynamicky filtruje podle všech kritérií
   */
  async listEntitlements(
    filters: {
      tenant_id?: string
      dedupe_key?: string
      customer_id?: string
      product_id?: string
      status?: string
      order_id?: string
    },
    config?: { take?: number; skip?: number; order?: Record<string, string> }
  ): Promise<EntitlementDTO[]> {
    const tenantId = filters.tenant_id || "default"
    let entities = this.entities.get(tenantId) || []

    // Filtrace podle všech zadaných kritérií
    if (filters.dedupe_key !== undefined) {
      entities = entities.filter((e) => e.dedupe_key === filters.dedupe_key)
    }
    if (filters.customer_id !== undefined) {
      entities = entities.filter((e) => e.customer_id === filters.customer_id)
    }
    if (filters.product_id !== undefined) {
      entities = entities.filter((e) => e.product_id === filters.product_id)
    }
    if (filters.status !== undefined) {
      entities = entities.filter((e) => e.status === filters.status)
    }
    if (filters.order_id !== undefined) {
      entities = entities.filter((e) => e.order_id === filters.order_id)
    }

    // Order podle config
    if (config?.order) {
      const orderKey = Object.keys(config.order)[0]
      const orderDir = config.order[orderKey]
      if (orderKey && orderDir) {
        entities.sort((a, b) => {
          const aVal = (a as any)[orderKey]
          const bVal = (b as any)[orderKey]
          if (orderDir === "ASC") {
            return aVal < bVal ? -1 : aVal > bVal ? 1 : 0
          } else {
            return aVal > bVal ? -1 : aVal < bVal ? 1 : 0
          }
        })
      }
    }

    // Pagination
    const skip = config?.skip ?? 0
    const take = config?.take ?? entities.length
    if (skip > 0 || take < entities.length) {
      entities = entities.slice(skip, skip + take)
    }

    return entities as EntitlementDTO[]
  }

  /**
   * Mock retrieveEntitlement() – najde entitu podle ID
   */
  async retrieveEntitlement(id: string): Promise<EntitlementDTO | null> {
    for (const entities of this.entities.values()) {
      const found = entities.find((e) => e.id === id)
      if (found) {
        return found as EntitlementDTO
      }
    }
    return null
  }

  /**
   * Mock updateEntitlements() – aktualizuje entity
   */
  async updateEntitlements(
    updates: Partial<MockEntitlementEntity>[]
  ): Promise<EntitlementDTO[]> {
    const updated: EntitlementDTO[] = []

    for (const update of updates) {
      if (!update.id) {
        throw new Error("updateEntitlements: missing id")
      }

      for (const entities of this.entities.values()) {
        const index = entities.findIndex((e) => e.id === update.id)
        if (index !== -1) {
          const existing = entities[index]
          const updatedEntity: MockEntitlementEntity = {
            ...existing,
            ...update,
            updated_at: new Date(),
          } as MockEntitlementEntity
          entities[index] = updatedEntity
          updated.push(updatedEntity as EntitlementDTO)
          break
        }
      }
    }

    return updated
  }

  /**
   * Pomocná metoda: najde entitu podle (tenant_id, dedupe_key)
   */
  private findEntity(tenantId: string, dedupeKey: string): MockEntitlementEntity | null {
    const entities = this.entities.get(tenantId) || []
    return entities.find((e) => e.dedupe_key === dedupeKey) || null
  }
}
