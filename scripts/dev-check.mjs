#!/usr/bin/env node
/**
 * Pre-flight check for local dev. Validates that all prerequisites
 * are in place before starting the dev servers.
 */
import { execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")
const BACKEND = resolve(ROOT, "backend")
const NEXUS = resolve(ROOT, "nexus")

let ok = true

function check(label, condition, fix) {
  if (condition) {
    console.log(`  ✓ ${label}`)
  } else {
    console.error(`  ✗ ${label}`)
    if (fix) console.error(`    → ${fix}`)
    ok = false
  }
}

function commandExists(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

console.log("\n🔍 ANASTASIA × NEXUS — dev environment check\n")

console.log("Prerequisites:")
check("Node.js >= 20", (() => {
  const v = process.versions.node.split(".").map(Number)
  return v[0] >= 20
})(), "Nainstaluj Node.js >= 20")

check("npm", commandExists("npm"), "npm by měl být součástí Node.js")

check("PostgreSQL (psql)", commandExists("psql"), "Nainstaluj PostgreSQL: brew install postgresql@16")

check("wrangler", commandExists("npx"), "npx wrangler dev pro NEXUS worker")

console.log("\nBackend:")
check("backend/node_modules", existsSync(resolve(BACKEND, "node_modules")), "cd backend && npm install")

const envFile = resolve(BACKEND, ".env")
const envExists = existsSync(envFile)
check("backend/.env", envExists, "cp backend/.env.template backend/.env a doplň hodnoty")

if (envExists) {
  const env = readFileSync(envFile, "utf8")
  check("DATABASE_URL nastavena", env.includes("DATABASE_URL=") && !env.includes("DATABASE_URL=postgres://USER:PASSWORD"), "Nastav DATABASE_URL v backend/.env")
  check("NEXUS_PRICING_URL nastavena", env.includes("NEXUS_PRICING_URL="), "Nastav NEXUS_PRICING_URL=http://127.0.0.1:8787/api/nexus/pricing")
  check("NEXUS_PRICING_API_KEY nastavena", env.includes("NEXUS_PRICING_API_KEY=") && !env.match(/NEXUS_PRICING_API_KEY=\s*$/m), "Nastav NEXUS_PRICING_API_KEY (sdílený s NEXUS workerem)")
  check("NEXUS_TENANT_ID nastavena", env.includes("NEXUS_TENANT_ID="), "Nastav NEXUS_TENANT_ID=anastasia")
  check("NEXUS_WEBHOOK_URL nastavena", env.includes("NEXUS_WEBHOOK_URL="), "Nastav NEXUS_WEBHOOK_URL=http://127.0.0.1:8787/api/webhooks/medusa (pro event forwarding)")
}

console.log("\nNEXUS:")
check("nexus/node_modules", existsSync(resolve(NEXUS, "node_modules")), "cd nexus && npm install")

console.log("")
if (ok) {
  console.log("✅ Vše připraveno. Spusť: npm run dev\n")
} else {
  console.error("❌ Některé prerekvizity chybí. Oprav je a spusť znovu: npm run setup\n")
  process.exit(1)
}
