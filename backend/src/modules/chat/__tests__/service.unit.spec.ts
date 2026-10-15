/** @jest-environment node */
import ChatModuleService, { ConversationNotFoundError } from "../service"
import { ChatPolicyError, localDayStart } from "../policy"

type Msg = { id: string; conversation_id: string; customer_id: string; author_type: "customer" | "admin"; created_at: Date }

const tick = () => new Promise((resolve) => setImmediate(resolve))

/**
 * Služba nad in-memory úložištěm. Zámek zákaznice je skutečný mutex držený do konce „transakce“
 * (jako pg_advisory_xact_lock), mezi čtením počtů a zápisem jsou záměrně await mezery.
 */
function makeService(opts: { withLock?: boolean } = {}) {
  const withLock = opts.withLock ?? true
  const store = { conversations: new Map<string, any>(), messages: [] as Msg[], blocked: new Set<string>(), seq: 0 }
  const queues = new Map<string, Promise<void>>()
  const svc = Object.create(ChatModuleService.prototype) as any

  svc.baseRepository_ = {
    transaction: async (cb: any) => {
      const tx = { releases: [] as Array<() => void> }
      try { return await cb(tx) } finally { tx.releases.forEach((release) => release()) }
    },
  }
  svc.transactionKnex = (context: any) => context.transactionManager
  svc.lockCustomer = async (tx: any, customerId: string) => {
    if (!withLock) return
    const previous = queues.get(customerId) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolve) => { release = resolve })
    queues.set(customerId, previous.then(() => current))
    await previous
    tx.releases.push(release)
  }
  svc.conversationForUpdate = async (_tx: any, id: string) => { await tick(); return store.conversations.get(id) ?? null }
  svc.conversationCustomerId = async (_tx: any, id: string) => { await tick(); return store.conversations.get(id)?.customer_id ?? null }
  svc.isBlockedTx = async (_tx: any, customerId: string) => { await tick(); return store.blocked.has(customerId) }
  svc.countersTx = async (_tx: any, customerId: string, now: Date) => {
    await tick()
    const mine = store.messages.filter((m) => m.customer_id === customerId)
    const lastAdmin = Math.max(0, ...mine.filter((m) => m.author_type === "admin").map((m) => m.created_at.getTime()))
    const customer = mine.filter((m) => m.author_type === "customer")
    return {
      sentToday: customer.filter((m) => m.created_at >= localDayStart(now)).length,
      consecutive: customer.filter((m) => m.created_at.getTime() > lastAdmin).length,
    }
  }
  svc.createChatConversations = async (data: any) => {
    await tick()
    const row = { id: `conv_${++store.seq}`, created_at: new Date(), ...data }
    store.conversations.set(row.id, row)
    return row
  }
  svc.updateChatConversations = async (data: any) => {
    await tick()
    const row = { ...store.conversations.get(data.id), ...data }
    store.conversations.set(row.id, row)
    return row
  }
  svc.createChatMessages = async (data: any) => {
    await tick()
    const row = { id: `msg_${++store.seq}`, created_at: new Date(Date.now() + store.seq), ...data }
    store.messages.push(row)
    return row
  }
  return { svc: svc as ChatModuleService, store }
}

async function settle(promises: Promise<unknown>[]) {
  const results = await Promise.allSettled(promises)
  return {
    ok: results.filter((r) => r.status === "fulfilled").length,
    errors: results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => (r.reason as ChatPolicyError).type),
  }
}

