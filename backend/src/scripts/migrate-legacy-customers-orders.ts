import { createHash, randomBytes } from "node:crypto"
import * as fs from "node:fs"
import * as path from "node:path"
import { z } from "zod"
import type { ExecArgs, ICustomerModuleService, IOrderModuleService, IProductModuleService, CreateOrderDTO, OrderDTO } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type EntitlementModuleService from "../modules/entitlement/service"
import { decodeDump, parseInserts } from "./parse-legacy-db"
import type { SqlRow, LegacyCatalog } from "./parse-legacy-db"

const NS = "legacy_customer_migration"
const id = z.string().trim().min(1).max(200).regex(/^[a-zA-Z0-9_-]+$/)
const email = z.string().trim().toLowerCase().email().max(254)
const decimal = z.string().regex(/^-?\d{1,10}(?:\.\d{1,4})?$/)
const text = z.string().max(2000).default("")
const addressSchema = z.object({
  legacy_id: id, first_name: text, last_name: text, company: text,
  address_1: text, address_2: text, city: text, postal_code: text,
  country_code: z.string().regex(/^[a-z]{2}$/), phone: text,
}).strict()
const customerSchema = z.object({
  legacy_id: id, email, first_name: text, last_name: text, phone: text,
  addresses: z.array(addressSchema),
}).strict()
const itemSchema = z.object({
  legacy_id: id, product_legacy_id: id.nullable(), title: z.string().min(1).max(2000),
  quantity: decimal, unit_price: decimal, vat_rate: decimal,
}).strict()
const orderSchema = z.object({
  legacy_id: id, customer_legacy_id: id, email,
  // SQL datetime has no timezone: preserve the original representation, never guess UTC.
  placed_at: z.string().regex(/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)?$/),
  number: text, status: text, payment_status: text, currency_code: z.literal("eur"),
  total: decimal, items: z.array(itemSchema).min(1),
  billing_address: addressSchema.nullable(), shipping_address: addressSchema.nullable(),
}).strict()
const accessSchema = z.object({
  legacy_id: id, customer_legacy_id: id, product_legacy_id: id,
  legacy_order_id: id.nullable(), expires_at: z.string().datetime({ offset: true }).nullable(),
}).strict()
const dataSchema = z.object({
  version: z.literal(1), customers: z.array(customerSchema), orders: z.array(orderSchema),
  accesses: z.array(accessSchema), excluded_unfinished_quotes: z.number().int().nonnegative(),
}).strict()
export type MigrationData = z.infer<typeof dataSchema>
type Customer = MigrationData["customers"][number]
type Address = Customer["addresses"][number]
type Order = MigrationData["orders"][number]
type Meta = { legacy_ids?: string[]; legacy_id?: string; fingerprint?: string }
export type MigrationServices = {
  customer: Pick<ICustomerModuleService, "listCustomers" | "createCustomers" | "updateCustomers" | "listCustomerAddresses" | "createCustomerAddresses">
  order: Pick<IOrderModuleService, "listOrders" | "createOrders">
  product: Pick<IProductModuleService, "listProducts">
  entitlement: Pick<EntitlementModuleService, "grant" | "findByDedupeKey">
}
class MigrationError extends Error {
  constructor(code: string) { super(`CUSTOMER_MIGRATION_${code}`); this.name = "MigrationError" }
}
function fail(code: string): never { throw new MigrationError(code) }
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex")
const meta = (row: { metadata?: Record<string, unknown> | null }): Meta => (row.metadata?.[NS] ?? {}) as Meta
function unique<T>(rows: T[], key: (row: T) => string): Map<string, T> {
  const result = new Map<string, T>()
  for (const row of rows) {
    const k = key(row)
    if (result.has(k)) fail("DUPLICATE_ID")
    result.set(k, row)
  }
  return result
}
function scaled(value: string): bigint {
  if (!decimal.safeParse(value).success) fail("INVALID_DECIMAL")
  const negative = value.startsWith("-")
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".")
  const result = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"))
  return negative ? -result : result
}
function roundDiv(value: bigint, divisor: bigint): bigint {
  return value < 0n ? -roundDiv(-value, divisor) : (value + divisor / 2n) / divisor
}
function amount(value: unknown): bigint {
  const number = Number(value)
  if (!Number.isFinite(number) || Math.abs(number) > 9999999999) fail("INVALID_TARGET_TOTAL")
  return BigInt(Math.round((number + Number.EPSILON) * 100))
}
const money = (cents: bigint) => `${cents < 0n ? "-" : ""}${(cents < 0n ? -cents : cents) / 100n}.${((cents < 0n ? -cents : cents) % 100n).toString().padStart(2, "0")}`
function sourceTotal(order: Order) { return roundDiv(scaled(order.total), 100n) }
function addressInput(address: Address) {
  const { legacy_id, ...fields } = address
  return { ...fields, metadata: { [NS]: { legacy_id, fingerprint: fingerprint(address) } } }
}
function matchesAddress(target: unknown, source: Address | null): boolean {
  if (!source) return !target
  if (!target || typeof target !== "object") return false
  return Object.entries(addressInput(source)).every(([k, v]) => k === "metadata" || target[k] === v)
}
function matchesOrder(target: Pick<OrderDTO, "items" | "billing_address" | "shipping_address">, source: Order): boolean {
  if (target.items?.length !== source.items.length || !matchesAddress(target.billing_address, source.billing_address) ||
      !matchesAddress(target.shipping_address, source.shipping_address)) return false
  return source.items.every(item => {
    const matches = target.items!.filter(x => meta(x).legacy_id === item.legacy_id)
    return matches.length === 1 && matches[0].title === item.title &&
      Number(matches[0].quantity) === Number(item.quantity) && Number(matches[0].unit_price) === Number(item.unit_price)
  })
}

