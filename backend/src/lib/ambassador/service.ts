import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"

export interface AmbassadorPayout {
  id: string
  amount: number
  period?: string
  created_at: string
  note?: string
  by?: string
}

export interface AmbassadorMetadata {
  code: string
  commission_percent: number
  status: "active" | "paused"
  joined_at: string
  note?: string
  payouts?: AmbassadorPayout[]
}

export interface AmbassadorSettings {
  enabled: boolean
  default_percent: number
  cookie_days: number
  attribution: "last_click" | "first_click"
}

export interface AmbassadorSummary {
  id: string
  name: string
  email: string
  code: string
  commission_percent: number
  status: "active" | "paused"
  joined_at: string
  note?: string
  orders_count: number
  revenue: number
  commission_total: number
  commission_paid: number
  commission_pending: number
  payouts: AmbassadorPayout[]
}

export interface AttributedOrder {
  id: string
  display_id: number | string
  created_at: string
  customer_name: string
  customer_email: string
  total: number
  commission_amount: number
  commission_percent: number
  order_status: string
  payment_status: string
}

export const AMBASSADOR_SETTINGS_KEY = "anastasia_ambassadors"

export const DEFAULT_AMBASSADOR_SETTINGS: AmbassadorSettings = {
  enabled: true,
  default_percent: 10,
  cookie_days: 30,
  attribution: "last_click",
}

export function readAmbassadorMetadata(customer: any): AmbassadorMetadata | null {
  const meta = customer?.metadata?.ambassador
  if (!meta || typeof meta !== "object") return null
  if (typeof meta.code !== "string" || !meta.code.trim()) return null
  return {
    code: String(meta.code).trim().toUpperCase(),
    commission_percent: typeof meta.commission_percent === "number" ? meta.commission_percent : 10,
    status: meta.status === "paused" ? "paused" : "active",
    joined_at: typeof meta.joined_at === "string" ? meta.joined_at : customer.created_at || new Date().toISOString(),
    note: typeof meta.note === "string" ? meta.note : "",
    payouts: Array.isArray(meta.payouts) ? meta.payouts : [],
  }
}

export async function getAmbassadorSettings(scope: MedusaContainer): Promise<AmbassadorSettings> {
  const storeModule = scope.resolve(Modules.STORE) as any
  const [store] = await storeModule.listStores({}, { take: 1 })
  const saved = store?.metadata?.[AMBASSADOR_SETTINGS_KEY]
  if (!saved || typeof saved !== "object") return { ...DEFAULT_AMBASSADOR_SETTINGS }
  return {
    enabled: saved.enabled !== false,
    default_percent: typeof saved.default_percent === "number" ? Math.max(0, Math.min(100, saved.default_percent)) : DEFAULT_AMBASSADOR_SETTINGS.default_percent,
    cookie_days: typeof saved.cookie_days === "number" ? Math.max(1, Math.min(365, saved.cookie_days)) : DEFAULT_AMBASSADOR_SETTINGS.cookie_days,
    attribution: saved.attribution === "first_click" ? "first_click" : "last_click",
  }
}

export async function updateAmbassadorSettings(scope: MedusaContainer, update: Partial<AmbassadorSettings>): Promise<AmbassadorSettings> {
  const storeModule = scope.resolve(Modules.STORE) as any
  const [store] = await storeModule.listStores({}, { take: 1 })
  if (!store) throw new Error("STORE_NOT_FOUND")
  const current = await getAmbassadorSettings(scope)
  const next: AmbassadorSettings = {
    enabled: typeof update.enabled === "boolean" ? update.enabled : current.enabled,
    default_percent: typeof update.default_percent === "number" ? Math.max(0, Math.min(100, update.default_percent)) : current.default_percent,
    cookie_days: typeof update.cookie_days === "number" ? Math.max(1, Math.min(365, update.cookie_days)) : current.cookie_days,
    attribution: update.attribution === "first_click" ? "first_click" : "last_click",
  }
  const metadata = { ...(store.metadata || {}), [AMBASSADOR_SETTINGS_KEY]: next }
  await storeModule.updateStores(store.id, { metadata })
  return next
}

