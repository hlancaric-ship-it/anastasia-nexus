import * as fs from "node:fs"
import * as path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { ContainerRegistrationKeys, Modules, decorateCartTotals } from "@medusajs/framework/utils"
import migrate, {
  assertLocalDatabase, buildCustomerExport, buildOrderInput, migrateCustomers,
  parseOptions, preparePasswordDraft, savePasswordDraft, validateMigration, writePrivateJson,
} from "../migrate-legacy-customers-orders"
import type { MigrationData, MigrationServices } from "../migrate-legacy-customers-orders"
import type { LegacyCatalog } from "../parse-legacy-db"

const NS = "legacy_customer_migration"
const catalog = { currency: "eur", products: [{ legacy_id: "p1", kind: "digital" }] } as LegacyCatalog
const address = { legacy_id: "a1", first_name: "Synthetic", last_name: "Example", company: "", address_1: "Test 1",
  address_2: "", city: "Test", postal_code: "00000", country_code: "sk", phone: "" }
function fixture(): MigrationData {
  return { version: 1, excluded_unfinished_quotes: 2,
    customers: [{ legacy_id: "c1", email: "person@example.test", first_name: "Synthetic", last_name: "Example", phone: "", addresses: [{ ...address }] }],
    orders: [{ legacy_id: "o1", customer_legacy_id: "c1", email: "person@example.test", placed_at: "2020-01-02T12:00:00",
      number: "2020/1", status: "Odoslaná", payment_status: "Zaplatená", currency_code: "eur", total: "38.00",
      billing_address: { ...address }, shipping_address: { ...address },
      items: [{ legacy_id: "i1", product_legacy_id: "p1", title: "Synthetic audio", quantity: "1", unit_price: "38.00", vat_rate: "20" }] }],
    accesses: [{ legacy_id: "g1", customer_legacy_id: "c1", product_legacy_id: "p1", legacy_order_id: "o1", expires_at: null }],
  }
}
function mockServices() {
  const db = { customers: [] as any[], addresses: [] as any[], orders: [] as any[],
    products: [{ id: "prod_target", metadata: { legacy_id: "p1" } }],
    grants: [] as any[] }
  // Reset entitlement repository before each test
  if (!global.entitlementRepos) global.entitlementRepos = []
  const repo: Map<string, any[]> = new Map()
  global.entitlementRepos.push(repo)
  const page = (rows: any[], filter: any, config: any) => structuredClone(rows.filter(r => !filter.id || filter.id.includes(r.id)).slice(config.skip ?? 0, (config.skip ?? 0) + (config.take ?? 200)))
  const customer = {
    listCustomers: jest.fn(async (f, c) => page(db.customers, f, c)),
    listCustomerAddresses: jest.fn(async (f, c) => page(db.addresses, f, c)),
    createCustomers: jest.fn(async input => { const row = { ...structuredClone(input), id: `cus_${db.customers.length}` }; db.customers.push(row); return structuredClone(row) }),
    updateCustomers: jest.fn(async (id, input) => { const row = db.customers.find(x => x.id === id); Object.assign(row, structuredClone(input)); return structuredClone(row) }),
    createCustomerAddresses: jest.fn(async input => { const row = { ...structuredClone(input), id: `addr_${db.addresses.length}` }; db.addresses.push(row); return structuredClone(row) }),
  }
  const order = {
    listOrders: jest.fn(async (f, c) => page(db.orders, f, c)),
    createOrders: jest.fn(async input => {
      // Use the installed Medusa total calculation, including signed historical discount rows.
      const total = Number(decorateCartTotals({ ...input, shipping_methods: [], credit_lines: [] }).total)
      const row = { ...structuredClone(input), id: `order_${db.orders.length}`, total }
      db.orders.push(row)
      return structuredClone(row)
    }),
  }
  // MockEntitlementRepository pro tenant izolaci
  const entitlementRepo: Map<string, any[]> = new Map()
  const entitlement = {
    findByDedupeKey: jest.fn(async (key: string, tenant_id: string = "default") => {
      const grants = entitlementRepo.get(tenant_id) || []
      const found = grants.find(g => g.dedupe_key === key)
      return structuredClone(found ?? null)
    }),
    grant: jest.fn(async input => {
      const tenant_id = input.tenant_id ?? "default"
      let grants = entitlementRepo.get(tenant_id)
      if (!grants) {
        grants = []
        entitlementRepo.set(tenant_id, grants)
      }
      const existing = grants.find(g => g.dedupe_key === input.dedupe_key)
      if (existing) return { created: false, entitlement: structuredClone(existing) }
      const row = { ...structuredClone(input), id: `ent_${grants.length}`, status: "active" }
      grants.push(row)
      db.grants.push(row)
      return { created: true, entitlement: structuredClone(row) }
    }),
  }
  const product = { listProducts: jest.fn(async (f, c) => page(db.products, f, c)) }
  return { db, customer, order, entitlement, product, entitlementRepo, services: { customer, order, entitlement, product } as unknown as MigrationServices }
}
function expectNoWrites(s: ReturnType<typeof mockServices>) {
  expect(s.customer.createCustomers).not.toHaveBeenCalled()
  expect(s.customer.updateCustomers).not.toHaveBeenCalled()
  expect(s.customer.createCustomerAddresses).not.toHaveBeenCalled()
  expect(s.order.createOrders).not.toHaveBeenCalled()
  expect(s.entitlement.grant).not.toHaveBeenCalled()
}