export function validateMigration(value: unknown): MigrationData {
  const result = dataSchema.safeParse(value)
  if (!result.success) fail("INVALID_INPUT") // Never expose Zod's input values or unknown field names.
  const data = result.data
  const customers = unique(data.customers, x => x.legacy_id)
  const orders = unique(data.orders, x => x.legacy_id)
  unique(data.accesses, x => x.legacy_id)
  unique(data.customers.flatMap(x => x.addresses), x => x.legacy_id)
  for (const order of data.orders) {
    if (!customers.has(order.customer_legacy_id)) fail("ORDER_CUSTOMER_MISSING")
    unique(order.items, x => x.legacy_id)
    const total = order.items.reduce((sum, item) => {
      if (scaled(item.quantity) <= 0n || scaled(item.vat_rate) < 0n || scaled(item.vat_rate) > 1000000n) fail("INVALID_ITEM")
      return sum + scaled(item.unit_price) * scaled(item.quantity)
    }, 0n)
    if (sourceTotal(order) < 0n || roundDiv(total, 1000000n) !== sourceTotal(order)) fail("SOURCE_TOTAL_MISMATCH")
  }
  for (const access of data.accesses) {
    const customer = customers.get(access.customer_legacy_id)
    if (!customer) fail("ACCESS_CUSTOMER_MISSING")
    if (access.legacy_order_id) {
      const order = orders.get(access.legacy_order_id)
      if (!order || customers.get(order.customer_legacy_id)?.email !== customer.email ||
          !order.items.some(x => x.product_legacy_id === access.product_legacy_id)) fail("ACCESS_ORDER_MISMATCH")
    }
  }
  return data
}

