jest.mock("@medusajs/framework/utils", () => ({
  ...jest.requireActual("@medusajs/framework/utils"),
  InjectTransactionManager: () => () => {},
  MedusaContext: () => () => {},
}))

import NewsletterModuleService from "../service"
import { assertCampaignTransition, NewsletterError } from "../policy"

function serviceFixture(options: { consents?: any[]; campaign?: any; deliveries?: any[] } = {}) {
  const state = {
    campaign: options.campaign === null ? null : { id: "nlc_1", status: "draft", ...options.campaign },
    consents: options.consents ?? [
      { id: "lgl_1", email: "jana@example.test", status: "subscribed" },
      { id: "lgl_2", email: "eva@example.test", status: "subscribed" },
    ],
    deliveries: [...(options.deliveries ?? [])],
  }
  const db: any = (table: string) => {
    const q: any = {
      _where: null as any,
      where(arg: any) { q._where = { ...(q._where ?? {}), ...arg }; return q },
      whereNull() { return q },
      forUpdate() { return q },
      select() { return q },
      orderBy() {
        if (table !== "newsletter_consent") return Promise.resolve(state.deliveries)
        const where = q._where ?? {}
        return Promise.resolve(state.consents.filter(consent => Object.entries(where).every(([key, value]) => consent[key] === value)))
      },
      first: async () => table === "newsletter_campaign" ? state.campaign : null,
      insert(data: any) {
        const rows = Array.isArray(data) ? data : [data]
        if (table === "newsletter_delivery") state.deliveries.push(...rows)
        return { onConflict: () => ({ ignore: async () => {} }) }
      },
      update(data: any) {
        if (table === "newsletter_campaign") Object.assign(state.campaign, data)
        if (table === "newsletter_delivery") {
          const where = q._where ?? {}
          state.deliveries
            .filter(row => (where.campaign_id == null || row.campaign_id === where.campaign_id) && (where.status == null || row.status === where.status))
            .forEach(row => Object.assign(row, data))
        }
        return q
      },
      returning: async () => [{ ...state.campaign }],
      count() { return q },
      groupBy: async () => {
        const rows: Array<{ status: string; count: string }> = []
        for (const delivery of state.deliveries) {
          const found = rows.find(row => row.status === delivery.status)
          if (found) found.count = String(Number(found.count) + 1)
          else rows.push({ status: delivery.status, count: "1" })
        }
        return rows
      },
    }
    return q
  }
  const service = Object.create(NewsletterModuleService.prototype) as any
  service.db = () => db
  service.lock = async () => {}
  return { state, service }
}

describe("prechody stavov kampane", () => {
  it("povolí len platné prechody", () => {
    expect(assertCampaignTransition("draft", "queued")).toBe("queued")
    expect(assertCampaignTransition("queued", "sending")).toBe("sending")
    expect(assertCampaignTransition("queued", "cancelled")).toBe("cancelled")
    expect(assertCampaignTransition("sending", "sent")).toBe("sent")
    expect(assertCampaignTransition("sending", "cancelled")).toBe("cancelled")
    for (const [from, to] of [["draft", "sent"], ["draft", "sending"], ["sent", "queued"], ["cancelled", "queued"], ["sent", "cancelled"]]) {
      expect(() => assertCampaignTransition(from, to as any)).toThrow("CAMPAIGN_STATE_CONFLICT")
    }
  })

  it("zafrontovanie spraví snapshot len prihlásených súhlasov a nastaví počty", async () => {
    const { state, service } = serviceFixture({
      consents: [
        { id: "lgl_1", email: "jana@example.test", status: "subscribed" },
        { id: "lgl_2", email: "eva@example.test", status: "unsubscribed" },
      ],
    })
    const campaign = await service.queueCampaign("nlc_1")
    expect(campaign.status).toBe("queued")
    expect(campaign.recipients_count).toBe(1)
    expect(state.deliveries).toHaveLength(1)
    expect(state.deliveries[0]).toMatchObject({ consent_id: "lgl_1", email: "jana@example.test", status: "pending" })
  })

  it("kampaň bez prihlásených odmietne zafrontovať", async () => {
    const { service } = serviceFixture({ consents: [] })
    await expect(service.queueCampaign("nlc_1")).rejects.toThrow("CAMPAIGN_NO_RECIPIENTS")
  })

  it("opakované zafrontovanie už zafrontovanej kampane nič nezduplikuje", async () => {
    const { state, service } = serviceFixture({ campaign: { status: "queued" }, deliveries: [{ id: "nld_1", campaign_id: "nlc_1", status: "pending" }] })
    const campaign = await service.queueCampaign("nlc_1")
    expect(campaign.status).toBe("queued")
    expect(state.deliveries).toHaveLength(1)
  })

  it("zrušenie označí zvyšné pending ako skipped a kampaň ako cancelled", async () => {
    const { state, service } = serviceFixture({
      campaign: { status: "queued" },
      deliveries: [
        { id: "nld_1", campaign_id: "nlc_1", status: "pending" },
        { id: "nld_2", campaign_id: "nlc_1", status: "sent" },
      ],
    })
    const campaign = await service.cancelCampaign("nlc_1")
    expect(campaign.status).toBe("cancelled")
    expect(state.deliveries[0]).toMatchObject({ status: "skipped", error: "campaign_cancelled" })
    expect(state.deliveries[1].status).toBe("sent")
    expect(campaign.sent_count).toBe(1)
  })

  it("koncept sa nedá zrušiť ani upraviť mimo stavu draft", async () => {
    const { service } = serviceFixture({ campaign: { status: "draft" } })
    await expect(service.cancelCampaign("nlc_1")).rejects.toThrow("CAMPAIGN_STATE_CONFLICT")
    const queued = serviceFixture({ campaign: { status: "queued" } }).service
    await expect(queued.updateCampaignDraft("nlc_1", { subject: "Téma", body_html: "<p>x</p>" })).rejects.toThrow("CAMPAIGN_NOT_EDITABLE")
  })

  it("neexistujúca kampaň vráti 404", async () => {
    const { service } = serviceFixture({ campaign: null })
    const error = await service.getCampaignOrThrow("nlc_x").catch((e: unknown) => e)
    expect(error).toBeInstanceOf(NewsletterError)
    expect((error as NewsletterError).status).toBe(404)
  })
})
