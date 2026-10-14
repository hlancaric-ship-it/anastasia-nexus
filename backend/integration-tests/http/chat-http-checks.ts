import { ContainerRegistrationKeys, generateJwtToken, Modules } from "@medusajs/framework/utils"
import { REMOVED_CHAT_BODY } from "../../src/modules/chat/retention"

/**
 * C5 chat přes skutečné HTTP a PostgreSQL: oprávnění psát, limity pod souběhem, odpověď Lucie,
 * uzavření a blokace. Volá jen syntetický runner (JWT jsou lokální fixtures).
 */
export async function verifyChatHttp({ api, container, options, admin, evidence }: any) {
  const customers = await container.resolve(Modules.CUSTOMER).createCustomers([
    { email: "chat-none@example.test", first_name: "Bez", last_name: "Nákupu" },
    { email: "chat-a@example.test", first_name: "Anna", last_name: "Chatová" },
    { email: "chat-b@example.test", first_name: "Bea", last_name: "Chatová" },
  ])
  const as = (customer: any) => ({ ...options, headers: { ...options.headers, Authorization: `Bearer ${generateJwtToken({ actor_id: customer.id, actor_type: "customer", auth_identity_id: `synthetic-${customer.id}` }, { secret: process.env.JWT_SECRET!, expiresIn: "1h" })}` } })
  const [none, a, b] = customers.map(as)
  // Oprávnění psát: aktivní přístup (předplatné/digitální produkt) – jako po zaplacené objednávce.
  await container.resolve("entitlement").createEntitlements(customers.slice(1).map((c: any) => ({
    customer_id: c.id, product_id: "prod_synthetic_chat", status: "active", source: "admin", granted_at: new Date(), dedupe_key: `chat-${c.id}`,
  })))

  // Přihlášení je povinné, admin API nepřijme zákaznici.
  expect((await api.get("/store/chat/status", options)).status).toBe(401)
  expect((await api.post("/store/chat/conversations", { body: "ahoj" }, options)).status).toBe(401)
  expect((await api.get("/admin/chat/conversations", a)).status).toBe(401)

  const noneStatus = await api.get("/store/chat/status", none)
  expect(noneStatus.data).toMatchObject({ eligible: false, can_write: false, reason: "chat_not_eligible" })
  const notEligible = await api.post("/store/chat/conversations", { body: "Dobrý den" }, none)
  expect(notEligible.status).toBe(403)
  expect(notEligible.data.type).toBe("chat_not_eligible")
  evidence.push({ scenario: "C5_NOT_ELIGIBLE", status: notEligible.status })

  expect((await api.get("/store/chat/status", a)).data).toMatchObject({ eligible: true, can_write: true, remaining: { today: 5, in_row: 3, now: 3 } })
  const attachment = await api.post("/store/chat/conversations", { body: "foto", attachments: ["x.jpg"] }, a)
  expect(attachment.status).toBe(400)
  expect((await api.post("/store/chat/conversations", { body: "x".repeat(2001) }, a)).data.type).toBe("message_too_long")
  expect((await api.post("/store/chat/conversations", { body: "k objednávce", order_id: "order_foreign" }, a)).status).toBe(404)
  evidence.push({ scenario: "C5_INPUT_VALIDATION", attachmentStatus: attachment.status })

  // Souběh: 5 nových konverzací naráz → jen 3 projdou (max 3 zprávy po sobě), zbytek 429.
  const race = await Promise.all(Array.from({ length: 5 }, (_, i) => api.post("/store/chat/conversations", { body: `<b>Zpráva ${i}</b> https://example.test`, subject: `Dotaz ${i}` }, a)))
  const statuses = race.map((r: any) => r.status).sort()
  expect(statuses).toEqual([201, 201, 201, 429, 429])
  expect(race.filter((r: any) => r.status === 429).every((r: any) => r.data.type === "chat_consecutive_limit")).toBe(true)
  evidence.push({ scenario: "C5_CONCURRENT_CONSECUTIVE_LIMIT", statuses })
  const created = race.find((r: any) => r.status === 201).data
  // Tělo zůstává čistým textem (HTML se neinterpretuje, vykreslení ho escapuje).
  expect(created.message).toMatchObject({ author: "customer", created_at: expect.any(String), body: expect.stringMatching(/^<b>Zpráva \d<\/b> https:\/\/example\.test$/) })
  const conversationId = created.conversation.id

  // Cizí konverzace = 404.
  expect((await api.get(`/store/chat/conversations/${conversationId}`, b)).status).toBe(404)
  expect((await api.post(`/store/chat/conversations/${conversationId}/messages`, { body: "cizí" }, b)).status).toBe(404)

  // Lucia: nepřečtené nahoře, odpověď vynuluje „po sobě“.
  const list = await api.get("/admin/chat/conversations?status=open", admin)
  expect(list.status).toBe(200)
  expect(list.data.conversations[0]).toMatchObject({ unread: true, customer: expect.objectContaining({ email: "chat-a@example.test" }) })
  const replied = await api.post(`/admin/chat/conversations/${conversationId}/messages`, { body: "Dobrý den, ráda pomůžu." }, admin)
  expect(replied.status).toBe(201)
  expect(replied.data.message).toEqual({ id: expect.any(String), author: "lucia", body: "Dobrý den, ráda pomůžu.", created_at: expect.any(String) })
  expect((await api.post(`/admin/chat/conversations/${conversationId}/read`, {}, admin)).status).toBe(200)

  // Po odpovědi smí psát dál, ale denní strop 5 platí.
  const after = await Promise.all(Array.from({ length: 3 }, () => api.post(`/store/chat/conversations/${conversationId}/messages`, { body: "děkuji" }, a)))
  const afterStatuses = after.map((r: any) => r.status).sort()
  expect(afterStatuses).toEqual([201, 201, 429])
  expect(after.find((r: any) => r.status === 429).data.type).toBe("chat_daily_limit")
  evidence.push({ scenario: "C5_DAILY_LIMIT_AFTER_REPLY", statuses: afterStatuses })
  const thread = await api.get(`/store/chat/conversations/${conversationId}`, a)
  expect(thread.data.messages.map((m: any) => m.author)).toEqual(["customer", "lucia", "customer", "customer"])
  expect(JSON.stringify(thread.data)).not.toContain("author_id")

  // Uzavření (vratné) a blokace zákaznice (vratná).
  const first = await api.post("/store/chat/conversations", { body: "Mám dotaz k rezervaci" }, b)
  expect(first.status).toBe(201)
  const bConv = first.data.conversation.id
  expect((await api.post(`/admin/chat/conversations/${bConv}`, { action: "close" }, admin)).data.conversation.status).toBe("closed")
  const closed = await api.post(`/store/chat/conversations/${bConv}/messages`, { body: "ještě" }, b)
  expect(closed.status).toBe(409)
  expect((await api.post(`/admin/chat/conversations/${bConv}`, { action: "reopen" }, admin)).data.conversation.status).toBe("open")
  expect((await api.post(`/admin/chat/conversations/${bConv}`, { action: "mute" }, admin)).data.conversation.muted).toBe(true)
  const customerB = customers[2].id
  expect((await api.post(`/admin/chat/customers/${customerB}/block`, { blocked: true, reason: "test" }, admin)).status).toBe(200)
  const blocked = await api.post(`/store/chat/conversations/${bConv}/messages`, { body: "ještě" }, b)
  expect(blocked.status).toBe(403)
  expect(blocked.data.type).toBe("chat_blocked")
  expect((await api.get("/store/chat/status", b)).data).toMatchObject({ blocked: true, can_write: false })
  expect((await api.post(`/admin/chat/customers/${customerB}/block`, { blocked: false }, admin)).status).toBe(200)
  expect((await api.post(`/store/chat/conversations/${bConv}/messages`, { body: "díky za odblokování" }, b)).status).toBe(201)
  evidence.push({ scenario: "C5_CLOSE_MUTE_BLOCK", statuses: [closed.status, blocked.status, 201] })

  // Retention acts on closed content only; preserves counters, open/recent conversations and IDs.
  const chat = container.resolve("chat")
  const old = await chat.createChatConversations({ customer_id: customerB, status: "closed", closed_at: new Date("2020-01-01"), subject: "synthetic private subject" })
  const recent = await chat.createChatConversations({ customer_id: customerB, status: "closed", closed_at: new Date(), subject: "recent subject" })
  const archived = await chat.createChatConversations({ customer_id: customerB, status: "closed", closed_at: new Date("2020-01-01"), subject: "archived private subject" })
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await pg.raw("UPDATE chat_conversation SET deleted_at = now() WHERE id = ?", [archived.id])
  await chat.createChatMessages([
    { conversation_id: old.id, customer_id: customerB, author_type: "customer", author_id: customerB, body: "old synthetic personal content" },
    { conversation_id: recent.id, customer_id: customerB, author_type: "customer", author_id: customerB, body: "recent content" },
    { conversation_id: archived.id, customer_id: customerB, author_type: "customer", author_id: customerB, body: "archived private content" },
  ])
  const beforeCounters = (await api.get("/store/chat/status", b)).data.remaining
  const cutoff = new Date(Date.now() - 365 * 86400000)
  const concurrentRetention = await Promise.all([chat.redactExpiredContent(cutoff), chat.redactExpiredContent(cutoff)])
  expect(concurrentRetention.map((r: any) => r.conversations).sort()).toEqual([0, 2])
  expect(concurrentRetention.map((r: any) => r.messages).sort()).toEqual([0, 2])
  const retained = { conversations: 2, messages: 2 }
  expect(await chat.redactExpiredContent(cutoff)).toEqual({ conversations: 0, messages: 0 })
  const retainedThread = (await api.get(`/store/chat/conversations/${old.id}`, b)).data
  expect(retainedThread.conversation.subject).toBeNull()
  expect(retainedThread.messages[0].body).toBe(REMOVED_CHAT_BODY)
  const { rows: archivedMessages } = await pg.raw("SELECT body FROM chat_message WHERE conversation_id = ?", [archived.id])
  expect(archivedMessages[0].body).toBe(REMOVED_CHAT_BODY)
  expect((await api.get(`/store/chat/conversations/${archived.id}`, b)).status).toBe(404)
  expect((await api.get(`/store/chat/conversations/${recent.id}`, b)).data.messages[0].body).toBe("recent content")
  expect((await api.get(`/store/chat/conversations/${bConv}`, b)).data.messages[0].body).not.toBe(REMOVED_CHAT_BODY)
  expect((await api.get("/store/chat/status", b)).data.remaining).toEqual(beforeCounters)
  evidence.push({ scenario: "C5_CLOSED_CONTENT_RETENTION", redacted: retained, replayNoOp: true, countersPreserved: true })
}
