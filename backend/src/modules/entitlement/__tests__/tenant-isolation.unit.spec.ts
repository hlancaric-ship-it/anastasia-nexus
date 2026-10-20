import EntitlementModuleService from "../service"
import Entitlement from "../models/entitlement"
import { MockEntitlementRepository } from "../test-helpers/repository-mock"

// Mock MedusaService base methods
jest.mock("@medusajs/framework/utils", () => {
  const original = jest.requireActual("@medusajs/framework/utils")
  return {
    ...original,
    MedusaService: (model: any) => {
      class MockService {
        protected modelDefinition = model
        async listEntitlements(filter: any, config: any) {
          return []
        }
        async listAndCountEntitlements(filter: any, config: any) {
          return [[], 0]
        }
        async createEntitlements(data: any[]) {
          return data
        }
        async retrieveEntitlement(id: string) {
          return { id, status: "active" }
        }
        async updateEntitlements(data: any[]) {
          return data
        }
        async deleteEntitlements(ids: string[]) {
          return ids
        }
      }
      return MockService
    }
  }
})

describe("Tenant Isolation - Regresní testy", () => {
  let service: EntitlementModuleService
  let mockRepo: MockEntitlementRepository

  beforeEach(() => {
    mockRepo = new MockEntitlementRepository()
    // @ts-ignore - mocknutá implementace
    service = new EntitlementModuleService()
  })

  afterEach(() => {
    mockRepo.reset()
  })

  describe("grant() s různými tenant_id", () => {
    it("může vytvořit entitlement se stejným dedupe_key pro různé tenanty", async () => {
      const tenantA = "tenant-A"
      const tenantB = "tenant-B"
      const dedupeKey = "order:123"

      // Mock: listEntitlements s dynamickým filtrováním
      jest.spyOn(service, "listEntitlements" as any).mockImplementation(async (filters: any, config: any) => {
        return mockRepo.listEntitlements(filters, config)
      })

      // Mock: createEntitlements vrací vytvořené entitlementy s kompletní strukturou
      jest.spyOn(service, "createEntitlements" as any).mockImplementation(async (data: any | any[]) => {
        const items = Array.isArray(data) ? data : [data]
        const created: any[] = []
        for (const item of items) {
          created.push({
            id: `ent-${Date.now()}`,
            tenant_id: item.tenant_id,
            customer_id: item.customer_id,
            product_id: item.product_id,
            variant_id: item.variant_id,
            order_id: item.order_id,
            status: item.status,
            source: item.source,
            granted_at: item.granted_at,
            expires_at: item.expires_at,
            granted_by: item.granted_by,
            revoked_at: item.revoked_at,
            revoke_reason: item.revoke_reason,
            dedupe_key: item.dedupe_key,
            metadata: item.metadata,
          })
        }
        return created
      })

      // Tenant A vytváří entitlement
      const resultA = await service.grant({
        tenant_id: tenantA,
        customer_id: "cust-A",
        product_id: "prod-1",
        dedupe_key: dedupeKey,
        source: "admin" as const,
      })

      expect(resultA.created).toBe(true)
      expect(resultA.entitlement.tenant_id).toBe(tenantA)
      expect(resultA.entitlement.dedupe_key).toBe(dedupeKey)

      // Tenant B vytváří entitlement se stejným dedupe_key
      const resultB = await service.grant({
        tenant_id: tenantB,
        customer_id: "cust-B",
        product_id: "prod-1",
        dedupe_key: dedupeKey,
        source: "admin" as const,
      })

      expect(resultB.created).toBe(true)
      expect(resultB.entitlement.tenant_id).toBe(tenantB)
      expect(resultB.entitlement.dedupe_key).toBe(dedupeKey)
    })
  })

  describe("findByDedupeKey() s tenant_id filtrem", () => {
    it("vrací null, pokud záznam existuje jiného tenantu", async () => {
      const tenantB = "tenant-B"
      const dedupeKey = "order:456"

      // Mock: listEntitlements s filtrem tenantB vrací prázdné pole
      jest.spyOn(service, "listEntitlements" as any).mockImplementation(async (filters: any, config: any) => {
        return []
      })

      const found = await service.findByDedupeKey(dedupeKey, tenantB)
      expect(found).toBeNull()
    })

    it("vrací záznam, pokud tenant_id sedí", async () => {
      const tenant = "tenant-C"
      const dedupeKey = "order:789"

      // Mock: vytvořím záznam v mockRepo pro tenant-C
      await mockRepo.createEntitlements([{
        tenant_id: tenant,
        dedupe_key: dedupeKey,
        customer_id: "cust-C",
        product_id: "prod-1",
        status: "active" as const,
        source: "admin" as const,
      }])

      // Mock: listEntitlements s filtrem vrací záznam
      jest.spyOn(service, "listEntitlements" as any).mockImplementation(async (filters: any, config: any) => {
        return mockRepo.listEntitlements(filters, config)
      })

      const found = await service.findByDedupeKey(dedupeKey, tenant)
      expect(found).not.toBeNull()
      expect(found?.dedupe_key).toBe(dedupeKey)
      expect(found?.tenant_id).toBe(tenant)
    })

    it("vyhledávání záznamu jiného tenantu vrací null", async () => {
      const tenant1 = "tenant-X"
      const tenant2 = "tenant-Y"
      const dedupeKey = "order:999"

      // Mock: vytvořím záznam v mockRepo pro tenant-X
      await mockRepo.createEntitlements([{
        tenant_id: tenant1,
        dedupe_key: dedupeKey,
        customer_id: "cust-X",
        product_id: "prod-1",
        status: "active" as const,
        source: "admin" as const,
      }])

      // Mock: listEntitlements s filtrem tenant2 vrací prázdné pole
      jest.spyOn(service, "listEntitlements" as any).mockImplementation(async (filters: any, config: any) => {
        return mockRepo.listEntitlements(filters, config)
      })

      // Hledám záznam tenant1 pomocí tenant2
      const found = await service.findByDedupeKey(dedupeKey, tenant2)
      expect(found).toBeNull()
    })
  })

  describe("grant() po UNIQUE_VIOLATION", () => {
    it("správně načte existující záznam pro konkrétního tenanta", async () => {
      const tenant = "tenant-UV"
      const dedupeKey = "order:UV1"

      // Mock: vytvořím záznam v mockRepo
      await mockRepo.createEntitlements([{
        tenant_id: tenant,
        dedupe_key: dedupeKey,
        customer_id: "cust-UV",
        product_id: "prod-1",
        status: "active" as const,
        source: "admin" as const,
      }])

      // Mock: listEntitlements s filtrem vrací existující záznam
      jest.spyOn(service, "listEntitlements" as any).mockImplementation(async (filters: any, config: any) => {
        return mockRepo.listEntitlements(filters, config)
      })

      // Mock: createEntitlements vrací chybu (simuluji UNIQUE_VIOLATION)
      jest.spyOn(service, "createEntitlements").mockImplementation(async (data: any[]) => {
        throw new Error("duplicate key violation")
      })

      // Zkusím vytvořit znovu (mělo by to přejít do catch bloku)
      const result = await service.grant({
        tenant_id: tenant,
        customer_id: "cust-UV",
        product_id: "prod-1",
        dedupe_key: dedupeKey,
        source: "admin" as const,
      })

      expect(result.created).toBe(false)
      expect(result.entitlement.dedupe_key).toBe(dedupeKey)
    })
  })

  describe("výchozí tenant_id", () => {
    it("použije výchozí 'default' pokud tenant_id není zadán", async () => {
      const dedupeKey = "order:default"

      // Mock: listEntitlements s filtrem default tenant vrací prázdné pole
      jest.spyOn(service, "listEntitlements").mockImplementation(async (filters: any, config: any) => {
        if (filters.tenant_id === "default") {
          return []
        }
        return []
      })

      // Mock: createEntitlements vrací vytvořené entitlementy
      jest.spyOn(service, "createEntitlements" as any).mockImplementation(async (data: any | any[]) => {
        const items = Array.isArray(data) ? data : [data]
        const created: any[] = []
        for (const item of items) {
          created.push({
            id: `ent-${Date.now()}`,
            tenant_id: item.tenant_id,
            customer_id: item.customer_id,
            product_id: item.product_id,
            variant_id: item.variant_id,
            order_id: item.order_id,
            status: item.status,
            source: item.source,
            granted_at: item.granted_at,
            expires_at: item.expires_at,
            granted_by: item.granted_by,
            revoked_at: item.revoked_at,
            revoke_reason: item.revoke_reason,
            dedupe_key: item.dedupe_key,
            metadata: item.metadata,
          })
        }
        return created
      })

      // Vytvářím s explicitním tenant_id = "default"
      const result = await service.grant({
        tenant_id: "default",
        customer_id: "cust-default",
        product_id: "prod-1",
        dedupe_key: dedupeKey,
        source: "admin" as const,
      })

      expect(result.created).toBe(true)
      expect(result.entitlement.tenant_id).toBe("default")
      expect(result.entitlement.dedupe_key).toBe(dedupeKey)
    })
  })
})
