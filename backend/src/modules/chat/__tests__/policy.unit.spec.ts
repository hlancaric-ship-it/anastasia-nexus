/** @jest-environment node */
import {
  ChatPolicyError, DAILY_CUSTOMER_MESSAGE_LIMIT, MAX_CONSECUTIVE_CUSTOMER_MESSAGES, MAX_CUSTOMER_MESSAGE_LENGTH,
  evaluateCustomerSend, isChatEligible, isDigestDue, isUnreadByAdmin, isUnreadByCustomer, localDayStart, nextLocalDayStart,
  normalizeMessageBody, normalizeSubject, remainingAllowance, shouldNotifyCustomer, sortForAdmin,
} from "../policy"

describe("chat policy – normalizace zprávy", () => {
  it("odmítne ne-text, prázdnou a příliš dlouhou zprávu", () => {
    for (const raw of [undefined, null, 5, { html: "<b>x</b>" }, ["a"]]) {
      const r = normalizeMessageBody(raw)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.type).toBe("invalid_message")
    }
    const empty = normalizeMessageBody(" \n\t ‎ ")
    expect(!empty.ok && empty.error.type).toBe("message_empty")
    const long = normalizeMessageBody("a".repeat(MAX_CUSTOMER_MESSAGE_LENGTH + 1))
    expect(!long.ok && long.error.type).toBe("message_too_long")
    expect(!long.ok && long.error.status).toBe(400)
  })

  it("délku počítá ve znacích (emoji = 1), přesně na limitu projde", () => {
    expect(normalizeMessageBody("😀".repeat(MAX_CUSTOMER_MESSAGE_LENGTH)).ok).toBe(true)
    expect(normalizeMessageBody("a".repeat(MAX_CUSTOMER_MESSAGE_LENGTH)).ok).toBe(true)
  })

  it("HTML a odkazy nechává jako text (escapuje až vykreslení), odstraní řídicí a bidi znaky", () => {
    const r = normalizeMessageBody("  <script>alert(1)</script> https://evil.test‮\u0007\r\n\r\n\r\n\r\nahoj  ")
    expect(r).toEqual({ ok: true, value: "<script>alert(1)</script> https://evil.test\n\nahoj" })
  })

  it("předmět: jeden řádek, prázdný = null, max 120 znaků", () => {
    expect(normalizeSubject(undefined)).toEqual({ ok: true, value: null })
    expect(normalizeSubject("  Dotaz\n k  objednávce ")).toEqual({ ok: true, value: "Dotaz k objednávce" })
    expect(normalizeSubject("   ")).toEqual({ ok: true, value: null })
    expect(normalizeSubject("x".repeat(121)).ok).toBe(false)
    expect(normalizeSubject(42).ok).toBe(false)
  })
})