// Reset entitlement repo after each test
afterEach(() => {
  if (global.entitlementRepos) {
    global.entitlementRepos.pop()
  }
})

describe("customer migration validation and privacy", () => {
  it("defaults to dry-run and requires the exact apply argument", () => {
    expect(parseOptions([]).apply).toBe(false)
    expect(parseOptions(["--", "--apply"]).apply).toBe(true)
    for (const args of [["apply"], ["--aply"], ["--apply", "--apply"], ["--apply", "--prepare-sql=dump.sql"]]) expect(() => parseOptions(args)).toThrow("INVALID_ARGUMENTS")
  })
  it.each(["postgres://u@remote/anastasia_dev_wave1", "postgres://u@127.0.0.1/production", "postgres://u@127.0.0.1/anastasia_dev_wave1?host=remote", undefined])("refuses an unsafe DB configuration", url => {
    expect(() => assertLocalDatabase(url)).toThrow("LOCAL_DATABASE_REQUIRED")
  })
  it("accepts only the authorized local DB", () => {
    expect(() => assertLocalDatabase("postgres://u@127.0.0.1:5432/anastasia_dev_wave1")).not.toThrow()
  })
  it("rejects password fields and does not echo private values in validation errors", () => {
    const data = fixture() as any
    data.customers[0].password = "SYNTHETIC_SECRET"
    expect(() => validateMigration(data)).toThrow(/^CUSTOMER_MIGRATION_INVALID_INPUT$/)
  })
  it("normalizes email and checks decimal totals without floating-point drift", () => {
    const data = fixture()
    data.customers[0].email = " Person@Example.Test "
    data.orders[0].items[0].unit_price = "0.1"
    data.orders[0].items[0].quantity = "3"
    data.orders[0].total = "0.30"
    expect(validateMigration(data).customers[0].email).toBe("person@example.test")
    data.orders[0].total = "0.31"
    expect(() => validateMigration(data)).toThrow("SOURCE_TOTAL_MISMATCH")
  })
  it("rejects duplicate IDs, missing customers, and access across customers", () => {
    const duplicate = fixture(); duplicate.customers.push({ ...duplicate.customers[0] })
    expect(() => validateMigration(duplicate)).toThrow("DUPLICATE_ID")
    const missing = fixture(); missing.orders[0].customer_legacy_id = "missing"
    expect(() => validateMigration(missing)).toThrow("ORDER_CUSTOMER_MISSING")
    const wrong = fixture(); wrong.customers.push({ ...wrong.customers[0], legacy_id: "c2", email: "other@example.test", addresses: [] }); wrong.accesses[0].customer_legacy_id = "c2"
    expect(() => validateMigration(wrong)).toThrow("ACCESS_ORDER_MISMATCH")
  })
  it("creates random, expiring unsent password drafts without an authentication claim", () => {
    const first = preparePasswordDraft("cus_test", "person@example.test", new Date("2026-10-09T10:00:00Z"))
    const second = preparePasswordDraft("cus_test", "person@example.test")
    expect(first.token).toHaveLength(43)
    expect(first.token).not.toBe(second.token)
    expect(first.token_sha256).not.toContain(first.token)
    expect(first.expires_at).toBe("2026-10-10T10:00:00.000Z")
    expect(first).toMatchObject({ send: false, status: "draft_requires_auth_binding" })
  })
  it("writes private files exclusively with mode 0600, refuses public and symlink paths", () => {
    fs.mkdirSync("data-private", { recursive: true })
    const dir = fs.mkdtempSync(path.resolve("data-private", "synthetic-c2-"))
    try {
      const file = path.join(dir, "draft.json")
      writePrivateJson(file, { synthetic: true })
      expect(fs.statSync(file).mode & 0o777).toBe(0o600)
      expect(() => writePrivateJson(file, {})).toThrow()
      expect(() => writePrivateJson("public.json", {})).toThrow("PRIVATE_PATH_REQUIRED")
      fs.symlinkSync(file, path.join(dir, "link.json"))
      expect(() => writePrivateJson(path.join(dir, "link.json"), {})).toThrow("PRIVATE_PATH_REQUIRED")
    } finally { fs.rmSync(dir, { recursive: true }) }
  })
  it("retains the same password draft on retries and rejects changed recipients", () => {
    const customerId = `synthetic-${randomUUID()}`
    const name = createHash("sha256").update(JSON.stringify(customerId)).digest("hex")
    const file = path.resolve("data-private/legacy/password-drafts", `${name}.json`)
    try {
      savePasswordDraft(customerId, "person@example.test")
      const before = fs.readFileSync(file, "utf8")
      savePasswordDraft(customerId, "person@example.test")
      expect(fs.readFileSync(file, "utf8")).toBe(before)
      expect(() => savePasswordDraft(customerId, "other@example.test")).toThrow("DRAFT_CONFLICT")
    } finally { if (fs.existsSync(file)) fs.unlinkSync(file) }
  })
})

