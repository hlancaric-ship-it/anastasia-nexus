import { buildOpsEvent, parseOpsEventQuery, retentionCutoff } from "../events-policy"

describe("ops-audit/events-policy", () => {
  it("buildOpsEvent vytáhne korelační ID a zrediguje pole", () => {
    const out = buildOpsEvent("warn", "checkout", "price_changed", {
      cart_id: "cart_1", order_id: "order_1", customer_id: "cus_1", email: "a@b.cz", note: "x", total: 1200, request_id: "ignored_x",
    }, "req_abcdefgh")
    expect(out).toEqual({
      level: "warn", domain: "checkout", event: "price_changed", request_id: "req_abcdefgh",
      order_id: "order_1", cart_id: "cart_1", customer_id: "cus_1", entity_id: null,
      fields: { email: "[redacted]", note: "[redacted]", total: 1200 },
    })
    expect(buildOpsEvent("info", "job", "x_run", { order_id: "bad id <x>" }, null)).toMatchObject({ order_id: null, fields: null, request_id: null })
  })

  it("buildOpsEvent odmítne neznámou doménu/event a ořeže obří pole", () => {
    expect(() => buildOpsEvent("info", "nope" as any, "x_run", {}, null)).toThrow("OPS_EVENT_INVALID_DOMAIN")
    expect(() => buildOpsEvent("info", "job", "Bad Event", {}, null)).toThrow("OPS_EVENT_INVALID_EVENT")
    expect(() => buildOpsEvent("debug" as any, "job", "x_run", {}, null)).toThrow("OPS_EVENT_INVALID_LEVEL")
    const big = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`k${i}`, "y".repeat(200)]))
    expect(buildOpsEvent("info", "job", "x_run", big, null).fields).toMatchObject({ truncated: true })
  })

  it("parseOpsEventQuery validuje filtry a časové okno", () => {
    expect(parseOpsEventQuery({ order_id: "order_1", domain: "checkout", level: "error", event: "failed" })).toEqual({
      filters: { order_id: "order_1", domain: "checkout", level: "error", event: "failed" },
    })
    const ranged = parseOpsEventQuery({ from: "2026-10-01T00:00:00Z", to: "2026-10-14T00:00:00Z" }) as any
    expect(ranged.filters.created_at.$gte.toISOString()).toBe("2026-10-01T00:00:00.000Z")
    expect(parseOpsEventQuery({ domain: "nope" })).toEqual({ error: "Neplatná doména." })
    expect(parseOpsEventQuery({ order_id: "a b" })).toEqual({ error: "Neplatný filtr order_id." })
    expect(parseOpsEventQuery({ from: "včera" })).toEqual({ error: "Neplatné datum from." })
    expect(parseOpsEventQuery({ from: "2026-10-14", to: "2026-10-01" })).toEqual({ error: "Datum from musí být před to." })
    expect(parseOpsEventQuery({ from: "2026-01-01", to: "2026-10-01" })).toEqual({ error: "Časové okno je nejvýše 93 dní." })
    expect(parseOpsEventQuery(undefined)).toEqual({ filters: {} })
  })

  it("retentionCutoff respektuje rozsah a výchozí hodnotu", () => {
    const now = new Date("2026-10-14T00:00:00Z")
    expect(retentionCutoff("30", 90, 7, 730, now).toISOString()).toBe("2026-09-14T00:00:00.000Z")
    expect(retentionCutoff("1", 90, 7, 730, now).toISOString()).toBe("2026-07-16T00:00:00.000Z")
    expect(retentionCutoff(undefined, 90, 7, 730, now).toISOString()).toBe("2026-07-16T00:00:00.000Z")
    for (const junk of ["7junk", "7.9", "1e1", " ", "-30", "0x10"]) {
      expect(retentionCutoff(junk, 90, 7, 730, now).toISOString()).toBe("2026-07-16T00:00:00.000Z")
    }
  })
})