describe("chat policy – oprávnění a limity", () => {
  it("psát smí jen zákazníci s objednávkou, rezervací nebo předplatným", () => {
    expect(isChatEligible({ hasOrder: false, hasBooking: false, hasEntitlement: false })).toBe(false)
    expect(isChatEligible({ hasOrder: true, hasBooking: false, hasEntitlement: false })).toBe(true)
    expect(isChatEligible({ hasOrder: false, hasBooking: true, hasEntitlement: false })).toBe(true)
    expect(isChatEligible({ hasOrder: false, hasBooking: false, hasEntitlement: true })).toBe(true)
  })

  it("pořadí: blokace → uzavřená konverzace → zprávy po sobě → denní strop", () => {
    const ok = { blocked: false, conversation: { status: "open" }, sentToday: 0, consecutive: 0 }
    expect(evaluateCustomerSend(ok)).toBeNull()
    expect(evaluateCustomerSend({ ...ok, blocked: true, sentToday: 99, consecutive: 99 })?.type).toBe("chat_blocked")
    expect(evaluateCustomerSend({ ...ok, conversation: { status: "closed" }, consecutive: 99 })?.type).toBe("conversation_closed")
    expect(evaluateCustomerSend({ ...ok, consecutive: MAX_CONSECUTIVE_CUSTOMER_MESSAGES, sentToday: 99 })?.type).toBe("chat_consecutive_limit")
    expect(evaluateCustomerSend({ ...ok, consecutive: MAX_CONSECUTIVE_CUSTOMER_MESSAGES - 1 })).toBeNull()
    expect(evaluateCustomerSend({ ...ok, sentToday: DAILY_CUSTOMER_MESSAGE_LIMIT })?.type).toBe("chat_daily_limit")
    expect(evaluateCustomerSend({ ...ok, sentToday: DAILY_CUSTOMER_MESSAGE_LIMIT - 1 })).toBeNull()
    expect(evaluateCustomerSend({ ...ok, conversation: null })).toBeNull()
  })

  it("HTTP stavy chyb jsou stabilní", () => {
    expect(new ChatPolicyError("chat_not_eligible").status).toBe(403)
    expect(new ChatPolicyError("chat_blocked").status).toBe(403)
    expect(new ChatPolicyError("conversation_closed").status).toBe(409)
    expect(new ChatPolicyError("chat_consecutive_limit").status).toBe(429)
    expect(new ChatPolicyError("chat_daily_limit").status).toBe(429)
  })

  it("zbývající zprávy = menší z denního a „po sobě“ limitu", () => {
    expect(remainingAllowance({ sentToday: 0, consecutive: 0 })).toEqual({ today: 5, in_row: 3, now: 3 })
    expect(remainingAllowance({ sentToday: 4, consecutive: 1 })).toEqual({ today: 1, in_row: 2, now: 1 })
    expect(remainingAllowance({ sentToday: 9, consecutive: 9 })).toEqual({ today: 0, in_row: 0, now: 0 })
  })

  it("denní limit začíná o lokální půlnoci v Bratislavě (letní i zimní čas)", () => {
    expect(localDayStart(new Date("2026-07-15T21:59:00Z")).toISOString()).toBe("2026-07-14T22:00:00.000Z")
    expect(localDayStart(new Date("2026-07-15T22:00:00Z")).toISOString()).toBe("2026-07-15T22:00:00.000Z")
    expect(localDayStart(new Date("2026-12-15T10:00:00Z")).toISOString()).toBe("2026-12-14T23:00:00.000Z")
    expect(nextLocalDayStart(new Date("2026-10-24T12:00:00Z")).toISOString()).toBe("2026-10-24T22:00:00.000Z")
    // Přechod na zimní čas 25. 10. 2026: další půlnoc je už v UTC+1.
    expect(nextLocalDayStart(new Date("2026-10-25T12:00:00Z")).toISOString()).toBe("2026-10-25T23:00:00.000Z")
  })
})

describe("chat policy – upozornění a řazení", () => {
  const now = new Date("2026-10-14T12:00:00Z")
  it("souhrn Lucii nejvýš 1×/h", () => {
    expect(isDigestDue(null, now)).toBe(true)
    expect(isDigestDue(new Date(now.getTime() - 59 * 60000), now)).toBe(false)
    expect(isDigestDue(new Date(now.getTime() - 60 * 60000), now)).toBe(true)
  })

  it("e-mail zákazníkovi znovu až po přečtení předchozího upozornění", () => {
    expect(shouldNotifyCustomer({})).toBe(true)
    expect(shouldNotifyCustomer({ customer_notified_at: now })).toBe(false)
    expect(shouldNotifyCustomer({ customer_notified_at: now, customer_last_read_at: new Date(now.getTime() - 1) })).toBe(false)
    expect(shouldNotifyCustomer({ customer_notified_at: now, customer_last_read_at: now })).toBe(true)
  })

  it("nepřečtené pro Luciu i zákazníka", () => {
    expect(isUnreadByAdmin({ last_customer_message_at: now })).toBe(true)
    expect(isUnreadByAdmin({ last_customer_message_at: now, admin_last_read_at: now })).toBe(false)
    expect(isUnreadByAdmin({})).toBe(false)
    expect(isUnreadByCustomer({ last_admin_message_at: now, customer_last_read_at: new Date(0) })).toBe(true)
  })

  it("nepřečtené a neztlumené nahoře, pak od nejnovější", () => {
    const t = (m: number) => new Date(now.getTime() + m * 60000)
    const rows = [
      { id: "read-new", last_message_at: t(10), last_customer_message_at: t(5), admin_last_read_at: t(6) },
      { id: "unread-old", last_message_at: t(1), last_customer_message_at: t(1) },
      { id: "muted-unread", muted: true, last_message_at: t(20), last_customer_message_at: t(20) },
      { id: "unread-new", last_message_at: t(3), last_customer_message_at: t(3) },
    ]
    expect(sortForAdmin(rows).map((r) => r.id)).toEqual(["unread-new", "unread-old", "muted-unread", "read-new"])
  })
})
