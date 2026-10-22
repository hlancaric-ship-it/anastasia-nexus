import { sendPendingNewsletterDeliveries, safeDeliveryError, type NewsletterSendStore, type PendingDelivery } from "../sender"

const SECRET = "testovaci-secret-pre-newsletter-32-znakov"
const BASE = "https://api.example.test"

const row = (patch: Partial<PendingDelivery> = {}): PendingDelivery => ({
  id: "nld_1", campaign_id: "nlc_1", consent_id: "lgl_1", email: "jana@example.test",
  campaign_status: "queued", subject: "Novinky", preheader: "Úvod", body_html: "<p>Text</p>",
  ...patch,
})

function store(rows: PendingDelivery[], options: {
  sentLast24h?: number
  consents?: Record<string, string | null>
  campaignStatus?: string | null
  finalized?: "sent" | "updated" | "missing"
} = {}) {
  const marks: Array<{ id: string; patch: any }> = []
  const pendingLimits: number[] = []
  const api: NewsletterSendStore = {
    sentSince: jest.fn(async () => options.sentLast24h ?? 0),
    pending: jest.fn(async (limit: number) => { pendingLimits.push(limit); return rows.slice(0, limit) }),
    markCampaignsSending: jest.fn(async () => {}),
    consentStatus: jest.fn(async (id: string) => options.consents?.[id] ?? "subscribed"),
    campaignStatus: jest.fn(async () => options.campaignStatus ?? "queued"),
    markDelivery: jest.fn(async (id: string, patch: any) => { marks.push({ id, patch }) }),
    finalizeCampaign: jest.fn(async () => options.finalized ?? "sent"),
  }
  return { api, marks, pendingLimits }
}

const notification = (impl?: (data: any) => Promise<unknown>) => ({ createNotifications: jest.fn(impl ?? (async () => ({ id: "noti_1" }))) })

describe("odosielanie kampane", () => {
  it("pošle len prihláseným a povoleným, ostatné označí ako skipped", async () => {
    const s = store([row({ email: "jana@l-code-dynamics.com" }), row({ id: "nld_2", consent_id: "lgl_2" }), row({ id: "nld_3", consent_id: "lgl_3", email: "zakaznik@gmail.com" })], {
      consents: { lgl_1: "subscribed", lgl_2: "unsubscribed", lgl_3: "subscribed" },
    })
    const mail = notification()
    const summary = await sendPendingNewsletterDeliveries({
      store: s.api, notification: mail, secret: SECRET, baseUrl: BASE,
      allowlist: ["@l-code-dynamics.com"], batch: 40, dailyLimit: 90,
    })

    expect(summary).toMatchObject({ attempted: 3, sent: 1, skipped: 1, suppressed: 1, failed: 0, dailyLimitReached: false })
    expect(summary.campaignsSent).toEqual(["nlc_1"])
    expect(mail.createNotifications).toHaveBeenCalledTimes(1)
    const payload = mail.createNotifications.mock.calls[0][0] as any
    expect(payload).toMatchObject({
      to: "jana@l-code-dynamics.com", channel: "email", idempotency_key: "newsletter-delivery-nld_1",
      resource_type: "newsletter-campaign",
    })
    expect(payload.content.subject).toBe("Novinky")
    expect(payload.content.html).toContain("https://api.example.test/store/newsletter/unsubscribe/link?c=lgl_1")
    expect(payload.provider_data.headers).toEqual([
      { name: "List-Unsubscribe", value: expect.stringContaining("c=lgl_1") },
      { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
    ])
    expect(s.marks.find(m => m.id === "nld_2")?.patch).toMatchObject({ status: "skipped", error: "consent_not_subscribed" })
    expect(s.marks.find(m => m.id === "nld_3")?.patch).toMatchObject({ status: "skipped", error: "recipient_not_allowlisted" })
  })

  it("denný limit 90: pri 89 odoslaných za 24 h pošle v behu už len jeden", async () => {
    const s = store([row(), row({ id: "nld_2" })], { sentLast24h: 89 })
    const mail = notification()
    const summary = await sendPendingNewsletterDeliveries({
      store: s.api, notification: mail, secret: SECRET, baseUrl: BASE, batch: 40, dailyLimit: 90,
    })
    expect(s.pendingLimits).toEqual([1])
    expect(summary.sent).toBe(1)
    expect(summary.dailyLimitReached).toBe(true)
    expect(mail.createNotifications).toHaveBeenCalledTimes(1)
  })

  it("vyčerpaný denný limit nepošle nič", async () => {
    const s = store([row()], { sentLast24h: 90 })
    const mail = notification()
    const summary = await sendPendingNewsletterDeliveries({
      store: s.api, notification: mail, secret: SECRET, baseUrl: BASE, batch: 40, dailyLimit: 90,
    })
    expect(summary).toMatchObject({ attempted: 0, sent: 0, dailyLimitReached: true, budget: 0 })
    expect(s.pendingLimits).toEqual([])
    expect(mail.createNotifications).not.toHaveBeenCalled()
  })

  it("zlyhané odoslanie zapíše failed a chybu bez adresy", async () => {
    const s = store([row()])
    const mail = notification(async () => { throw new Error("Resend: neplatná adresa jana@example.test") })
    const summary = await sendPendingNewsletterDeliveries({
      store: s.api, notification: mail, secret: SECRET, baseUrl: BASE, batch: 40, dailyLimit: 90,
    })
    expect(summary.failed).toBe(1)
    const mark = s.marks.find(m => m.id === "nld_1")?.patch
    expect(mark).toMatchObject({ status: "failed" })
    expect(mark.error).not.toContain("jana@example.test")
    expect(mark.error).toContain("[adresa]")
  })

  it("doručenie zrušenej kampane preskočí", async () => {
    const s = store([row({ campaign_status: "cancelled" })])
    const mail = notification()
    const summary = await sendPendingNewsletterDeliveries({
      store: s.api, notification: mail, secret: SECRET, baseUrl: BASE, batch: 40, dailyLimit: 90,
    })
    expect(summary.skipped).toBe(1)
    expect(mail.createNotifications).not.toHaveBeenCalled()
    expect(s.marks[0].patch).toMatchObject({ status: "skipped", error: "campaign_cancelled" })
  })

  it("zrušenie počas behu zastaví zvyšné e-maily", async () => {
    const s = store([row({ campaign_status: "sending" })], { campaignStatus: "cancelled" })
    const mail = notification()
    const summary = await sendPendingNewsletterDeliveries({
      store: s.api, notification: mail, secret: SECRET, baseUrl: BASE, batch: 40, dailyLimit: 90,
    })
    expect(summary).toMatchObject({ attempted: 1, sent: 0, skipped: 1 })
    expect(mail.createNotifications).not.toHaveBeenCalled()
    expect(s.marks[0].patch).toMatchObject({ status: "skipped", error: "campaign_cancelled" })
  })

  it("safeDeliveryError oreže riadky a dĺžku", () => {
    expect(safeDeliveryError(new Error("riadok 1\nriadok 2"))).toBe("riadok 1 riadok 2")
    expect(safeDeliveryError(new Error("x".repeat(400))).length).toBe(200)
    expect(safeDeliveryError(null)).toBe("send_failed")
  })
})