export async function listAmbassadors(scope: MedusaContainer): Promise<{ ambassadors: AmbassadorSummary[]; count: number }> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["id", "first_name", "last_name", "email", "metadata", "created_at"],
    pagination: { take: 1000 },
  })

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "total", "currency_code", "created_at", "status", "payment_status", "metadata"],
    pagination: { take: 5000 },
  })

  // Index orders by ambassador code / customer_id
  const ordersByCode = new Map<string, any[]>()
  for (const o of orders || []) {
    const amb = o.metadata?.ambassador
    if (amb && typeof amb.code === "string") {
      const code = amb.code.toUpperCase()
      const list = ordersByCode.get(code) || []
      list.push(o)
      ordersByCode.set(code, list)
    }
  }

  const ambassadors: AmbassadorSummary[] = []
  for (const c of customers || []) {
    const meta = readAmbassadorMetadata(c)
    if (!meta) continue

    const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.email
    const attOrders = ordersByCode.get(meta.code) || []

    let revenue = 0
    let commissionTotal = 0
    for (const o of attOrders) {
      if (o.status === "canceled") continue
      const total = Number(o.total || 0)
      revenue += total
      const commAmount = typeof o.metadata?.ambassador?.commission_amount === "number"
        ? o.metadata.ambassador.commission_amount
        : Math.round(total * (meta.commission_percent / 100) * 100) / 100
      commissionTotal += commAmount
    }

    const commissionPaid = (meta.payouts || []).reduce((sum, p) => sum + Number(p.amount || 0), 0)
    const commissionPending = Math.max(0, Math.round((commissionTotal - commissionPaid) * 100) / 100)

    ambassadors.push({
      id: c.id,
      name,
      email: c.email,
      code: meta.code,
      commission_percent: meta.commission_percent,
      status: meta.status,
      joined_at: meta.joined_at,
      note: meta.note,
      orders_count: attOrders.length,
      revenue: Math.round(revenue * 100) / 100,
      commission_total: Math.round(commissionTotal * 100) / 100,
      commission_paid: Math.round(commissionPaid * 100) / 100,
      commission_pending: commissionPending,
      payouts: meta.payouts || [],
    })
  }

  // Sort active first, then by revenue desc
  ambassadors.sort((a, b) => {
    if (a.status !== b.status) return a.status === "active" ? -1 : 1
    return b.revenue - a.revenue
  })

  return { ambassadors, count: ambassadors.length }
}

export async function getAmbassadorById(scope: MedusaContainer, id: string): Promise<{ ambassador: AmbassadorSummary; orders: AttributedOrder[] }> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["id", "first_name", "last_name", "email", "phone", "metadata", "created_at"],
    filters: { id },
  })

  const customer = customers?.[0]
  if (!customer) throw new Error("CUSTOMER_NOT_FOUND")
  const meta = readAmbassadorMetadata(customer)
  if (!meta) throw new Error("NOT_AN_AMBASSADOR")

  const { data: allOrders } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "total", "currency_code", "created_at", "status", "payment_status", "metadata", "customer.first_name", "customer.last_name", "customer.email"],
    pagination: { take: 5000 },
  })

  const orders: AttributedOrder[] = []
  let revenue = 0
  let commissionTotal = 0

  for (const o of allOrders || []) {
    const amb = o.metadata?.ambassador
    if (!amb || String(amb.code || "").toUpperCase() !== meta.code) continue

    const total = Number(o.total || 0)
    const commAmount = typeof amb.commission_amount === "number"
      ? amb.commission_amount
      : Math.round(total * (meta.commission_percent / 100) * 100) / 100

    if (o.status !== "canceled") {
      revenue += total
      commissionTotal += commAmount
    }

    const cName = [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(" ").trim() || o.customer?.email || "—"

    orders.push({
      id: o.id,
      display_id: o.display_id,
      created_at: o.created_at,
      customer_name: cName,
      customer_email: o.customer?.email || "",
      total: Math.round(total * 100) / 100,
      commission_amount: commAmount,
      commission_percent: typeof amb.commission_percent === "number" ? amb.commission_percent : meta.commission_percent,
      order_status: o.status,
      payment_status: o.payment_status,
    })
  }

  orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const commissionPaid = (meta.payouts || []).reduce((sum, p) => sum + Number(p.amount || 0), 0)
  const commissionPending = Math.max(0, Math.round((commissionTotal - commissionPaid) * 100) / 100)

  const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim() || customer.email

  return {
    ambassador: {
      id: customer.id,
      name,
      email: customer.email,
      code: meta.code,
      commission_percent: meta.commission_percent,
      status: meta.status,
      joined_at: meta.joined_at,
      note: meta.note,
      orders_count: orders.length,
      revenue: Math.round(revenue * 100) / 100,
      commission_total: Math.round(commissionTotal * 100) / 100,
      commission_paid: Math.round(commissionPaid * 100) / 100,
      commission_pending: commissionPending,
      payouts: meta.payouts || [],
    },
    orders,
  }
}