describe("customer migration execution", () => {
  beforeAll(() => {
    global.entitlementRepos = []
  })
  afterAll(() => {
    global.entitlementRepos = undefined
  })
  it("performs zero writes in dry-run and only returns counts and amounts", async () => {
    const s = mockServices(); const saveDraft = jest.fn()
    const report = await migrateCustomers(fixture(), catalog, s.services, { apply: false, saveDraft })
    expectNoWrites(s); expect(saveDraft).not.toHaveBeenCalled()
    expect(report).toMatchObject({ mode: "dry-run", reconciled: false, target_after: null, source: { total_eur: "38.00", customers: 1 } })
    const log = JSON.stringify(report)
    for (const pii of ["person@example.test", "Synthetic", "Test 1", "c1", "o1"]) expect(log).not.toContain(pii)
  })
  it("imports archive, addresses and grant, reconciles real totals, then repeats without duplicates", async () => {
    const s = mockServices(); const saveDraft = jest.fn()
    const first = await migrateCustomers(fixture(), catalog, s.services, { apply: true, saveDraft })
    const second = await migrateCustomers(fixture(), catalog, s.services, { apply: true, saveDraft })
    expect(first).toMatchObject({ reconciled: true, target_after: { customers: 1, addresses: 1, orders: 1, entitlements: 1, total_eur: "38.00" } })
    expect(second.target_before).toEqual(first.target_after)
    expect(s.customer.createCustomers).toHaveBeenCalledTimes(1)
    expect(s.customer.createCustomerAddresses).toHaveBeenCalledTimes(1)
    expect(s.order.createOrders).toHaveBeenCalledTimes(1)
    expect(s.db.grants).toHaveLength(1)
    expect(s.entitlement.grant).toHaveBeenCalledWith(expect.objectContaining({ source: "migration", dedupe_key: "migration:o1:prod_target", customer_id: "cus_0", order_id: "order_0" }))
    expect(s.order.createOrders.mock.calls[0][0]).toMatchObject({ status: "archived", no_notification: true, metadata: { [NS]: { placed_at: "2020-01-02T12:00:00", payment_status: "Zaplatená" } } })
    expect(s.db.customers[0].has_account).toBe(false)
  })
  it("merges normalized email aliases and preserves an existing account and metadata", async () => {
    const s = mockServices(); const data = fixture()
    data.customers.push({ ...data.customers[0], legacy_id: "member-7", email: "PERSON@EXAMPLE.TEST", addresses: [] })
    s.db.customers.push({ id: "existing", email: "Person@Example.Test", first_name: "Current", has_account: true, metadata: { unrelated: "retained" } })
    const result = await migrateCustomers(data, catalog, s.services, { apply: true, saveDraft: jest.fn() })
    expect(result.source).toMatchObject({ customer_rows: 2, customers: 1 })
    expect(s.customer.createCustomers).not.toHaveBeenCalled()
    expect(s.db.customers[0]).toMatchObject({ first_name: "Current", has_account: true, metadata: { unrelated: "retained", [NS]: { legacy_ids: ["c1", "member-7"] } } })
  })
  it("rejects ambiguous target accounts before any mutation", async () => {
    const s = mockServices()
    s.db.customers.push({ id: "one", email: "person@example.test" }, { id: "two", email: "PERSON@example.test" })
    await expect(migrateCustomers(fixture(), catalog, s.services, { apply: true, saveDraft: jest.fn() })).rejects.toThrow("CUSTOMER_COLLISION")
    expectNoWrites(s)
  })
  it("preflights missing digital products and existing grant ownership before writes", async () => {
    const s = mockServices(); s.db.products = []
    await expect(migrateCustomers(fixture(), catalog, s.services, { apply: true, saveDraft: jest.fn() })).rejects.toThrow("ACCESS_PRODUCT_UNRESOLVED")
    expectNoWrites(s)
    const other = mockServices()
    // Přidám do entitlementRepo (ne db.grants, protože findByDedupeKey hledá v entitlementRepo)
    const grants = other.entitlementRepo.get("default") || []
    grants.push({ dedupe_key: "migration:o1:prod_target", customer_id: "wrong", product_id: "prod_target", source: "migration", id: "ent_conflict" })
    other.entitlementRepo.set("default", grants)
    await expect(migrateCustomers(fixture(), catalog, other.services, { apply: true, saveDraft: jest.fn() })).rejects.toThrow("ACCESS_CONFLICT")
    expectNoWrites(other)
  })
  it("retains revoked entitlements and reports them without reactivation", async () => {
    const s = mockServices()
    await migrateCustomers(fixture(), catalog, s.services, { apply: true, saveDraft: jest.fn() })
    s.db.grants[0].status = "revoked"
    const report = await migrateCustomers(fixture(), catalog, s.services, { apply: true, saveDraft: jest.fn() })
    expect(report).toMatchObject({ inactive_entitlements_preserved: 1 })
    expect(s.db.grants[0].status).toBe("revoked")
  })
  it("resumes a partial run after entitlement failure", async () => {
    const s = mockServices()
    s.entitlement.grant.mockRejectedValueOnce(new Error("synthetic failure"))
    await expect(migrateCustomers(fixture(), catalog, s.services, { apply: true, saveDraft: jest.fn() })).rejects.toThrow()
    const report = await migrateCustomers(fixture(), catalog, s.services, { apply: true, saveDraft: jest.fn() })
    expect(report.reconciled).toBe(true)
    expect(s.db.customers).toHaveLength(1); expect(s.db.orders).toHaveLength(1); expect(s.db.addresses).toHaveLength(1)
  })
  it("detects changed source snapshots and target amount drift", async () => {
    const s = mockServices()
    await migrateCustomers(fixture(), catalog, s.services, { apply: true, saveDraft: jest.fn() })
    const changed = fixture(); changed.orders[0].number = "changed"
    await expect(migrateCustomers(changed, catalog, s.services, { apply: false })).rejects.toThrow("ORDER_CONFLICT")
    s.db.orders[0].total = 37
    await expect(migrateCustomers(fixture(), catalog, s.services, { apply: false })).rejects.toThrow("ORDER_CONFLICT")
  })
  it("detects order line corruption even when the total is unchanged", async () => {
    const s = mockServices()
    await migrateCustomers(fixture(), catalog, s.services, { apply: true, saveDraft: jest.fn() })
    s.db.orders[0].items[0].title = "Changed"
    await expect(migrateCustomers(fixture(), catalog, s.services, { apply: false })).rejects.toThrow("ORDER_CONFLICT")
  })
  it("reads back persistence and fails if a service returns an unpersisted address", async () => {
    const s = mockServices()
    s.customer.createCustomerAddresses.mockImplementationOnce(async input => ({ ...input, id: "not_saved" }))
    await expect(migrateCustomers(fixture(), catalog, s.services, { apply: true, saveDraft: jest.fn() })).rejects.toThrow("RECONCILIATION_FAILED")
  })
  it("preserves fractional quantities, fee and discount rows using Medusa totals", async () => {
    const data = fixture(); const order = data.orders[0]
    order.items.push({ legacy_id: "fee", product_legacy_id: null, title: "Delivery", quantity: "1", unit_price: "3.00", vat_rate: "20" },
      { legacy_id: "discount", product_legacy_id: null, title: "Coupon", quantity: "1", unit_price: "-5.00", vat_rate: "20" })
    order.items[0].quantity = "1.5"; order.total = "55.00"
    const s = mockServices()
    const report = await migrateCustomers(data, catalog, s.services, { apply: true, saveDraft: jest.fn() })
    expect(report.target_after?.total_eur).toBe("55.00")
    expect(buildOrderInput(order, "cus", new Map()).items![0].product_id).toBeUndefined()
  })
  it("does not infer a grant from a paid digital order", async () => {
    const data = fixture(); data.accesses = []
    const s = mockServices()
    await migrateCustomers(data, catalog, s.services, { apply: true, saveDraft: jest.fn() })
    expect(s.entitlement.grant).not.toHaveBeenCalled()
  })
  it("uses an explicit stable fallback for access without order provenance", async () => {
    const data = fixture(); data.accesses[0].legacy_order_id = null
    const s = mockServices()
    await migrateCustomers(data, catalog, s.services, { apply: true, saveDraft: jest.fn() })
    expect(s.entitlement.grant).toHaveBeenCalledWith(expect.objectContaining({ dedupe_key: "migration:access-g1:prod_target", order_id: null }))
  })
  it("paginates past the first 200 customers", async () => {
    const s = mockServices()
    s.db.customers = Array.from({ length: 205 }, (_, i) => ({ id: `unrelated_${i}`, email: `synthetic${i}@example.test` }))
    s.db.customers.push({ id: "last", email: "person@example.test" })
    const report = await migrateCustomers(fixture(), catalog, s.services, { apply: false })
    expect(report.target_before.customers).toBe(1)
    expect(s.customer.listCustomers).toHaveBeenCalledTimes(2)
  })
})

