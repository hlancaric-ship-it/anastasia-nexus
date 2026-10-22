import { Server } from "node:net"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { createApiKeysWorkflow } from "@medusajs/medusa/core-flows"
import { verifyResetJournal } from "./reset-journal-http-checks"

/**
 * Zrkadielko (členská zóna RESET 40+) – samostatný integračný scenár.
 *
 * Beží nad skutočným Medusa HTTP a PostgreSQL: overuje prístup podľa aktívneho entitlementu,
 * izoláciu zákazníkov, validáciu hodnôt a dátumu, export osobných údajov a výmaz zákazníka.
 * Iba syntetické údaje; vlastná dočasná databáza.
 */
const ci = process.env.CI === "true" && process.env.DB_USERNAME === "reset_journal_synthetic" && process.env.DB_TEMP_NAME === "anastasia_reset_journal_ci"
const local = process.env.DB_USERNAME === "wave1_synthetic" && process.env.DB_TEMP_NAME === "anastasia_dev_wave1" && Boolean(process.env.WAVE1_SYNTHETIC_ROOT)
if (!ci && !local) {
  throw new Error("Run only in the isolated reset-journal CI workflow or in the synthetic local cluster")
}

// The installed Medusa test runner listens without a host. Constrain its real
// HTTP server to loopback; no routes, workflows, modules or DB calls are mocked.
const listen = Server.prototype.listen
Server.prototype.listen = function (...args: any[]) {
  if (typeof args[0] === "number" && (args.length === 1 || typeof args[1] === "function")) args.splice(1, 0, "127.0.0.1")
  return (listen as any).apply(this, args)
} as any

jest.setTimeout(300_000)

medusaIntegrationTestRunner({
  dbName: process.env.DB_TEMP_NAME ?? "anastasia_reset_journal_ci",
  testSuite: ({ api, getContainer }) => {
    afterAll(() => { Server.prototype.listen = listen })
    it("Zrkadielko patrí zákazníkovi s aktívnym prístupom a reaguje na výmaz", async () => {
      const container = getContainer()
      const { result: [key] } = await createApiKeysWorkflow(container).run({ input: { api_keys: [{ title: "Synthetic reset-journal", type: "publishable", created_by: "synthetic-reset-journal" }] } })
      const options = { validateStatus: () => true, headers: { "x-publishable-api-key": key.token } }
      const evidence: unknown[] = []
      await verifyResetJournal({ api, container, options, evidence })
      expect(evidence.length).toBeGreaterThan(0)
      expect(evidence.every((entry: any) => entry.status === "PASS")).toBe(true)
    })
  },
})
