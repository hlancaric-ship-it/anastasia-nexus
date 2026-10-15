import { createHash } from "node:crypto"
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, extname, relative, resolve } from "node:path"

/** Audit-only evidence collector. No network, application boot, environment dump or DB access. */
describe("audit: executable source inventory at the audited baseline", () => {
  it("inventories real entrypoints and records installed framework source without credentials", () => {
    const repo = resolve(process.cwd(), "..")
    const baseline = "232c149c143507a6ef6f6466d264419e8818d6a0"
    const packageJson = JSON.parse(readFileSync(resolve(repo, "backend/package.json"), "utf8"))
    expect(packageJson.dependencies["@medusajs/medusa"]).toBe("2.19.0")
    const files: Record<string, { sha256: string; lines: number; redacted: boolean; source: string }> = {}
    const skipped: string[] = []
    let totalBytes = 0
    const redact = (input: string) => input
      .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, m => m.replace(/[^\n]/g, "*"))
      .replace(/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{12,}\b/g, "REDACTED_PAYMENT_KEY")
      .replace(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/g, "REDACTED_ACCESS_KEY")
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "REDACTED_JWT")
      .replace(/(\w+:\/\/)[^\s\/:'"`]+:[^\s\/@'"`]+@/g, "$1REDACTED_CREDENTIALS@")
      .replace(/([A-Za-z0-9_.+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, (_m, _u, host) => /(?:example\.(?:com|test)|\.invalid|\.test)$/.test(host) ? `synthetic@${host}` : "REDACTED_EMAIL")
      .replace(/((?:api[_-]?key|secret|password|token)\s*[:=]\s*["'])([^"'\n]{20,})(["'])/gi, (_m, prefix, value, suffix) => /synthetic|example|test|process\.env/i.test(value) ? `${prefix}${value}${suffix}` : `${prefix}REDACTED_LITERAL${suffix}`)
    const add = (absolute: string) => {
      const path = relative(repo, absolute).replace(/\\/g, "/")
      if (path.startsWith("../") || basename(path).startsWith(".env") || /\.(?:pem|key|p12|pfx)$/i.test(path)) return
      const stat = lstatSync(absolute)
      if (!stat.isFile() || stat.size > 3000000 || totalBytes + stat.size > 80000000) { skipped.push(path); return }
      const original = readFileSync(absolute, "utf8")
      const source = redact(original)
      files[path] = { sha256: createHash("sha256").update(original).digest("hex"), lines: original.split("\n").length, redacted: source !== original, source }
      totalBytes += stat.size
    }
    const walk = (root: string, accept: (path: string) => boolean) => {
      const absolute = resolve(repo, root)
      if (!existsSync(absolute)) { skipped.push(root); return }
      const visit = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
          if (entry.isSymbolicLink() || entry.name === ".git" || entry.name === "node_modules" || entry.name === ".medusa" || entry.name === "ci-evidence") continue
          const path = resolve(dir, entry.name)
          if (entry.isDirectory()) visit(path)
          else if (entry.isFile() && accept(path)) add(path)
        }
      }
      visit(absolute)
    }
    const sourceExtension = (path: string) => [".ts", ".tsx", ".js", ".mjs", ".cjs", ".py", ".sh", ".sql", ".toml", ".jsonc", ".yml", ".yaml"].includes(extname(path)) || basename(path).endsWith("Dockerfile")
    for (const root of ["backend/src", "backend/scripts", "backend/integration-tests", "nexus/src", "nexus/workers", "nexus/tests", "nexus/scripts", ".github/workflows"]) walk(root, sourceExtension)
    for (const root of ["backend", "nexus"]) {
      for (const entry of readdirSync(resolve(repo, root), { withFileTypes: true })) {
        if (entry.isFile() && (sourceExtension(entry.name) || /^(?:package(?:-lock)?|tsconfig(?:\.[\w-]+)?)\.json$/.test(entry.name))) add(resolve(repo, root, entry.name))
      }
    }
    const applicationPaths = Object.keys(files)
    const routePaths = applicationPaths.filter(p => p.startsWith("backend/src/api/") && p.endsWith("/route.ts"))
    expect(routePaths.length).toBeGreaterThan(0)
    const routes = routePaths.map(path => ({
      path,
      url: "/" + path.slice("backend/src/api/".length, -"/route.ts".length).replace(/\[([^\]]+)\]/g, ":$1"),
      methods: [...files[path].source.matchAll(/export\s+(?:async\s+function|function|const)\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g)].map(m => m[1]),
      sha256: files[path].sha256,
    }))
    const modules = [...new Set(applicationPaths.filter(p => p.startsWith("backend/src/modules/")).map(p => p.split("/")[3]))].sort()
    const frameworkRoots = [
      "@medusajs/medusa", "@medusajs/framework", "@medusajs/core-flows", "@medusajs/utils", "@medusajs/payment", "@medusajs/payment-stripe", "@medusajs/auth", "@medusajs/inventory", "@medusajs/locking", "@medusajs/locking-redis", "@medusajs/event-bus-redis", "@medusajs/workflow-engine-redis", "@medusajs/notification-local", "stripe", "express-session", "cors"
    ]
    const versions: Record<string, string> = {}
    for (const name of frameworkRoots) {
      const root = `backend/node_modules/${name}`
      const manifest = resolve(repo, root, "package.json")
      if (!existsSync(manifest)) { skipped.push(root); continue }
      versions[name] = JSON.parse(readFileSync(manifest, "utf8")).version
      add(manifest)
      walk(root, path => extname(path) === ".js" && !/\/(?:__tests__|test|tests)\//.test(path))
    }
    expect(versions["@medusajs/medusa"]).toBe("2.19.0")
    const evidenceRoot = resolve(repo, "ci-evidence")
    // Artifacts are written only in the existing isolated CI evidence directory.
    if (process.env.CI === "true" && existsSync(evidenceRoot)) {
      const output = resolve(evidenceRoot, "audit")
      mkdirSync(output, { recursive: true })
      const sourceSha = existsSync(resolve(evidenceRoot, "source-sha.txt")) ? readFileSync(resolve(evidenceRoot, "source-sha.txt"), "utf8").trim() : "UNVERIFIED"
      const inventory = { baseline, sourceSha, runtime: process.version, routes, modules, versions, applicationPaths, jobs: applicationPaths.filter(p => p.startsWith("backend/src/jobs/")), subscribers: applicationPaths.filter(p => p.startsWith("backend/src/subscribers/")), scripts: applicationPaths.filter(p => p.startsWith("backend/src/scripts/") || p.startsWith("backend/scripts/")), skipped, redactedPaths: Object.keys(files).filter(p => files[p].redacted) }
      writeFileSync(resolve(output, "inventory.json"), JSON.stringify(inventory, null, 2))
      writeFileSync(resolve(output, "source-evidence.json"), JSON.stringify({ baseline, sourceSha, files }))
    }
  }, 60000)
})
