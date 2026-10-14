import { claimVoucherAttempt, limitVoucherAttempts } from "../rate-limit"

describe("voucher apply rate limit", () => {
  it("stores a digest rather than the peer address and bounds rejected counters", async () => {
    const raw = jest.fn().mockResolvedValue({ rows: [{ attempts: 21, retry_after: 45 }] })
    expect(await claimVoucherAttempt({ raw }, "192.0.2.10")).toEqual({ allowed: false, retryAfter: 45 })
    const [sql, bindings] = raw.mock.calls[0]
    expect(sql).toContain("ON CONFLICT (subject) DO UPDATE")
    expect(bindings[0]).toMatch(/^[a-f0-9]{64}$/)
    expect(bindings).not.toContain("192.0.2.10")
    expect(bindings[1]).toBe(21)
  })

  function fixture(raw: jest.Mock) {
    const logger = { error: jest.fn() }
    const req: any = { ip: "192.0.2.1", socket: { remoteAddress: "192.0.2.2" }, headers: { "x-forwarded-for": "attacker-chosen" }, scope: { resolve: (key: string) => key === "logger" ? logger : { raw } } }
    const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() }
    const next = jest.fn()
    return { req, res, next, logger }
  }

  it("allows the last attempt and ignores caller forwarding headers", async () => {
    const raw = jest.fn().mockResolvedValue({ rows: [{ attempts: 20, retry_after: 60 }] })
    const { req, res, next } = fixture(raw)
    await limitVoucherAttempts(req, res, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
    const expected = jest.fn().mockResolvedValue({ rows: [{ attempts: 1, retry_after: 60 }] })
    await claimVoucherAttempt({ raw: expected }, req.ip)
    expect(raw.mock.calls[0][1][0]).toBe(expected.mock.calls[0][1][0])
  })

  it("rejects exhausted limits with Retry-After and Slovak feedback", async () => {
    const { req, res, next } = fixture(jest.fn().mockResolvedValue({ rows: [{ attempts: 21, retry_after: 12 }] }))
    await limitVoucherAttempts(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "12")
    expect(res.json.mock.calls[0][0].error).toBe("GIFT_VOUCHER_RATE_LIMITED")
  })

  it("fails closed without logging database errors or personal information", async () => {
    const { req, res, next, logger } = fixture(jest.fn().mockRejectedValue(new Error("secret database payload")))
    await limitVoucherAttempts(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(503)
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("secret")
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(req.ip)
  })

  it("fails closed if storage returns no result", async () => {
    await expect(claimVoucherAttempt({ raw: jest.fn().mockResolvedValue({ rows: [] }) }, "192.0.2.1")).rejects.toThrow("VOUCHER_RATE_LIMIT_UNAVAILABLE")
  })
})