export async function createAmbassador(
  scope: MedusaContainer,
  input: {
    customer_id?: string
    email?: string
    name?: string
    first_name?: string
    last_name?: string
    code: string
    commission_percent?: number
    note?: string
    status?: "active" | "paused"
  }
): Promise<AmbassadorSummary> {
  const code = String(input.code || "").trim().toUpperCase()
  if (!code || !/^[A-Z0-9_-]{3,24}$/.test(code)) {
    throw new Error("INVALID_AMBASSADOR_CODE")
  }

  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const customerModule = scope.resolve(Modules.CUSTOMER) as any

  // Verify code uniqueness among existing ambassadors
  const { data: existingCustomers } = await query.graph({
    entity: "customer",
    fields: ["id", "metadata"],
    pagination: { take: 1000 },
  })
  for (const ec of existingCustomers || []) {
    const meta = readAmbassadorMetadata(ec)
    if (meta && meta.code === code && (!input.customer_id || ec.id !== input.customer_id)) {
      throw new Error("AMBASSADOR_CODE_ALREADY_EXISTS")
    }
  }

  const settings = await getAmbassadorSettings(scope)
  const commissionPercent = typeof input.commission_percent === "number" && input.commission_percent >= 0 && input.commission_percent <= 100
    ? input.commission_percent
    : settings.default_percent

  let targetCustomer: any = null

  if (input.customer_id) {
    const { data } = await query.graph({
      entity: "customer",
      fields: ["id", "first_name", "last_name", "email", "metadata", "created_at"],
      filters: { id: input.customer_id },
    })
    targetCustomer = data?.[0]
    if (!targetCustomer) throw new Error("CUSTOMER_NOT_FOUND")
  } else if (input.email) {
    const email = input.email.trim().toLowerCase()
    const { data } = await query.graph({
      entity: "customer",
      fields: ["id", "first_name", "last_name", "email", "metadata", "created_at"],
      filters: { email },
    })
    if (data?.length) {
      targetCustomer = data[0]
    } else {
      let firstName = input.first_name || ""
      let lastName = input.last_name || ""
      if (!firstName && input.name) {
        const parts = input.name.trim().split(/\s+/)
        firstName = parts[0]
        lastName = parts.slice(1).join(" ")
      }
      targetCustomer = await customerModule.createCustomers({
        email,
        first_name: firstName,
        last_name: lastName,
      })
    }
  } else {
    throw new Error("EMAIL_OR_CUSTOMER_ID_REQUIRED")
  }

  const existingMeta = targetCustomer.metadata || {}
  const ambassadorMeta: AmbassadorMetadata = {
    code,
    commission_percent: commissionPercent,
    status: input.status === "paused" ? "paused" : "active",
    joined_at: new Date().toISOString(),
    note: input.note ? String(input.note).trim() : "",
    payouts: [],
  }

  await customerModule.updateCustomers(targetCustomer.id, {
    metadata: { ...existingMeta, ambassador: ambassadorMeta },
  })

  const name = [targetCustomer.first_name, targetCustomer.last_name].filter(Boolean).join(" ").trim() || targetCustomer.email

  return {
    id: targetCustomer.id,
    name,
    email: targetCustomer.email,
    code,
    commission_percent: commissionPercent,
    status: ambassadorMeta.status,
    joined_at: ambassadorMeta.joined_at,
    note: ambassadorMeta.note,
    orders_count: 0,
    revenue: 0,
    commission_total: 0,
    commission_paid: 0,
    commission_pending: 0,
    payouts: [],
  }
}

