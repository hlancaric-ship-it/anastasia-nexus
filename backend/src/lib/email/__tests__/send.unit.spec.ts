import { EmailOutcomeUnknownError, loadTemplateSettings, sendEmail } from "../send"

const TO = "synthetic.customer@example.test"

function makeContainer(opts: { override?: any; overrideError?: Error; noModule?: boolean; existing?: any[] } = {}) {
  const templates = {
    listEmailTemplateOverrides: jest.fn(async () => {
      if (opts.overrideError) throw opts.overrideError
      return opts.override ? [opts.override] : []
    }),
  }
  const rows = [...(opts.existing ?? [])]
  const notifications = {
    listNotifications: jest.fn(async (filter: any) => rows.filter(row => filter.id ? row.id === filter.id : row.idempotency_key === filter.idempotency_key)),
    createNotifications: jest.fn(async (input: any) => { const row = { ...input, id: "noti_1", status: "success" }; rows.push(row); return row }),
  }
  const logs: string[] = []
  const logger = { info: (m: string) => logs.push(m), warn: (m: string) => logs.push(m), error: (m: string) => logs.push(m) }
  const ops = { createOpsEvents: jest.fn(async (e: any) => ({ id: "ev", ...e })) }
  const map: Record<string, unknown> = { notification: notifications, logger, ops_audit: ops }
  if (!opts.noModule) map.email_template = templates
  const container: any = {
    resolve: (key: string) => {
      if (key in map) return map[key]
      throw new Error(`Could not resolve '${key}'`)
    },
  }
  return { container, templates, notifications, logs }
}

