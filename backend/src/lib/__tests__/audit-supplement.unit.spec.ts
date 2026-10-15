import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, relative, extname } from 'node:path'

describe('audit: supplemental installed dependency and domain evidence', () => {
  it('collects only source files in the isolated CI artifact, without environment or private data', () => {
    const repo = resolve(process.cwd(), '..')
    const roots = ['nexus/core', 'nexus/domains', 'nexus/connectors', 'nexus/migrations', 'nexus/.github', ...['promotion', 'cart', 'customer', 'notification', 'cache-inmemory', 'cache-redis', 'caching', 'event-bus-local', 'workflow-engine-inmemory', 'order', 'region', 'file-s3'].map(p => `backend/node_modules/@medusajs/${p}`)]
    const files: Record<string, { source: string; sha256: string; lines: number; redacted: boolean }> = {}
    const skipped: string[] = []
    const clean = (s: string) => s
      .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, m => m.replace(/[^\n]/g, '*'))
      .replace(/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{12,}\b/g, 'REDACTED_PAYMENT_KEY')
      .replace(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/g, 'REDACTED_KEY')
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, 'REDACTED_JWT')
      .replace(/(\w+:\/\/)[^\s\/:'"`]+:[^\s\/@'"`]+@/g, '$1REDACTED_CREDENTIALS@')
      .replace(/[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, 'REDACTED_EMAIL')
      .replace(/((?:api[_-]?key|secret|password|token)\s*[:=]\s*["'])([^"'\n]{20,})(["'])/gi, '$1REDACTED_LITERAL$3')
    for (const root of roots) {
      const absolute = resolve(repo, root)
      if (!existsSync(absolute)) { skipped.push(root); continue }
      const visit = (dir: string) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          if (e.isSymbolicLink() || e.name === 'node_modules' || e.name.startsWith('.env')) continue
          const p = resolve(dir, e.name)
          if (e.isDirectory()) visit(p)
          else if (e.isFile() && (['.ts', '.js', '.sql', '.yml', '.yaml'].includes(extname(p)) || e.name === 'package.json')) {
            const original = readFileSync(p, 'utf8'), source = clean(original)
            files[relative(repo, p).replace(/\\/g, '/')] = { source, sha256: createHash('sha256').update(original).digest('hex'), lines: original.split('\n').length, redacted: source !== original }
          }
        }
      }
      visit(absolute)
    }
    expect(Object.keys(files).length).toBeGreaterThan(0)
    const output = resolve(repo, 'ci-evidence/audit')
    if (process.env.CI === 'true' && existsSync(resolve(repo, 'ci-evidence'))) {
      mkdirSync(output, { recursive: true })
      writeFileSync(resolve(output, 'source-supplement.json'), JSON.stringify({ files, skipped }))
    }
  })
})
