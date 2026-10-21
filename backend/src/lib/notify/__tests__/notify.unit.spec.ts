import { notify, notifyIdempotencyKey, NOTIFY_TEMPLATES } from "../index"
import NotificationLogService from "../../../modules/notification-log/service"

const EMAIL = "synthetic.customer@example.test"

function makeContainer(opts: { booking?: any; email?: string | null; existing?: any[]; createError?: Error } = {}) {
  const booking = "booking" in opts ? opts.booking : { id: "bkg_1", customer_id: "cus_1", status: "confirmed", starts_at: new Date("2026-11-02T09:00:00Z"), ends_at: "2026-11-02T10:00:00.000Z", cancel_reason: null }
  const bookings = { listBookings: jest.fn(async () => (booking ? [booking] : [])) }
  const query = { graph: jest.fn(async () => ({ data: opts.email === null ? [] : [{ id: "cus_1", email: opts.email ?? EMAIL }] })) }
  const created: any[] = []
  const notifications = {
    listNotifications: jest.fn(async (filters: any) => [...(opts.existing ?? []), ...created].filter(n => filters.id ? n.id === filters.id : n.idempotency_key === filters.idempotency_key)),
    createNotifications: jest.fn(async (input: any) => { if (opts.createError) throw opts.createError; const row = { ...input, id: "noti_" + created.length, status: "success" }; created.push(row); return row }),
  }
  const logs: string[] = []
  const logger = { info: (m: string) => logs.push(m), warn: (m: string) => logs.push(m), error: (m: string) => logs.push(m) }
  const ops = { createOpsEvents: jest.fn(async (e: any) => ({ id: "ev", ...e })) }
  const container: any = {
    resolve: (key: string) => ({ booking: bookings, query, notification: notifications, logger, ops_audit: ops, opsAudit: ops } as any)[key] ?? (key.includes("ops") ? ops : undefined),
  }
  return { container, bookings, query, notifications, logs, ops }
}

describe("notify(booking.*)", () => {
  it("potvrzení: adresát ze serveru, idempotency_key, data bez osobních údajů", async () => {
    const { container, notifications, logs } = makeContainer()
    expect(await notify(container, { type: "booking.confirmed", booking_id: "bkg_1", order_id: "order_1" })).toEqual({ status: "sent" })
    const payload = (notifications.createNotifications.mock.calls[0] as any[])[0]
    expect(payload).toMatchObject({ to: EMAIL, channel: "email", template: NOTIFY_TEMPLATES["booking.confirmed"], idempotency_key: "booking.confirmed:bkg_1", resource_type: "booking", resource_id: "bkg_1" })
    expect(payload.data).toEqual({ booking_id: "bkg_1", starts_at: "2026-11-02T09:00:00.000Z", ends_at: "2026-11-02T10:00:00.000Z", url: null })
    expect(JSON.stringify(payload.data)).not.toContain("@")
    expect(logs.join("\n")).not.toContain(EMAIL)
  })

  it("druhé doručení stejné události je potlačeno", async () => {
    const { container, notifications } = makeContainer({ existing: [{ id: "noti_1", status: "success", to: EMAIL, channel: "email", template: "booking-confirmed-sk", idempotency_key: "booking.confirmed:bkg_1", resource_id: "bkg_1", resource_type: "booking" }] })
    expect(await notify(container, { type: "booking.confirmed", booking_id: "bkg_1" })).toEqual({ status: "duplicate" })
    expect(notifications.listNotifications).toHaveBeenCalledWith({ idempotency_key: notifyIdempotencyKey({ type: "booking.confirmed", booking_id: "bkg_1" }) }, expect.anything())
    expect(notifications.createNotifications).not.toHaveBeenCalled()
  })

  it("zrušení: volný text adminu do šablony nejde", async () => {
    const { container, notifications } = makeContainer({ booking: { id: "bkg_1", customer_id: "cus_1", status: "canceled", starts_at: "2026-11-02T09:00:00Z", ends_at: "2026-11-02T10:00:00Z", cancel_reason: "zákazník volala, nemoc" } })
    expect((await notify(container, { type: "booking.canceled", booking_id: "bkg_1" })).status).toBe("sent")
    const payload = (notifications.createNotifications.mock.calls[0] as any[])[0]
    expect(payload.data.cancel_kind).toBe("other")
    expect(JSON.stringify(payload)).not.toContain("nemoc")
  })

  it("nesoulad stavu, chybějící rezervace i e-mail = skipped bez odeslání", async () => {
    for (const [opts, reason] of [
      [{ booking: { id: "bkg_1", customer_id: "cus_1", status: "held", starts_at: "2026-11-02T09:00:00Z", ends_at: "2026-11-02T10:00:00Z" } }, "STATUS_MISMATCH"],
      [{ booking: null }, "BOOKING_NOT_FOUND"],
      [{ email: null }, "NO_EMAIL"],
    ] as const) {
      const { container, notifications } = makeContainer(opts as any)
      expect(await notify(container, { type: "booking.confirmed", booking_id: "bkg_1" })).toEqual({ status: "skipped", reason })
      expect(notifications.createNotifications).not.toHaveBeenCalled()
    }
  })

  it("selhání provideru nevyhodí a neprozradí adresu", async () => {
    const { container, logs } = makeContainer({ createError: new Error(`SMTP refused ${EMAIL}`) })
    await expect(notify(container, { type: "booking.confirmed", booking_id: "bkg_1" })).resolves.toEqual({ status: "skipped", reason: "SEND_FAILED" })
    expect(logs.join("\n")).toContain("send_failed")
    expect(logs.join("\n")).not.toContain(EMAIL)
  })
})

describe("NotificationLogService", () => {
  it("loguje jen šablonu, kanál a klíče dat", async () => {
    const lines: string[] = []
    const provider = new NotificationLogService({ logger: { info: (m: string) => lines.push(m) } as any })
    const result = await provider.send({ to: EMAIL, channel: "email", template: "magic-link-sk", data: { url: "https://example.test/auth?token=secret-token-value-1234567890", subject: "x" } } as any)
    expect(result.id).toMatch(/^synthetic_/)
    const line = JSON.parse(lines[0]!)
    expect(line).toMatchObject({ domain: "notification", event: "provider_send", template: "magic-link-sk", channel: "email", data_keys: ["subject", "url"], has_recipient: true })
    expect(lines[0]).not.toContain(EMAIL)
    expect(lines[0]).not.toContain("secret-token")
  })
})
