import { recordEvent } from "../events"
import { runWithRequestId } from "../log"

const makeScope = (create: jest.Mock) => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { logger, scope: { resolve: (key: string) => (key === "logger" ? logger : { createOpsEvents: create }) } as any }
}

describe("observability/recordEvent", () => {
  it("zaloguje stdout a uloží event s request_id z kontextu", async () => {
    const create = jest.fn().mockResolvedValue({ id: "oevt_1" })
    const { scope, logger } = makeScope(create)
    await runWithRequestId("req_abcdefgh", () => recordEvent(scope, "info", "booking", "confirmed", { order_id: "order_1" }))
    expect(JSON.parse(logger.info.mock.calls[0][0])).toMatchObject({ domain: "booking", event: "confirmed", order_id: "order_1", request_id: "req_abcdefgh" })
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ order_id: "order_1", request_id: "req_abcdefgh", level: "info" }))
  })

  it("selhání DB nevyhodí a zaloguje ops_event_write_failed", async () => {
    const { scope, logger } = makeScope(jest.fn().mockRejectedValue(new Error("db down")))
    await expect(recordEvent(scope, "error", "webhook", "failed", { error: new Error("x") })).resolves.toBeUndefined()
    expect(logger.error).toHaveBeenCalledTimes(2)
    expect(JSON.parse(logger.error.mock.calls[1][0]).event).toBe("ops_event_write_failed")
  })
})
