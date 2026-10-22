jest.mock("@medusajs/framework/utils", () => ({
  ...jest.requireActual("@medusajs/framework/utils"),
  InjectTransactionManager: () => () => {},
  MedusaContext: () => () => {},
}))

import LegalModuleService from "../service"

function fixture(row: any) {
  const state = { row, events: [] as any[], updates: [] as any[] }
  const db: any = (table: string) => ({
    where() { return this },
    whereNull() { return this },
    forUpdate() { return this },
    first: async () => table === "newsletter_consent" ? state.row : null,
    update: async (data: any) => { state.updates.push(data); Object.assign(state.row, data) },
    insert: async (data: any) => { if (table === "newsletter_consent_event") state.events.push(data) },
  })
  const service = Object.create(LegalModuleService.prototype) as any
  service.db = () => db
  return { state, service }
}

describe("odhlásenie podpísaným odkazom", () => {
  it("označí súhlas ako unsubscribed a zapíše event", async () => {
    const { state, service } = fixture({ id: "lgl_1", status: "subscribed", source: "footer", text_version: "v1" })
    await expect(service.unsubscribeConsent("lgl_1")).resolves.toEqual({ unsubscribed: true })
    expect(state.row.status).toBe("unsubscribed")
    expect(state.row.unsubscribed_at).toBeInstanceOf(Date)
    expect(state.events).toHaveLength(1)
    expect(state.events[0]).toMatchObject({ consent_id: "lgl_1", status: "unsubscribed", source: "footer", text_version: "v1" })
  })

  it("opakované odhlásenie nezapíše druhý event", async () => {
    const { state, service } = fixture({ id: "lgl_1", status: "unsubscribed", source: "footer", text_version: "v1" })
    await service.unsubscribeConsent("lgl_1")
    expect(state.events).toHaveLength(0)
    expect(state.updates).toHaveLength(0)
  })

  it("neznáme alebo podvrhnuté ID odmietne", async () => {
    const { service } = fixture(null)
    await expect(service.unsubscribeConsent("lgl_1")).rejects.toThrow("INVALID_UNSUBSCRIBE_LINK")
    await expect(service.unsubscribeConsent("nespravne id!")).rejects.toThrow("INVALID_UNSUBSCRIBE_LINK")
  })
})