const sql = [
  "INSERT [dbo].[ecCountry] ([pk], [code], [name]) VALUES ('country-sk', 'SK', N'Slovensko')",
  "INSERT [dbo].[ecCustomer] ([pk], [ownerId], [name], [email], [countryKey], [street], [city], [zip]) VALUES ('c1', 7, N'Synthetic', 'person@example.test', 'country-sk', 'Test 1', 'Test', '00000')",
  "INSERT [dbo].[cmsMember] ([nodeId], [Email], [LoginName], [Password]) VALUES (7, 'person@example.test', 'person@example.test', 'SYNTHETIC_HASH')",
  "INSERT [dbo].[ecQuote] ([pk], [dateFinished], [quoteYear], [quoteNumber], [quotePriceWithVat], [quoteState], [quotePriceState], [note]) VALUES ('o1', '2020-01-02T12:00:00', 2020, 1, 38, N'Odoslaná', N'Zaplatená', N'PRIVATE_HEALTH_NOTE'), ('basket', NULL, 2020, 0, 5, '', '', '')",
  "INSERT [dbo].[ecUser2Quote] ([pk], [pkQuote], [quoteEmail], [invName], [invStreet], [invCity], [invZip], [invCountry]) VALUES ('u1', 'o1', 'person@example.test', N'Synthetic', 'Test 1', 'Test', '00000', N'Slovensko')",
  "INSERT [dbo].[ecProduct2Quote] ([pk], [pkQuote], [pkProduct], [itemName], [itemPcs], [unitPriceWithVat], [vatPerc]) VALUES ('i1', 'o1', 'p1', N'Synthetic audio', 1, 38, 20)",
  "INSERT [dbo].[ecUser2Product] ([pk], [productKey], [userLoginName]) VALUES ('g1', 'p1', 'person@example.test')",
].join("\n")
describe("C1 parser bridge", () => {
  it("exports customers, addresses, completed orders and explicit access, strips secrets and notes", () => {
    const data = buildCustomerExport(sql, catalog)
    expect(data.customers).toHaveLength(2) // customer and member aliases, merged at import
    expect(data.orders).toHaveLength(1)
    expect(data.accesses[0].legacy_order_id).toBe("o1")
    expect(data.excluded_unfinished_quotes).toBe(1)
    expect(data.orders[0].billing_address?.country_code).toBe("sk")
    expect(JSON.stringify(data)).not.toMatch(/SYNTHETIC_HASH|PRIVATE_HEALTH_NOTE|[Pp]assword/)
  })
  it("does not expose parser values in syntax errors", () => {
    expect(() => buildCustomerExport("INSERT [dbo].[ecCustomer] ([pk]) VALUES (PRIVATE_BAD_VALUE)", catalog)).toThrow(/^CUSTOMER_MIGRATION_SQL_PARSE_FAILED$/)
  })
  it("refuses unknown countries instead of assuming Slovakia", () => {
    expect(() => buildCustomerExport(sql.replace("N'Slovensko')", "N'Unknown')"), catalog)).toThrow("COUNTRY_UNRESOLVED")
  })
  it("refuses orphaned rows and an empty or unrelated export", () => {
    expect(() => buildCustomerExport(sql.replace("'i1', 'o1'", "'i1', 'missing'"), catalog)).toThrow("ORPHAN_ORDER_ROW")
    expect(() => buildCustomerExport("", catalog)).toThrow("EMPTY_SOURCE_EXPORT")
  })
  it("retains explicit access when no historical order can be linked", () => {
    const data = buildCustomerExport(sql.replace("'g1', 'p1'", "'g1', 'p2'"), catalog)
    expect(data.accesses[0].legacy_order_id).toBeNull()
  })
})

