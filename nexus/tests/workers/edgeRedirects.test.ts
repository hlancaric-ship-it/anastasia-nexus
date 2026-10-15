// C-2 ve skutečném workerd: přesměrování jde přes celý `fetch` Workeru (request-id, CORS, logy)
// a NEZÁVISÍ na bindingách -- env bez DB/HMAC musí 301 vrátit, API host musí dál hlásit 503.
import { describe, expect, it } from "vitest"
import worker from "../../workers/api/index.js"
import type { Env } from "../../workers/api/types.js"

const emptyEnv = {} as Env
const ctx = { waitUntil: (_promise: Promise<unknown>) => {} }
const call = (url: string, init?: RequestInit) => worker.fetch(new Request(url, { redirect: "manual", ...init }), emptyEnv, ctx)

describe("edge 301 v NEXUS Workeru (workerd)", () => {
  it("holá doména přes http -> https://www se stejnou cestou a QR query", async () => {
    const response = await call("http://anastasiaoz.eu/eshop/kosik?produkt=KO.001&kupon=Jar%2026&ks=2")
    expect(response.status).toBe(301)
    expect(response.headers.get("Location")).toBe("https://www.anastasiaoz.eu/eshop/kosik?produkt=KO.001&kupon=Jar%2026&ks=2")
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("HEAD se přesměruje, POST ne (projde do routeru a ten bez bindingů vrátí 503)", async () => {
    const head = await call("http://www.anastasiaoz.eu/kontakt/", { method: "HEAD" })
    expect(head.status).toBe(301)
    expect(head.headers.get("Location")).toBe("https://www.anastasiaoz.eu/kontakt/")
    const post = await call("http://anastasiaoz.eu/kontakt/", { method: "POST", body: "{}" })
    expect(post.status).toBe(503)
  })

  it("kanonická adresa a API host se nepřesměrují", async () => {
    expect((await call("https://www.anastasiaoz.eu/eshop")).status).toBe(503)
    expect((await call("https://nexus-api.example.workers.dev/api/nexus/pricing")).status).toBe(503)
  })

  it("přesměrování nese bezpečný absolutní cíl jen na kanonický origin", async () => {
    const response = await call("http://anastasiaoz.eu//evil.test/")
    expect(new URL(response.headers.get("Location")!).origin).toBe("https://www.anastasiaoz.eu")
  })
})