/** C1 exports only catalog.json. Reuse its INSERT parser, then explicitly allowlist C2 fields. */
export function buildCustomerExport(sql: string, catalog: Pick<LegacyCatalog, "currency">): MigrationData {
  if (catalog.currency !== "eur") fail("CURRENCY_UNSUPPORTED")
  const tables = ["ecCustomer", "cmsMember", "ecCountry", "ecQuote", "ecUser2Quote", "ecProduct2Quote", "ecUser2Product"]
  let rows: Record<string, SqlRow[]>
  try { rows = parseInserts(sql, tables) } catch { fail("SQL_PARSE_FAILED") }
  // SQL identifiers are case insensitive; exported column casing varies.
  for (const table of tables) rows[table] = rows[table].map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v])))
  const s = (row: SqlRow, key: string) => row[key] == null ? "" : String(row[key]).trim()
  const key = (row: SqlRow, column = "pk") => s(row, column).toLowerCase()
  const bool = (row: SqlRow, column: string) => row[column] === true || row[column] === 1
  const countries = unique(rows.ecCountry, r => key(r))
  for (const table of tables) {
    unique(rows[table], row => {
      const value = key(row, table === "cmsMember" ? "nodeid" : "pk")
      if (!value) fail("SOURCE_ID_MISSING")
      return value
    })
  }
  const quoteIds = new Set(rows.ecQuote.map(r => key(r)))
  if (rows.ecProduct2Quote.some(r => !quoteIds.has(key(r, "pkquote"))) ||
      rows.ecUser2Quote.some(r => !quoteIds.has(key(r, "pkquote")))) fail("ORPHAN_ORDER_ROW")
  const country = (value: string) => {
    const match = countries.get(value.toLowerCase()) ?? rows.ecCountry.find(r =>
      s(r, "name").toLowerCase() === value.toLowerCase() || s(r, "code").toLowerCase() === value.toLowerCase())
    const code = match ? s(match, "code").toLowerCase() : value.toLowerCase()
    if (!/^[a-z]{2}$/.test(code)) fail("COUNTRY_UNRESOLVED")
    return code
  }
  const address = (row: SqlRow, prefix: string, addressId: string, countryColumn: string): Address => ({
    legacy_id: addressId, first_name: s(row, `${prefix}name`), last_name: "", company: "",
    address_1: s(row, `${prefix}street`), address_2: "", city: s(row, `${prefix}city`),
    postal_code: s(row, `${prefix}zip`), country_code: country(s(row, countryColumn)),
    phone: s(row, `${prefix}phone`) || s(row, "quotephone"),
  })
  const customers: Customer[] = []
  const members = unique(rows.cmsMember, r => key(r, "nodeid"))
  const byEmail = new Map<string, Customer>()
  function addCustomer(legacyId: string, value: string, name = "", phone = "") {
    const normalized = email.safeParse(value)
    if (!normalized.success) fail("EMAIL_INVALID")
    const customer: Customer = { legacy_id: legacyId, email: normalized.data, first_name: name, last_name: "", phone, addresses: [] }
    customers.push(customer)
    if (!byEmail.has(customer.email)) byEmail.set(customer.email, customer)
    return customer
  }
  for (const row of rows.ecCustomer) {
    const member = members.get(key(row, "ownerid"))
    // A disagreement must be reviewed privately, never attach another member's purchases.
    if (member && s(member, "email").toLowerCase() !== s(row, "email").toLowerCase()) fail("MEMBER_EMAIL_CONFLICT")
    const c = addCustomer(`customer-${key(row)}`, s(row, "email"), s(row, "name"), s(row, "phone"))
    if (s(row, "street") || s(row, "city") || s(row, "zip")) c.addresses.push(address(row, "", `${c.legacy_id}-billing`, "countrykey"))
    if (bool(row, "isdeliveryaddress")) c.addresses.push(address(row, "delivery", `${c.legacy_id}-shipping`, "deliverycountrykey"))
  }
  // Retain member identity aliases, without roles, password hashes or auth cookies.
  for (const row of rows.cmsMember) addCustomer(`member-${key(row, "nodeid")}`, s(row, "email"))
  const getCustomer = (value: string, fallback: string) => byEmail.get(value.trim().toLowerCase()) ?? addCustomer(fallback, value)
  const orders: Order[] = []
  const quoteUsers = unique(rows.ecUser2Quote, r => key(r, "pkquote"))
  const zero = "00000000-0000-0000-0000-000000000000"
  for (const row of rows.ecQuote) {
    if (!s(row, "datefinished")) continue // These are baskets in the legacy repository.
    const legacyId = key(row)
    const user = quoteUsers.get(legacyId)
    if (!user) fail("ORDER_CONTACT_MISSING")
    const customer = getCustomer(s(user, "quoteemail"), `order-customer-${legacyId}`)
    const billing = address(user, "inv", `${legacyId}-billing`, "invcountry")
    billing.company = s(user, "companyname")
    orders.push({
      legacy_id: legacyId, customer_legacy_id: customer.legacy_id, email: s(user, "quoteemail"),
      placed_at: s(row, "datefinished"), number: `${s(row, "quoteyear")}/${s(row, "quotenumber")}`,
      status: s(row, "quotestate"), payment_status: s(row, "quotepricestate"), currency_code: "eur",
      total: s(row, "quotepricewithvat"), billing_address: billing,
      shipping_address: bool(user, "isdeliveryaddress") ? address(user, "delivery", `${legacyId}-shipping`, "deliverycountry") : billing,
      items: rows.ecProduct2Quote.filter(r => key(r, "pkquote") === legacyId).map(r => ({
        legacy_id: key(r), product_legacy_id: !key(r, "pkproduct") || key(r, "pkproduct") === zero ? null : key(r, "pkproduct"),
        title: s(r, "itemname"), quantity: s(r, "itempcs"), unit_price: s(r, "unitpricewithvat"), vat_rate: s(r, "vatperc"),
      })),
    })
  }
  const accesses = rows.ecUser2Product.map(row => {
    const legacyId = key(row)
    const customer = getCustomer(s(row, "userloginname"), `access-customer-${legacyId}`)
    const productId = key(row, "productkey")
    const candidates = orders.filter(o => byEmail.get(o.email.trim().toLowerCase())?.email === customer.email && o.items.some(i => i.product_legacy_id === productId))
    return { legacy_id: legacyId, customer_legacy_id: customer.legacy_id, product_legacy_id: productId,
      legacy_order_id: candidates.length === 1 ? candidates[0].legacy_id : null, expires_at: null }
  })
  if (!customers.length && !orders.length && !accesses.length) fail("EMPTY_SOURCE_EXPORT")
  return validateMigration({ version: 1, customers, orders, accesses,
    excluded_unfinished_quotes: rows.ecQuote.filter(r => !s(r, "datefinished")).length })
}

