import { currentRequestId, formatLogLine, logEvent, normalizeRequestId, redact, runWithRequestId } from "../log"

describe("observability/log", () => {
  it("normalizeRequestId převezme bezpečné ID a jinak vytvoří nové", () => {
    expect(normalizeRequestId("cf-ray:abc12345")).toBe("cf-ray:abc12345")
    expect(normalizeRequestId(["req_12345678", "x"])).toBe("req_12345678")
    const fresh = normalizeRequestId("bad id <script>")
    expect(fresh).toMatch(/^[0-9a-f-]{36}$/)
    expect(normalizeRequestId(undefined)).not.toBe(normalizeRequestId(undefined))
    expect(normalizeRequestId("short")).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("redact odstraní osobní údaje a tajemství, ID ponechá", () => {
    const out = redact({
      customer_id: "cus_1", email: "jana@example.test", phone: "+421900000000", first_name: "Jana",
      voucher_code: "ANA-ABCD-EFGH-1234", token: "tok", nested: { note: "tajné", order_id: "order_1" },
      text: "kontakt jana@example.test prosím",
    }) as Record<string, any>
    expect(out.customer_id).toBe("cus_1")
    expect(out.email).toBe("[redacted]")
    expect(out.phone).toBe("[redacted]")
    expect(out.first_name).toBe("[redacted]")
    expect(out.voucher_code).toBe("***1234")
    expect(out.token).toBe("[redacted]")
    expect(out.nested).toEqual({ note: "[redacted]", order_id: "order_1" })
    expect(out.text).toBe("kontakt [email] prosím")
  })

  it("redact normalizuje camelCase a kebab-case klíče", () => {
    const out = redact({ apiKey: "synthetic-api-key-value", api_key: "synthetic", "X-Api-Key": "synthetic", voucherCode: "ANA-ABCD-EFGH-9876", couponCode: "SPRING26XY" }) as Record<string, any>
    expect(out.apiKey).toBe("[redacted]")
    expect(out.api_key).toBe("[redacted]")
    expect(out["X-Api-Key"]).toBe("[redacted]")
    expect(out.voucherCode).toBe("***9876")
    expect(out.couponCode).toBe("***26XY")
    expect(redact({ errorCode: "SAFEORDER_BLOCKED", currency_code: "eur" })).toEqual({ errorCode: "SAFEORDER_BLOCKED", currency_code: "eur" })
  })

  it("redact skryje osobní údaje v camelCase i tajemství pod jinými názvy", () => {
    const out = redact({ firstName: "Jana", customerEmail: "a@b.cz", accessToken: "t", clientSecret: "s", idempotencyKey: "k", webhookSignature: "sig", setCookie: "c", productId: "prod_1" }) as Record<string, any>
    for (const key of ["firstName", "customerEmail", "accessToken", "clientSecret", "idempotencyKey", "webhookSignature", "setCookie"]) expect(out[key]).toBe("[redacted]")
    expect(out.productId).toBe("prod_1")
  })

  it("redact zvládne cyklus, hloubku, dlouhé řetězce, pole a Error", () => {
    const cyc: Record<string, unknown> = { a: 1 }
    cyc.self = cyc
    expect((redact(cyc) as any).self).toBe("[circular]")
    let deep: any = { v: 1 }
    for (let i = 0; i < 10; i++) deep = { d: deep }
    expect(JSON.stringify(redact(deep))).toContain("[truncated]")
    expect((redact("x".repeat(900)) as string).length).toBe(501)
    expect((redact(Array.from({ length: 80 }, (_, i) => i)) as unknown[]).length).toBe(50)
    expect(redact(new Error("pro a@b.cz"))).toEqual({ name: "Error", message: "pro [email]" })
    expect(redact(10n)).toBe("10")
  })

  it("formatLogLine je jeden JSON řádek s request_id z ALS", () => {
    const now = new Date("2026-10-14T10:00:00.000Z")
    const line = runWithRequestId("req_abcdefgh", () => {
      expect(currentRequestId()).toBe("req_abcdefgh")
      return formatLogLine("info", "checkout", "safeorder_ok", { cart_id: "cart_1", email: "x@y.cz" }, now)
    })
    expect(line).not.toContain("\n")
    expect(JSON.parse(line)).toEqual({
      ts: "2026-10-14T10:00:00.000Z", level: "info", domain: "checkout", event: "safeorder_ok",
      request_id: "req_abcdefgh", cart_id: "cart_1", email: "[redacted]",
    })
    expect(JSON.parse(formatLogLine("warn", "job", "x", {}, now)).request_id).toBeNull()
    expect(JSON.parse(formatLogLine("warn", "job", "x", { request_id: "explicit_1" }, now)).request_id).toBe("explicit_1")
  })

  it("pole volajícího nepřepíšou ts/level/domain/event/request_id", () => {
    const now = new Date("2026-10-14T10:00:00.000Z")
    const line = JSON.parse(formatLogLine("info", "payment", "captured", { ts: "x", level: "error", domain: "auth", event: "fake", request_id: "bad id" } as any, now))
    expect(line).toMatchObject({ ts: "2026-10-14T10:00:00.000Z", level: "info", domain: "payment", event: "captured" })
    expect(line.request_id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("Error nevypíše token, kód poukazu ani payload", () => {
    const err = Object.assign(new Error("Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig_abcdefgh kód ANA-7K2P-QX9M pro jana@x.sk"), {
      code: "E_VOUCHER", response: { body: { token: "tajne" } },
    })
    const out = redact({ error: err }) as any
    expect(out.error.code).toBe("E_VOUCHER")
    expect(out.error.message).not.toMatch(/eyJ|ANA-7K2P|jana@/)
    expect(JSON.stringify(out)).not.toContain("tajne")
    expect(out.error.message.length).toBeLessThanOrEqual(200)
  })

  it("logEvent volá správnou úroveň a nikdy nevyhodí", () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    logEvent(logger, "warn", "coupon", "rejected", { coupon_code: "SPRING-2026-X" })
    expect(JSON.parse(logger.warn.mock.calls[0][0]).coupon_code).toBe("***26-X")
    logEvent(logger, "error", "webhook", "failed")
    expect(logger.error).toHaveBeenCalledTimes(1)
    const broken = { info: () => { throw new Error("x") }, warn: jest.fn(), error: jest.fn() }
    expect(() => logEvent(broken, "info", "http", "x")).not.toThrow()
  })
})
