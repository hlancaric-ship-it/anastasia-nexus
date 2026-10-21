import express from "express"

/**
 * Overí, že kľúč súboru s lomítkom dorazí cez URL v správnej podobe.
 *
 * Administrácia posiela `DELETE /admin/products/:id/protected-media/<escaped key>`,
 * pričom kľúč má tvar `<handle>/<súbor>` (lomítko sa v URL escapuje ako %2F).
 * Test používa rovnakú verziu Expressu, akú používa Medusa (4.x) a overuje,
 * že parameter sa rozluší na pôvodný kľúč – inak by odpojenie súboru v admine
 * nikdy nedosiahlo správny kľúč.
 */
describe("Kľúč chráneného súboru v URL", () => {
  it("prejde cez parameter aj s lomítkom (escaped ako %2F)", async () => {
    const seen: Array<{ id: string; key: string }> = []
    const app = express()
    app.delete("/admin/products/:id/protected-media/:key", (req, res) => {
      seen.push({ id: req.params.id, key: req.params.key })
      res.status(200).json({ id: req.params.id, key: req.params.key })
    })
    const server = app.listen(0, "127.0.0.1")
    await new Promise((resolve) => server.once("listening", resolve))
    try {
      const { port } = server.address() as { port: number }
      const key = "reset-40-plus/lekcia-a1b2c3.mp4"
      const response = await fetch(`http://127.0.0.1:${port}/admin/products/prod_1/protected-media/${encodeURIComponent(key)}`, {
        method: "DELETE",
      })
      const body = (await response.json()) as { key: string }
      expect(response.status).toBe(200)
      expect(body.key).toBe(key)
      expect(seen[0]?.key).toBe(key)
    } finally {
      server.close()
    }
  })
})