async function all<T>(list: (skip: number) => Promise<T[]>): Promise<T[]> {
  const result: T[] = []
  for (let skip = 0; ; skip += 200) {
    const page = await list(skip)
    result.push(...page)
    if (page.length < 200) return result
  }
}
export function buildOrderInput(order: Order, customerId: string, products: Map<string, string>): CreateOrderDTO {
  return {
    customer_id: customerId, email: order.email, currency_code: order.currency_code,
    status: "archived", no_notification: true,
    billing_address: order.billing_address ? addressInput(order.billing_address) : undefined,
    shipping_address: order.shipping_address ? addressInput(order.shipping_address) : undefined,
    items: order.items.map(item => ({
      title: item.title, product_id: item.product_legacy_id ? products.get(item.product_legacy_id) : undefined,
      quantity: item.quantity, unit_price: item.unit_price, requires_shipping: false,
      is_discountable: false, is_tax_inclusive: true,
      metadata: { [NS]: { legacy_id: item.legacy_id, legacy_product_id: item.product_legacy_id, vat_rate: item.vat_rate } },
    })),
    metadata: { [NS]: { legacy_id: order.legacy_id, fingerprint: fingerprint(order),
      placed_at: order.placed_at, number: order.number, status: order.status, payment_status: order.payment_status,
      total: order.total, historical: true, tax_breakdown: "legacy_snapshot_only" } },
  }
}

export function preparePasswordDraft(customerId: string, recipient: string, now = new Date()) {
  const token = randomBytes(32).toString("base64url")
  return { version: 1, customer_id: customerId, to: recipient, status: "draft_requires_auth_binding",
    template: "set-password-sk", subject: "Nastavte si heslo k svojmu účtu",
    text: "Váš účet a história nákupov boli prenesené. Heslo si nastavíte cez odkaz: {{SET_PASSWORD_URL}}",
    token, token_sha256: createHash("sha256").update(token).digest("hex"), created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), send: false }
}

