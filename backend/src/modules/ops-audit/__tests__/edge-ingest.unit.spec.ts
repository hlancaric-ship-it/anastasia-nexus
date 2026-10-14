import { EdgeIngestError, parseEdgeBatch, signEdgeBatch, verifyEdgeSignature } from "../edge-ingest"

const SECRET = "s".repeat(40)
const NOW = Date.parse("2026-10-14T12:00:00Z")
const ts = String(Math.floor(NOW / 1000))

const code = (fn: () => unknown) => { try { fn(); return "OK" } catch (e) { return (e as EdgeIngestError).code + ":" + (e as EdgeIngestError).status } }

describe("ops-audit/edge-ingest", () => {
  it("přijme správný podpis a odmítne cizí, starý i chybějící", () => {
    const body = JSON.stringify({ events: [] })
    expect(code(() => verifyEdgeSignature(SECRET, ts, signEdgeBatch(SECRET, ts, body), body, NOW))).toBe("OK")
    expect(code(() => verifyEdgeSignature(SECRET, ts, signEdgeBatch("x".repeat(40), ts, body), body, NOW))).toBe("INGEST_UNAUTHORIZED:401")
    expect(code(() => verifyEdgeSignature(SECRET, ts, signEdgeBatch(SECRET, ts, body), body + " ", NOW))).toBe("INGEST_UNAUTHORIZED:401")
    const old = String(Number(ts) - 301)
    expect(code(() => verifyEdgeSignature(SECRET, old, signEdgeBatch(SECRET, old, body), body, NOW))).toBe("INGEST_UNAUTHORIZED:401")
    expect(code(() => verifyEdgeSignature(SECRET, ts, "ZZ".repeat(32), body, NOW))).toBe("INGEST_UNAUTHORIZED:401")
    expect(code(() => verifyEdgeSignature(undefined, ts, "a".repeat(64), body, NOW))).toBe("INGEST_NOT_CONFIGURED:503")
    expect(code(() => verifyEdgeSignature("short", ts, "a".repeat(64), body, NOW))).toBe("INGEST_NOT_CONFIGURED:503")
  })

  it("dávka: platné záznamy uloží bez stack/message, neplatné spočítá", () => {
    const { events, rejected } = parseEdgeBatch(JSON.stringify({ events: [
      { level: "error", event: "http.unhandled_error", ts: "2026-10-14T11:59:59Z", request_id: "req_abcdefgh", path: "/api/v1/pricing", status: 500, message: "leak a@b.cz", stack: "at x" },
      { level: "debug", event: "voucher.validate", code: "ANA-ABCD-EFGH-1234" },
      { level: "fatal", event: "x.y" },
      { level: "info", event: "Bad Event" },
      "nonsense",
    ] }))
    expect(rejected).toBe(3)
    expect(events[0]).toMatchObject({ level: "error", domain: "edge", event: "http.unhandled_error", request_id: "req_abcdefgh", fields: { path: "/api/v1/pricing", status: 500, edge_ts: "2026-10-14T11:59:59.000Z" } })
    expect(JSON.stringify(events[0])).not.toMatch(/stack|leak|a@b/)
    expect(events[1]).toMatchObject({ level: "info", fields: { code: "***1234" } })
  })

  it("odmítne nevalidní JSON, příliš velkou dávku a nadlimitní velikost", () => {
    expect(code(() => parseEdgeBatch("{"))).toBe("INGEST_INVALID:400")
    expect(code(() => parseEdgeBatch(JSON.stringify({ events: Array(101).fill({ level: "info", event: "a.b" }) })))).toBe("INGEST_INVALID:400")
    expect(code(() => parseEdgeBatch("x".repeat(300 * 1024)))).toBe("INGEST_INVALID:413")
  })
})