export async function updateAmbassador(
  scope: MedusaContainer,
  id: string,
  update: {
    commission_percent?: number
    status?: "active" | "paused"
    note?: string
    code?: string
  }
): Promise<AmbassadorSummary> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const customerModule = scope.resolve(Modules.CUSTOMER) as any

  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["id", "first_name", "last_name", "email", "metadata", "created_at"],
    filters: { id },
  })

  const customer = customers?.[0]
  if (!customer) throw new Error("CUSTOMER_NOT_FOUND")
  const currentMeta = readAmbassadorMetadata(customer)
  if (!currentMeta) throw new Error("NOT_AN_AMBASSADOR")

  let newCode = currentMeta.code
  if (update.code) {
    const cand = update.code.trim().toUpperCase()
    if (!/^[A-Z0-9_-]{3,24}$/.test(cand)) throw new Error("INVALID_AMBASSADOR_CODE")
    if (cand !== currentMeta.code) {
      // Check collision
      const { data: allCust } = await query.graph({ entity: "customer", fields: ["id", "metadata"], pagination: { take: 1000 } })
      for (const ec of allCust || []) {
        const m = readAmbassadorMetadata(ec)
        if (m && m.code === cand && ec.id !== id) throw new Error("AMBASSADOR_CODE_ALREADY_EXISTS")
      }
      newCode = cand
    }
  }

  const nextMeta: AmbassadorMetadata = {
    ...currentMeta,
    code: newCode,
    commission_percent: typeof update.commission_percent === "number" && update.commission_percent >= 0 && update.commission_percent <= 100
      ? update.commission_percent
      : currentMeta.commission_percent,
    status: update.status === "paused" ? "paused" : update.status === "active" ? "active" : currentMeta.status,
    note: typeof update.note === "string" ? update.note.trim() : currentMeta.note,
  }

  await customerModule.updateCustomers(id, {
    metadata: { ...(customer.metadata || {}), ambassador: nextMeta },
  })

  const { ambassador } = await getAmbassadorById(scope, id)
  return ambassador
}

export async function recordPayout(
  scope: MedusaContainer,
  id: string,
  input: { amount: number; period?: string; note?: string; by?: string }
): Promise<AmbassadorSummary> {
  const amount = Number(input.amount)
  if (!amount || amount <= 0 || isNaN(amount)) throw new Error("INVALID_PAYOUT_AMOUNT")

  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const customerModule = scope.resolve(Modules.CUSTOMER) as any

  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["id", "metadata"],
    filters: { id },
  })

  const customer = customers?.[0]
  if (!customer) throw new Error("CUSTOMER_NOT_FOUND")
  const currentMeta = readAmbassadorMetadata(customer)
  if (!currentMeta) throw new Error("NOT_AN_AMBASSADOR")

  const payout: AmbassadorPayout = {
    id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    amount: Math.round(amount * 100) / 100,
    period: input.period ? String(input.period).trim() : undefined,
    created_at: new Date().toISOString(),
    note: input.note ? String(input.note).trim() : undefined,
    by: input.by,
  }

  const payouts = [...(currentMeta.payouts || []), payout]
  const nextMeta: AmbassadorMetadata = { ...currentMeta, payouts }

  await customerModule.updateCustomers(id, {
    metadata: { ...(customer.metadata || {}), ambassador: nextMeta },
  })

  const { ambassador } = await getAmbassadorById(scope, id)
  return ambassador
}

export async function findActiveAmbassadorByCode(scope: MedusaContainer, rawCode: string): Promise<{ customer_id: string; code: string; commission_percent: number } | null> {
  const code = String(rawCode || "").trim().toUpperCase()
  if (!code) return null

  const settings = await getAmbassadorSettings(scope)
  if (!settings.enabled) return null

  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["id", "metadata"],
    pagination: { take: 1000 },
  })

  for (const c of customers || []) {
    const meta = readAmbassadorMetadata(c)
    if (meta && meta.code === code && meta.status === "active") {
      return {
        customer_id: c.id,
        code: meta.code,
        commission_percent: meta.commission_percent,
      }
    }
  }
  return null
}