describe("sendEmail", () => {
  it("pridá uložené prepisy do data.texts a odošle s idempotency_key", async () => {
    const { container, notifications } = makeContainer({ override: { template: "order-placed-sk", texts: { heading: "Vďaka!", neplatny: "x" }, enabled: true } })
    const out = await sendEmail(container, { to: TO, template: "order-placed-sk", data: { order_display_id: "1" }, idempotency_key: "order.placed:o1", resource_id: "o1", resource_type: "order" })
    expect(out).toEqual({ status: "sent" })
    expect(notifications.createNotifications).toHaveBeenCalledWith({
      to: TO, channel: "email", template: "order-placed-sk",
      data: { order_display_id: "1", texts: { heading: "Vďaka!" } },
      idempotency_key: "order.placed:o1", resource_id: "o1", resource_type: "order",
    })
  })

  it("texty od volajúceho sa nikdy nepoužijú – len uložené v admine", async () => {
    const { container, notifications } = makeContainer()
    await sendEmail(container, { to: TO, template: "order-placed-sk", data: { texts: { heading: "podvrh" } } })
    expect((notifications.createNotifications.mock.calls[0] as any[])[0].data).toEqual({})
  })

  it("vypnutú šablónu nepošle, povinnú áno", async () => {
    const off = makeContainer({ override: { template: "order-placed-sk", texts: null, enabled: false } })
    expect(await sendEmail(off.container, { to: TO, template: "order-placed-sk" })).toEqual({ status: "disabled" })
    expect(off.notifications.createNotifications).not.toHaveBeenCalled()
    const required = makeContainer({ override: { template: "magic-link-sk", texts: null, enabled: false } })
    expect(await sendEmail(required.container, { to: TO, template: "magic-link-sk", data: { url: "https://x.test" } })).toEqual({ status: "sent" })
  })

  it("duplicitu podľa idempotency_key nepošle druhýkrát", async () => {
    const { container, notifications } = makeContainer({ existing: [{ id: "noti_0", status: "success", channel: "email", to: TO, template: "order-placed-sk", idempotency_key: "k" }] })
    expect(await sendEmail(container, { to: TO, template: "order-placed-sk", idempotency_key: "k" })).toEqual({ status: "duplicate" })
    expect(notifications.createNotifications).not.toHaveBeenCalled()
  })

  it("bez modulu alebo pri chybe načítania pošle s predvolenými textami", async () => {
    const missing = makeContainer({ noModule: true })
    expect(await sendEmail(missing.container, { to: TO, template: "chat-admin-digest" })).toEqual({ status: "sent" })
    const failing = makeContainer({ overrideError: new Error("db down") })
    expect(await loadTemplateSettings(failing.container, "chat-admin-digest")).toEqual({ texts: {}, enabled: true })
    expect(failing.logs.join("\n")).toContain("template_settings_failed")
  })

  it("chybu odoslania prepustí volajúcemu (poukaz ju potrebuje na opakovanie)", async () => {
    const { container, notifications } = makeContainer()
    notifications.createNotifications.mockRejectedValueOnce(new Error("provider down"))
    await expect(sendEmail(container, { to: TO, template: "gift-voucher-recipient-sk", data: { code: "A" } })).rejects.toThrow(EmailOutcomeUnknownError)
  })

  it.each(["pending", "failure", "unknown", undefined])("záznam %s není úspěšná duplicita ani důvod ke slepému odeslání", async status => {
    const { container, notifications, logs } = makeContainer({ existing: [{ id: "noti_0", status, channel: "email", to: TO, template: "order-placed-sk", idempotency_key: "k" }] })
    await expect(sendEmail(container, { to: TO, template: "order-placed-sk", idempotency_key: "k" })).rejects.toThrow(EmailOutcomeUnknownError)
    expect(notifications.createNotifications).not.toHaveBeenCalled()
    expect(logs.join("\n")).toContain("outcome_requires_review")
    expect(logs.join("\n")).not.toContain(TO)
  })

  it.each([{ to: "another@example.test" }, { template: "order-canceled-sk" }, { channel: "sms" }, { resource_id: "other" }])("shodný klíč nesmí zakrýt jinou identitu %j", async patch => {
    const row = { id: "noti_0", status: "success", channel: "email", to: TO, template: "order-placed-sk", idempotency_key: "k", resource_id: "o1", ...patch }
    const { container, notifications } = makeContainer({ existing: [row] })
    await expect(sendEmail(container, { to: TO, template: "order-placed-sk", idempotency_key: "k", resource_id: "o1" })).rejects.toThrow(EmailOutcomeUnknownError)
    expect(notifications.createNotifications).not.toHaveBeenCalled()
  })

  it("výsledek provideru bez trvalého read-backu není sent", async () => {
    const { container, notifications } = makeContainer()
    notifications.listNotifications.mockResolvedValue([])
    await expect(sendEmail(container, { to: TO, template: "order-placed-sk", idempotency_key: "k" })).rejects.toThrow(EmailOutcomeUnknownError)
    expect(notifications.createNotifications).toHaveBeenCalledTimes(1)
  })

  it("výpadek read-backu nesmí způsobit další zápis", async () => {
    const { container, notifications } = makeContainer()
    notifications.listNotifications.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("private DB error"))
    await expect(sendEmail(container, { to: TO, template: "order-placed-sk", idempotency_key: "k" })).rejects.toThrow(EmailOutcomeUnknownError)
    expect(notifications.createNotifications).toHaveBeenCalledTimes(1)
  })

  it("bez čitelného stavu před zápisem nic neposílá ani neprozradí chybu DB", async () => {
    const { container, notifications, logs } = makeContainer()
    notifications.listNotifications.mockRejectedValueOnce(new Error(`private DB ${TO}`))
    await expect(sendEmail(container, { to: TO, template: "order-placed-sk", idempotency_key: "k" })).rejects.toThrow("EMAIL_OUTCOME_REQUIRES_REVIEW")
    expect(notifications.createNotifications).not.toHaveBeenCalled()
    expect(logs.join("\n")).not.toContain(TO)
  })

  it("undefined z create při souběhu vyžaduje prokázaný úspěch stejného klíče", async () => {
    const { container, notifications } = makeContainer()
    notifications.createNotifications.mockResolvedValueOnce(undefined as any)
    notifications.listNotifications.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "noti_other", status: "success", channel: "email", to: TO, template: "order-placed-sk", idempotency_key: "k" }])
    expect(await sendEmail(container, { to: TO, template: "order-placed-sk", idempotency_key: "k" })).toEqual({ status: "duplicate" })
  })
})
