import { readdirSync } from "node:fs"
import { join, relative } from "node:path"

/**
 * Medusa build (`@medusajs/framework` compiler) vynechá z `.medusa/server` každý adresár s menom
 * `test`, `unit-tests` alebo `integration-tests`. Route v takom adresári lokálne funguje,
 * ale na serveri neexistuje (preflight 401 bez CORS → v prehliadači „Failed to fetch“).
 */
const EXCLUDED_BY_BUILD = new Set(["test", "unit-tests", "integration-tests"])

function dirs(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "__tests__")
    .flatMap((entry) => {
      const path = join(root, entry.name)
      return [path, ...dirs(path)]
    })
}

describe("API route directories", () => {
  it("never use names the Medusa build drops", () => {
    const root = join(__dirname, "..")
    const dropped = dirs(root)
      .filter((path) => EXCLUDED_BY_BUILD.has(path.split(/[\\/]/).pop() as string))
      .map((path) => relative(root, path))
    expect(dropped).toEqual([])
  })
})
