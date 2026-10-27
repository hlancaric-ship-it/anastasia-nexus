import { readdirSync, readFileSync } from "fs"
import { join } from "path"

/**
 * Medusa registruje subscriber pod `config.context.subscriberId`, inak pod názvom default funkcie.
 * Dva subscribery s rovnakým ID zhodia štart servera („Subscriber with id handler already exists“),
 * čo 27. 10. 2026 zablokovalo nasadenie na Medusa Cloud.
 */
describe("ID subscriberov sú jedinečné", () => {
  const dir = join(__dirname, "..")
  const ids = readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => {
      const src = readFileSync(join(dir, f), "utf8")
      const explicit = src.match(/subscriberId\s*:\s*["'`]([^"'`]+)["'`]/)?.[1]
      const fn = src.match(/export\s+default\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/)?.[1]
      return { file: f, id: explicit ?? fn ?? `<anonymous:${f}>` }
    })

  it("žiadne dva subscribery nemajú rovnaké ID", () => {
    const seen = new Map<string, string[]>()
    for (const { file, id } of ids) seen.set(id, [...(seen.get(id) ?? []), file])
    const dup = [...seen].filter(([, files]) => files.length > 1)
    expect(dup).toEqual([])
  })

  it("žiadny subscriber nemá anonymnú ani generickú default funkciu bez subscriberId", () => {
    expect(ids.filter(({ id }) => id === "handler" || id.startsWith("<anonymous"))).toEqual([])
  })
})
