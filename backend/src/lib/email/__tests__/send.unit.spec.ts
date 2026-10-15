import { loadTemplateSettings, sendEmail } from "../send"

const TO = "synthetic.customer@example.test"

function makeContainer(opts: { override?: any; overrideError?: Error; noModule?: boolean; existing?: any[] } = {}) {
  const templates = {
    listEmailTemplateOverrides: jest.fn(async () => {
      if (opts.overrideError) throw opts.overrideError
      return opts.override ? [opts.override] : []
    }),
  }
  const notifications = {
    listNotifications: jest.fn(async () => opts.existing ?? []),
    createNotifications: jest.fn(async () => [{ id: "noti_1" }]),
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
    const { container, notifications } = makeContainer({ existing: [{ id: "noti_0" }] })
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
    await expect(sendEmail(container, { to: TO, template: "gift-voucher-recipient-sk", data: { code: "A" } })).rejects.toThrow("provider down")
  })
})