describe("ChatModuleService – souběh a limity", () => {
  it("po první zprávě 6 souběžných: projdou jen 2 (celkem 3 po sobě), zbytek 429 chat_consecutive_limit", async () => {
    const { svc, store } = makeService()
    const { conversation } = await svc.sendCustomerMessage({ customer_id: "cus_1", body: "první" })
    const result = await settle(Array.from({ length: 6 }, (_, i) =>
      svc.sendCustomerMessage({ customer_id: "cus_1", conversation_id: conversation.id, body: `zpráva ${i}` })))
    expect(result.ok).toBe(2)
    expect(result.errors).toEqual(Array(4).fill("chat_consecutive_limit"))
    expect(store.messages.filter((m) => m.author_type === "customer")).toHaveLength(3)
  })

  it("souběh napříč novými konverzacemi limit také neobejde", async () => {
    const { svc, store } = makeService()
    const result = await settle(Array.from({ length: 6 }, (_, i) => svc.sendCustomerMessage({ customer_id: "cus_1", body: `nová ${i}` })))
    expect(result.ok).toBe(3)
    expect(store.messages).toHaveLength(3)
  })

  it("kontrola: bez zámku by souběh limit prolomil (test je citlivý na chybějící zámek)", async () => {
    const { svc, store } = makeService({ withLock: false })
    const result = await settle(Array.from({ length: 6 }, (_, i) => svc.sendCustomerMessage({ customer_id: "cus_1", body: `nová ${i}` })))
    expect(result.ok).toBeGreaterThan(3)
    expect(store.messages.length).toBeGreaterThan(3)
  })

  it("zámek je per zákaznice: jiná zákaznice není blokována", async () => {
    const { svc } = makeService()
    const result = await settle([
      ...Array.from({ length: 4 }, () => svc.sendCustomerMessage({ customer_id: "cus_1", body: "a" })),
      ...Array.from({ length: 4 }, () => svc.sendCustomerMessage({ customer_id: "cus_2", body: "b" })),
    ])
    expect(result.ok).toBe(6)
  })

  it("Luciina odpověď vynuluje „po sobě“, denní strop 5 platí dál (i souběžně)", async () => {
    const { svc } = makeService()
    const { conversation } = await svc.sendCustomerMessage({ customer_id: "cus_1", body: "1" })
    await svc.sendCustomerMessage({ customer_id: "cus_1", conversation_id: conversation.id, body: "2" })
    await svc.sendCustomerMessage({ customer_id: "cus_1", conversation_id: conversation.id, body: "3" })
    await svc.sendAdminReply({ conversation_id: conversation.id, admin_id: "user_1", body: "Dobrý den" })
    const result = await settle(Array.from({ length: 4 }, () => svc.sendCustomerMessage({ customer_id: "cus_1", conversation_id: conversation.id, body: "další" })))
    expect(result.ok).toBe(2)
    expect(result.errors).toEqual(["chat_daily_limit", "chat_daily_limit"])
  })

  it("blokace, uzavřená a cizí konverzace", async () => {
    const { svc, store } = makeService()
    const { conversation } = await svc.sendCustomerMessage({ customer_id: "cus_1", body: "ahoj" })
    await expect(svc.sendCustomerMessage({ customer_id: "cus_2", conversation_id: conversation.id, body: "cizí" })).rejects.toBeInstanceOf(ConversationNotFoundError)
    await svc.applyConversationAction(conversation.id, "close")
    await expect(svc.sendCustomerMessage({ customer_id: "cus_1", conversation_id: conversation.id, body: "x" })).rejects.toMatchObject({ type: "conversation_closed", status: 409 })
    await svc.applyConversationAction(conversation.id, "reopen")
    store.blocked.add("cus_1")
    await expect(svc.sendCustomerMessage({ customer_id: "cus_1", conversation_id: conversation.id, body: "x" })).rejects.toMatchObject({ type: "chat_blocked", status: 403 })
    await expect(svc.sendCustomerMessage({ customer_id: "cus_1", body: "nová" })).rejects.toMatchObject({ type: "chat_blocked" })
    store.blocked.delete("cus_1")
    await expect(svc.sendCustomerMessage({ customer_id: "cus_1", conversation_id: conversation.id, body: "zase můžu" })).resolves.toBeTruthy()
  })

  it("neplatné tělo se odmítne před zámkem a zápisem", async () => {
    const { svc, store } = makeService()
    await expect(svc.sendCustomerMessage({ customer_id: "cus_1", body: { html: "<img>" } })).rejects.toMatchObject({ type: "invalid_message" })
    await expect(svc.sendCustomerMessage({ customer_id: "cus_1", body: "x".repeat(2001) })).rejects.toMatchObject({ type: "message_too_long" })
    expect(store.messages).toHaveLength(0)
  })

  it("ztlumení a uzavření jsou vratné", async () => {
    const { svc } = makeService()
    const { conversation } = await svc.sendCustomerMessage({ customer_id: "cus_1", body: "ahoj" })
    expect((await svc.applyConversationAction(conversation.id, "mute")).muted).toBe(true)
    expect((await svc.applyConversationAction(conversation.id, "unmute")).muted).toBe(false)
    expect((await svc.applyConversationAction(conversation.id, "close")).status).toBe("closed")
    expect((await svc.applyConversationAction(conversation.id, "reopen"))).toMatchObject({ status: "open", closed_at: null })
    await expect(svc.applyConversationAction("conv_missing", "close")).rejects.toBeInstanceOf(ConversationNotFoundError)
  })
})