export async function migrateCustomers(value: unknown, catalog: Pick<LegacyCatalog, "products">,
  services: MigrationServices, options: { apply: boolean; saveDraft?: (customerId: string, email: string) => void }) {
  const data = validateMigration(value)
  const sourceCustomers = unique(data.customers, x => x.legacy_id)
  const groups = new Map<string, Customer[]>()
  for (const c of data.customers) groups.set(c.email, [...(groups.get(c.email) ?? []), c])
  const catalogProducts = unique(catalog.products, p => p.legacy_id)
  const customers = await all(skip => services.customer.listCustomers({}, { take: 200, skip, order: { id: "ASC" } }))
  const addresses = await all(skip => services.customer.listCustomerAddresses({}, { take: 200, skip, order: { id: "ASC" } }))
  const orders = await all(skip => services.order.listOrders({}, { take: 200, skip, order: { id: "ASC" }, select: ["id", "customer_id", "currency_code", "total", "metadata"], relations: ["billing_address", "shipping_address", "items", "items.tax_lines", "items.adjustments", "shipping_methods", "shipping_methods.tax_lines", "shipping_methods.adjustments", "credit_lines"] }))
  const products = await all(skip => services.product.listProducts({}, { take: 200, skip, order: { id: "ASC" }, select: ["id", "metadata"] }))
  const productMap = new Map<string, string>()
  for (const p of products) {
    const legacy = p.metadata?.legacy_id
    if (typeof legacy !== "string") continue
    if (productMap.has(legacy)) fail("PRODUCT_COLLISION")
    productMap.set(legacy, p.id)
  }
  const customerTargets = new Map<string, (typeof customers)[number]>()
  const orderTargets = unique(orders.filter(o => meta(o).legacy_id), o => meta(o).legacy_id!)
  const addressTargets = unique(addresses.filter(a => meta(a).legacy_id), a => meta(a).legacy_id!)
  // Preflight the ENTIRE batch, including existing grants, before the first mutation.
  for (const [mail, group] of groups) {
    const ids = group.map(c => c.legacy_id)
    const matches = customers.filter(c => c.email?.trim().toLowerCase() === mail || meta(c).legacy_ids?.some(x => ids.includes(x)))
    if (matches.length > 1) fail("CUSTOMER_COLLISION")
    const existing = matches[0]
    if (existing) {
      if (existing.email?.trim().toLowerCase() !== mail) fail("CUSTOMER_IDENTITY_CHANGED")
      customerTargets.set(mail, existing)
    }
    for (const a of group.flatMap(c => c.addresses)) {
      const target = addressTargets.get(a.legacy_id)
      if (target && (!existing || target.customer_id !== existing.id || meta(target).fingerprint !== fingerprint(a) ||
          !Object.entries(addressInput(a)).every(([k, v]) => k === "metadata" || target[k] === v))) fail("ADDRESS_CONFLICT")
    }
  }
  for (const order of data.orders) {
    const existing = orderTargets.get(order.legacy_id)
    if (existing && (!matchesOrder(existing, order) || meta(existing).fingerprint !== fingerprint(order) || existing.currency_code !== order.currency_code ||
        amount(existing.total) !== sourceTotal(order) || existing.customer_id !== customerTargets.get(sourceCustomers.get(order.customer_legacy_id)!.email)?.id)) fail("ORDER_CONFLICT")
    // Deleted catalog products remain valid historical snapshots; access grants require a mapped product.
  }
  const grants = new Map<string, { access: MigrationData["accesses"][number]; productId: string; existing: Awaited<ReturnType<MigrationServices["entitlement"]["findByDedupeKey"]>> }>()
  for (const access of data.accesses) {
    const productId = productMap.get(access.product_legacy_id)
    if (!productId || catalogProducts.get(access.product_legacy_id)?.kind !== "digital") fail("ACCESS_PRODUCT_UNRESOLVED")
    const key = `migration:${access.legacy_order_id ?? `access-${access.legacy_id}`}:${productId}`
    if (grants.has(key)) {
      const previous = grants.get(key)!.access
      if (sourceCustomers.get(previous.customer_legacy_id)!.email !== sourceCustomers.get(access.customer_legacy_id)!.email || previous.expires_at !== access.expires_at) fail("ACCESS_COLLISION")
      continue
    }
    const existing = await services.entitlement.findByDedupeKey(key)
    if (existing && (existing.customer_id !== customerTargets.get(sourceCustomers.get(access.customer_legacy_id)!.email)?.id || existing.product_id !== productId || existing.source !== "migration")) fail("ACCESS_CONFLICT")
    grants.set(key, { access, productId, existing })
  }
  const source = { customer_rows: data.customers.length, customers: groups.size,
    addresses: data.customers.reduce((n, c) => n + c.addresses.length, 0), orders: data.orders.length,
    order_items: data.orders.reduce((n, o) => n + o.items.length, 0),
    access_rows: data.accesses.length, entitlements: grants.size,
    total_eur: money(data.orders.reduce((sum, order) => sum + sourceTotal(order), 0n)),
    excluded_unfinished_quotes: data.excluded_unfinished_quotes }
  const observedBefore = { customers: customerTargets.size,
    addresses: data.customers.flatMap(c => c.addresses).filter(a => addressTargets.has(a.legacy_id)).length,
    orders: data.orders.filter(o => orderTargets.has(o.legacy_id)).length,
    order_items: data.orders.reduce((n, o) => n + (orderTargets.get(o.legacy_id)?.items?.length ?? 0), 0),
    entitlements: [...grants.values()].filter(g => g.existing).length,
    total_eur: money(data.orders.reduce((sum, o) => sum + (orderTargets.has(o.legacy_id) ? amount(orderTargets.get(o.legacy_id)!.total) : 0n), 0n)) }
  if (!options.apply) {
    // Preview generation is in memory only; tokens/addresses never enter the returned report.
    for (const mail of groups.keys()) preparePasswordDraft("dry-run", mail)
    return { mode: "dry-run", source, target_before: observedBefore, target_after: null,
      planned: { customers: source.customers - observedBefore.customers, addresses: source.addresses - observedBefore.addresses,
        orders: source.orders - observedBefore.orders, entitlements: source.entitlements - observedBefore.entitlements,
        password_drafts: groups.size }, reconciled: false }
  }
  if (!options.saveDraft) fail("DRAFT_WRITER_REQUIRED")
  for (const [mail, group] of groups) {
    let target = customerTargets.get(mail)
    const ids = [...new Set([...(target ? meta(target).legacy_ids ?? [] : []), ...group.map(c => c.legacy_id)])].sort()
    const metadata = { ...(target?.metadata ?? {}), [NS]: { legacy_ids: ids } }
    if (!target) {
      const c = group[0]
      target = await services.customer.createCustomers({ email: mail, first_name: c.first_name, last_name: c.last_name,
        phone: c.phone, has_account: false, metadata })
    } else if (JSON.stringify(meta(target).legacy_ids) !== JSON.stringify(ids)) {
      target = await services.customer.updateCustomers(target.id, { metadata })
    }
    customerTargets.set(mail, target)
    for (const address of group.flatMap(c => c.addresses)) if (!addressTargets.has(address.legacy_id)) {
      const created = await services.customer.createCustomerAddresses({ customer_id: target.id, ...addressInput(address) })
      addressTargets.set(address.legacy_id, created)
    }
  }
  for (const order of data.orders) if (!orderTargets.has(order.legacy_id)) {
    const customerId = customerTargets.get(sourceCustomers.get(order.customer_legacy_id)!.email)!.id
    const created = await services.order.createOrders(buildOrderInput(order, customerId, productMap))
    orderTargets.set(order.legacy_id, created)
    if (amount(created.total) !== sourceTotal(order)) fail("TARGET_TOTAL_MISMATCH")
  }
  for (const [key, { access, productId }] of grants) {
    const customerId = customerTargets.get(sourceCustomers.get(access.customer_legacy_id)!.email)!.id
    const result = await services.entitlement.grant({ customer_id: customerId, product_id: productId, source: "migration",
      dedupe_key: key, order_id: access.legacy_order_id ? orderTargets.get(access.legacy_order_id)!.id : null,
      expires_at: access.expires_at ? new Date(access.expires_at) : null,
      metadata: { legacy_access_id: access.legacy_id, legacy_order_id: access.legacy_order_id } })
    if (result.entitlement.customer_id !== customerId || result.entitlement.product_id !== productId) fail("ACCESS_CONFLICT")
  }
  // Independently re-read module storage. Report persisted values, not attempted writes.
  const afterCustomers = await all(skip => services.customer.listCustomers({}, { take: 200, skip, order: { id: "ASC" } }))
  const afterAddresses = await all(skip => services.customer.listCustomerAddresses({}, { take: 200, skip, order: { id: "ASC" } }))
  const afterOrders = await all(skip => services.order.listOrders({ id: [...orderTargets.values()].filter(o => data.orders.some(s => s.legacy_id === meta(o).legacy_id)).map(o => o.id) },
    { take: 200, skip, order: { id: "ASC" }, select: ["id", "customer_id", "currency_code", "total", "metadata"], relations: ["billing_address", "shipping_address", "items", "items.tax_lines", "items.adjustments", "shipping_methods", "shipping_methods.tax_lines", "shipping_methods.adjustments", "credit_lines"] }))
  const targetAfter = { customers: 0, addresses: 0, orders: 0, order_items: 0, entitlements: 0, total_eur: "0.00" }
  for (const [mail, group] of groups) {
    const found = afterCustomers.filter(c => c.id === customerTargets.get(mail)!.id && c.email?.trim().toLowerCase() === mail && group.every(g => meta(c).legacy_ids?.includes(g.legacy_id)))
    if (found.length !== 1) fail("RECONCILIATION_FAILED")
    targetAfter.customers++
    for (const a of group.flatMap(c => c.addresses)) {
      const actual = afterAddresses.filter(x => meta(x).legacy_id === a.legacy_id && x.customer_id === found[0].id)
      if (actual.length !== 1 || !Object.entries(addressInput(a)).every(([k, v]) => k === "metadata" || actual[0][k] === v)) fail("RECONCILIATION_FAILED")
      targetAfter.addresses++
    }
  }
  let total = 0n
  for (const order of data.orders) {
    const found = afterOrders.filter(o => meta(o).legacy_id === order.legacy_id)
    if (found.length !== 1 || !matchesOrder(found[0], order) || amount(found[0].total) !== sourceTotal(order) || found[0].currency_code !== "eur" ||
        found[0].customer_id !== customerTargets.get(sourceCustomers.get(order.customer_legacy_id)!.email)!.id) fail("RECONCILIATION_FAILED")
    total += amount(found[0].total)
    targetAfter.orders++
    targetAfter.order_items += found[0].items!.length
  }
  targetAfter.total_eur = money(total)
  let inactiveEntitlements = 0
  for (const [key, { access, productId }] of grants) {
    const found = await services.entitlement.findByDedupeKey(key)
    if (!found || found.customer_id !== customerTargets.get(sourceCustomers.get(access.customer_legacy_id)!.email)!.id || found.product_id !== productId) fail("RECONCILIATION_FAILED")
    targetAfter.entitlements++
    if (found.status !== "active" || (found.expires_at && new Date(found.expires_at).getTime() <= Date.now())) inactiveEntitlements++
  }
  for (const [mail, target] of customerTargets) options.saveDraft(target.id, mail)
  return { mode: "apply", source, target_before: observedBefore, target_after: targetAfter,
    reconciled: targetAfter.total_eur === source.total_eur, inactive_entitlements_preserved: inactiveEntitlements }
}

