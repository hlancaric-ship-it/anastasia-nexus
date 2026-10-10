import { Client } from "pg"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import MagicLinkAuthService from "../service"
import { sha256Hex, stateKey } from "../policy"

describe("auth-magic-link PostgreSQL integration", () => {
  jest.setTimeout(30_000)

  it("activates a C2 customer only after verified email linking and preserves imported history", async () => {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_MAGIC_LINK integration test is disabled in production")
    // Project-local PostgreSQL socket only; do not read DATABASE_URL or connect to a remote host.
    const client = new Client({ host: "/tmp", port: 5432, database: "anastasia_dev_wave1" })
    await client.connect()
    try {
      await client.query("begin")
      const dbName = await client.query("select current_database() as db")
      expect(dbName.rows[0].db).toBe("anastasia_dev_wave1")
      expect((await client.query("select inet_server_addr() as address")).rows[0].address).toBeNull()

      // TEMP relations shadow Medusa tables for this session. The test touches no
      // persistent customer, order, entitlement, or auth data and rolls back.
      await client.query(`
        create temporary table customer (
          id text primary key, email text not null, has_account boolean not null,
          deleted_at timestamptz null, updated_at timestamptz null
        ) on commit drop;
        create temporary table auth_identity (
          id text primary key, entity_id text not null, app_metadata jsonb,
          deleted_at timestamptz null, updated_at timestamptz null
        ) on commit drop;
        create temporary table legacy_order (
          id text primary key, customer_id text not null, total text not null
        ) on commit drop;
        create temporary table entitlement (
          id text primary key, customer_id text not null, product_id text not null
        ) on commit drop;
      `)
      await client.query("insert into customer (id,email,has_account) values ($1,$2,false)", ["cus_c2_1", "C2.User@Example.Test"])
      await client.query("insert into auth_identity (id,entity_id,app_metadata) values ($1,$2,'{}'::jsonb)", ["auth_c2_1", "c2.user@example.test"])
      await client.query("insert into legacy_order values ($1,$2,$3)", ["legacy_order_1", "cus_c2_1", "38.00"])
      await client.query("insert into entitlement values ($1,$2,$3)", ["legacy_access_1", "cus_c2_1", "prod_ep001"])

      const state = new Map<string, unknown>([[stateKey("c2.user@example.test"), { email: "c2.user@example.test", tokenHash: sha256Hex("verified-token") }]])
      const pg = { raw: async (sql: string, bindings: unknown[] = []) => client.query(sql, bindings) }
      const cradle = {
        logger: { warn: jest.fn(), error: jest.fn() },
        [ContainerRegistrationKeys.PG_CONNECTION]: pg,
        [Modules.EVENT_BUS]: { emit: jest.fn(async () => undefined) },
      }
      const service = new (MagicLinkAuthService as any)(cradle, {})
      const authProvider = {
        getState: jest.fn(async (key: string) => { const value = state.get(key) ?? null; state.delete(key); return value }),
        retrieve: jest.fn(async () => ({ id: "auth_c2_1", entity_id: "c2.user@example.test", app_metadata: {} })),
      }

      const result = await service.authenticate({ body: { email: "C2.User@Example.Test", token: "verified-token" } }, authProvider)
      expect(result.success).toBe(true)
      expect(result.authIdentity.app_metadata.customer_id).toBe("cus_c2_1")
      expect((await client.query("select has_account from customer where id = $1", ["cus_c2_1"])).rows[0].has_account).toBe(true)
      expect((await client.query("select customer_id,total from legacy_order where id = $1", ["legacy_order_1"])).rows[0]).toEqual({ customer_id: "cus_c2_1", total: "38.00" })
      expect((await client.query("select customer_id,product_id from entitlement where id = $1", ["legacy_access_1"])).rows[0]).toEqual({ customer_id: "cus_c2_1", product_id: "prod_ep001" })

      // A previously committed identity link with a stale flag is repaired only
      // after its customer ID and normalized email have been verified.
      await client.query("update customer set has_account = false where id = $1", ["cus_c2_1"])
      const relinkState = new Map<string, unknown>([[stateKey("c2.user@example.test"), { email: "c2.user@example.test", tokenHash: sha256Hex("relink-token") }]])
      const linkedProvider = {
        getState: jest.fn(async (key: string) => { const value = relinkState.get(key) ?? null; relinkState.delete(key); return value }),
        retrieve: jest.fn(async () => ({ id: "auth_c2_1", entity_id: "c2.user@example.test", app_metadata: { customer_id: "cus_c2_1" } })),
      }
      expect((await service.authenticate({ body: { email: "c2.user@example.test", token: "relink-token" } }, linkedProvider)).success).toBe(true)
      expect((await client.query("select has_account from customer where id = $1", ["cus_c2_1"])).rows[0].has_account).toBe(true)

      // Duplicate C2 email must not choose an arbitrary historical customer.
      await client.query("insert into customer (id,email,has_account) values ($1,$2,false),($3,$2,false)", ["cus_dup_a", "duplicate@example.test", "cus_dup_b"])
      await client.query("insert into auth_identity (id,entity_id,app_metadata) values ($1,$2,'{}'::jsonb)", ["auth_dup", "duplicate@example.test"])
      const duplicateState = new Map<string, unknown>([[stateKey("duplicate@example.test"), { email: "duplicate@example.test", tokenHash: sha256Hex("duplicate-token") }]])
      const duplicateProvider = {
        getState: jest.fn(async (key: string) => { const value = duplicateState.get(key) ?? null; duplicateState.delete(key); return value }),
        retrieve: jest.fn(async () => ({ id: "auth_dup", entity_id: "duplicate@example.test", app_metadata: {} })),
      }
      const duplicateResult = await service.authenticate({ body: { email: "duplicate@example.test", token: "duplicate-token" } }, duplicateProvider)
      expect(duplicateResult.success).toBe(true)
      expect(duplicateResult.authIdentity.app_metadata).toEqual({})
      expect((await client.query("select has_account from customer where id in ($1,$2) order by id", ["cus_dup_a", "cus_dup_b"])).rows).toEqual([{ has_account: false }, { has_account: false }])

      await client.query("rollback")
    } catch (error) {
      await client.query("rollback").catch(() => undefined)
      throw error
    } finally {
      await client.end()
    }
  })
})
