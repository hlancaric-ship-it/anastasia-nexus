import { env } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import { handleMedusaWebhook } from "../../workers/api/routes/medusaWebhook.js"
import type { Env } from "../../workers/api/types.js"

const secret = "worker-test-webhook-secret"
const workerEnv = { DB: env.DB, HMAC_SECRET: 'synthetic-unused-hmac', ENVIRONMENT: "production", MEDUSA_WEBHOOK_SECRET: secret } as Env
const ctx = { waitUntil: (_promise: Promise<unknown>) => {} }

async function signedRequest(eventId: string) {
  const body = JSON.stringify({ id: eventId, type: "order.placed", data: { id: `ord_${eventId}` } })
  const timestamp = String(Math.floor(Date.now() / 1000))
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`)))
  const signature = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")
  return new Request("https://nexus.test/api/webhooks/medusa", {
    method: "POST",
    headers: { "x-medusa-signature": `t=${timestamp},v1=${signature}` },
    body,
  })
}

describe("Medusa webhook receipt durability", () => {
  it("accepts once and reports a duplicate across requests using D1", async () => {
    const eventId = `evt_d1_${crypto.randomUUID()}`
    const first = await handleMedusaWebhook(await signedRequest(eventId), workerEnv, ctx)
    expect(first.status).toBe(200)
    expect((await first.json() as { duplicate?: boolean }).duplicate).toBeUndefined()

    const replay = await handleMedusaWebhook(await signedRequest(eventId), workerEnv, ctx)
    expect(replay.status).toBe(200)
    expect((await replay.json() as { duplicate?: boolean }).duplicate).toBe(true)
  })
})
