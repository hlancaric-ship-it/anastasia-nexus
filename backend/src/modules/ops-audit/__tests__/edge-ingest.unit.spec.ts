import { EdgeIngestError, parseEdgeBatch, resolveIngestTenant, signEdgeBatch, verifyEdgeSignature } from "../edge-ingest"

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
    const T = "anastasia"
    const { events, rejected } = parseEdgeBatch(JSON.stringify({ tenant_id: T, events: [
      { tenant_id: T, level: "error", event: "http.unhandled_error", ts: "2026-10-14T11:59:59Z", request_id: "req_abcdefgh", path: "/api/v1/pricing", status: 500, message: "leak a@b.cz", stack: "at x" },
      { tenant_id: T, level: "debug", event: "voucher.validate", code: "ANA-ABCD-EFGH-1234" },
      { tenant_id: "okfish", level: "error", event: "x.y" },
      { tenant_id: T, level: "fatal", event: "x.y" },
      { tenant_id: T, level: "info", event: "Bad Event" },
      "nonsense",
    ] }), T)
    expect(rejected).toBe(4)
    expect(events[0]).toMatchObject({ level: "error", domain: "edge", event: "http.unhandled_error", request_id: "req_abcdefgh", fields: { path: "/api/v1/pricing", status: 500, edge_ts: "2026-10-14T11:59:59.000Z" } })
    expect(JSON.stringify(events[0])).not.toMatch(/stack|leak|a@b/)
    expect(events[1]).toMatchObject({ level: "info", fields: { code: "***1234" } })
  })

  it("odmítne nevalidní JSON, příliš velkou dávku a nadlimitní velikost", () => {
    expect(code(() => parseEdgeBatch("{", "anastasia"))).toBe("INGEST_INVALID:400")
    expect(code(() => parseEdgeBatch(JSON.stringify({ tenant_id: "anastasia", events: Array(101).fill({ level: "info", event: "a.b" }) }), "anastasia"))).toBe("INGEST_INVALID:400")
    expect(code(() => parseEdgeBatch("x".repeat(300 * 1024), "anastasia"))).toBe("INGEST_INVALID:413")
  })

  it("tenant: cizí nebo chybějící tenant dávky 403, bez konfigurace 503", () => {
    expect(code(() => parseEdgeBatch(JSON.stringify({ tenant_id: "okfish", events: [] }), "anastasia"))).toBe("INGEST_TENANT_MISMATCH:403")
    expect(code(() => parseEdgeBatch(JSON.stringify({ events: [] }), "anastasia"))).toBe("INGEST_TENANT_MISMATCH:403")
    expect(resolveIngestTenant({ OPS_INGEST_TENANT_ID: " Anastasia " })).toBe("anastasia")
    expect(resolveIngestTenant({ NEXUS_TENANT_ID: "anastasia" })).toBe("anastasia")
    expect(code(() => resolveIngestTenant({}))).toBe("INGEST_NOT_CONFIGURED:503")
    expect(code(() => resolveIngestTenant({ OPS_INGEST_TENANT_ID: "bad tenant!" }))).toBe("INGEST_NOT_CONFIGURED:503")
  })
})
