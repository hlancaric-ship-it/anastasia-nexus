import { chatRetentionCutoff } from "../retention"
import chatRetentionJob from "../../../jobs/chat-retention"

describe("closed chat content retention", () => {
  const now = new Date("2026-10-14T10:00:00Z")
  it("uses a configurable retention with a one-year default", () => {
    expect(chatRetentionCutoff(undefined, now).toISOString()).toBe("2025-10-14T10:00:00.000Z")
    expect(chatRetentionCutoff("30", now).toISOString()).toBe("2026-09-14T10:00:00.000Z")
  })
  it.each(["", "0", "-1", "29", "3651", "30.5", "invalid", "Infinity"])("rejects unsafe setting %s before touching stored content", (value) => {
    expect(() => chatRetentionCutoff(value, now)).toThrow("CHAT_RETENTION_CONFIGURATION_INVALID")
  })
  it("does not erase content on a bad configuration and logs no message payloads", async () => {
    const prior = process.env.CHAT_RETENTION_DAYS
    process.env.CHAT_RETENTION_DAYS = "bad"
    const redactExpiredContent = jest.fn()
    const logger = { info: jest.fn(), error: jest.fn() }
    try {
      await chatRetentionJob({ resolve: (key: string) => key === "logger" ? logger : { redactExpiredContent } } as any)
      expect(redactExpiredContent).not.toHaveBeenCalled()
      expect(logger.error).toHaveBeenCalledTimes(1)
    } finally {
      if (prior === undefined) delete process.env.CHAT_RETENTION_DAYS
      else process.env.CHAT_RETENTION_DAYS = prior
    }
  })
})