/** Reject remote/production DBs before resolving a DB connection. No URL is ever logged. */
export function assertLocalDatabase(databaseUrl: unknown) {
  try {
    const url = new URL(String(databaseUrl))
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
        url.pathname !== "/anastasia_dev_wave1" || url.search || url.hash || process.env.NODE_ENV === "production") fail("LOCAL_DATABASE_REQUIRED")
  } catch { fail("LOCAL_DATABASE_REQUIRED") }
}
export function parseOptions(args: string[]) {
  let apply = false, prepareSql: string | undefined
  let file = "data-private/legacy/customers-orders.json", catalog = "data-private/legacy/catalog.json"
  const seen = new Set<string>()
  for (const arg of args.filter(x => x !== "--")) {
    const name = arg.split("=", 1)[0]
    if (seen.has(name)) fail("INVALID_ARGUMENTS")
    seen.add(name)
    if (arg === "--apply") apply = true
    else if (arg.startsWith("--file=")) file = arg.slice(7)
    else if (arg.startsWith("--catalog=")) catalog = arg.slice(10)
    else if (arg.startsWith("--prepare-sql=")) prepareSql = arg.slice(14)
    else fail("INVALID_ARGUMENTS")
  }
  if (!file || !catalog || prepareSql === "" || (prepareSql && apply)) fail("INVALID_ARGUMENTS")
  return { apply, file, catalog, prepareSql }
}
function privatePath(file: string): string {
  const root = path.resolve("data-private")
  const target = path.resolve(file)
  if (!target.startsWith(root + path.sep)) fail("PRIVATE_PATH_REQUIRED")
  // Disallow symlinks in any private path component, including the file itself.
  let current = process.cwd()
  for (const part of path.relative(current, target).split(path.sep)) {
    current = path.join(current, part)
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) fail("PRIVATE_PATH_REQUIRED")
  }
  return target
}
export function writePrivateJson(file: string, value: unknown) {
  const target = privatePath(file)
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })
  // Exclusive creation: an existing private export is never silently overwritten.
  const fd = fs.openSync(target, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o600)
  try { fs.writeFileSync(fd, JSON.stringify(value, null, 2)); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
}
export function savePasswordDraft(customerId: string, recipient: string) {
  const file = privatePath(path.join("data-private", "legacy", "password-drafts", `${fingerprint(customerId)}.json`))
  if (fs.existsSync(file)) {
    const old = JSON.parse(fs.readFileSync(file, "utf8"))
    if (old.customer_id !== customerId || old.to !== recipient || old.send !== false ||
        old.status !== "draft_requires_auth_binding" || !/^[A-Za-z0-9_-]{43}$/.test(old.token) ||
        old.token_sha256 !== createHash("sha256").update(old.token).digest("hex")) fail("DRAFT_CONFLICT")
    return // Retain expired drafts; K6 will issue real auth tokens when sending is authorized.
  }
  writePrivateJson(file, preparePasswordDraft(customerId, recipient))
}
export default async function migrateLegacyCustomersOrders({ container, args }: ExecArgs) {
  try {
    const options = parseOptions(args ?? [])
    const catalog = JSON.parse(fs.readFileSync(privatePath(options.catalog), "utf8")) as LegacyCatalog
    if (!Array.isArray(catalog.products) || catalog.currency !== "eur") fail("CATALOG_INVALID")
    if (options.prepareSql) {
      const data = buildCustomerExport(decodeDump(fs.readFileSync(options.prepareSql)), catalog)
      writePrivateJson(options.file, data)
      container.resolve(ContainerRegistrationKeys.LOGGER).info("CUSTOMER_MIGRATION_EXPORT_PREPARED")
      return
    }
    const data = validateMigration(JSON.parse(fs.readFileSync(privatePath(options.file), "utf8")))
    const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
    assertLocalDatabase(config.projectConfig.databaseUrl)
    const services: MigrationServices = { customer: container.resolve(Modules.CUSTOMER), order: container.resolve(Modules.ORDER),
      product: container.resolve(Modules.PRODUCT), entitlement: container.resolve("entitlement") }
    const run = () => migrateCustomers(data, catalog, services, { apply: options.apply, saveDraft: savePasswordDraft })
    let report: Awaited<ReturnType<typeof migrateCustomers>>
    if (options.apply) {
      const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
      report = await pg.transaction(async trx => {
        const result = await trx.raw("select pg_try_advisory_xact_lock(1869898851, 2) as locked, current_database() as db")
        if (result.rows[0]?.db !== "anastasia_dev_wave1") fail("LOCAL_DATABASE_REQUIRED")
        if (!result.rows[0]?.locked) fail("MIGRATION_ALREADY_RUNNING")
        return run()
      })
    } else report = await run()
    container.resolve(ContainerRegistrationKeys.LOGGER).info(JSON.stringify(report))
  } catch (error) {
    // CLI prints uncaught errors; discard SQL errors, filenames, tokens, parser excerpts and PII.
    throw error instanceof MigrationError ? error : new MigrationError("FAILED_REVIEW_PRIVATE_INPUT_AND_LOCAL_DB")
  }
}

// Offline export must not initialize Medusa or read its environment configuration.
if (require.main === module) {
  try {
    const options = parseOptions(process.argv.slice(2))
    if (!options.prepareSql) fail("OFFLINE_EXPORT_REQUIRES_PREPARE_SQL")
    const catalog = JSON.parse(fs.readFileSync(privatePath(options.catalog), "utf8")) as LegacyCatalog
    const data = buildCustomerExport(decodeDump(fs.readFileSync(options.prepareSql)), catalog)
    writePrivateJson(options.file, data)
    process.stdout.write("CUSTOMER_MIGRATION_EXPORT_PREPARED\n")
  } catch (error) {
    process.stderr.write(`${error instanceof MigrationError ? error.message : "CUSTOMER_MIGRATION_EXPORT_FAILED"}\n`)
    process.exitCode = 1
  }
}