describe("medusa exec adapter", () => {
  it("sanitizes errors that could contain filenames, tokens or PII", async () => {
    await expect(migrate({ args: ["--file=data-private/nonexistent.json"], container: { resolve: jest.fn() } } as any)).rejects.toThrow(/^CUSTOMER_MIGRATION_FAILED_REVIEW_PRIVATE_INPUT_AND_LOCAL_DB$/)
  })
  it.each(["dry-run", "concurrent", "wrong-db", "provider-error"])("enforces adapter boundaries: %s", async scenario => {
    fs.mkdirSync("data-private", { recursive: true })
    const dir = fs.mkdtempSync(path.resolve("data-private", "synthetic-adapter-"))
    const s = mockServices()
    const logger = { info: jest.fn() }
    const raw = jest.fn(async () => ({ rows: [{ locked: scenario !== "concurrent", db: scenario === "wrong-db" ? "wrong" : "anastasia_dev_wave1" }] }))
    const pg = { transaction: jest.fn(async fn => fn({ raw })) }
    const objects = {
      [ContainerRegistrationKeys.CONFIG_MODULE]: { projectConfig: { databaseUrl: "postgres://u@127.0.0.1/anastasia_dev_wave1" } },
      [ContainerRegistrationKeys.LOGGER]: logger, [ContainerRegistrationKeys.PG_CONNECTION]: pg,
      [Modules.CUSTOMER]: s.customer, [Modules.ORDER]: s.order, [Modules.PRODUCT]: s.product, entitlement: s.entitlement,
    }
    try {
      writePrivateJson(path.join(dir, "catalog.json"), catalog)
      writePrivateJson(path.join(dir, "customers.json"), fixture())
      if (scenario === "provider-error") s.customer.listCustomers.mockRejectedValueOnce(new Error("PRIVATE person@example.test"))
      const args = [`--file=${path.join(dir, "customers.json")}`, `--catalog=${path.join(dir, "catalog.json")}`]
      if (["concurrent", "wrong-db"].includes(scenario)) args.push("--apply")
      const run = migrate({ args, container: { resolve: name => objects[name] } } as any)
      if (scenario === "concurrent") await expect(run).rejects.toThrow("MIGRATION_ALREADY_RUNNING")
      else if (scenario === "wrong-db") await expect(run).rejects.toThrow("LOCAL_DATABASE_REQUIRED")
      else if (scenario === "provider-error") await expect(run).rejects.toThrow(/^CUSTOMER_MIGRATION_FAILED_REVIEW_PRIVATE_INPUT_AND_LOCAL_DB$/)
      else {
        await run
        expect(pg.transaction).not.toHaveBeenCalled()
        expect(logger.info).toHaveBeenCalledTimes(1)
        expect(logger.info.mock.calls[0][0]).not.toMatch(/person@example|Synthetic|token/)
        expect(JSON.parse(logger.info.mock.calls[0][0]).mode).toBe("dry-run")
      }
      expectNoWrites(s)
    } finally { fs.rmSync(dir, { recursive: true }) }
  })
})
