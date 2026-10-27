import { redactProtectedMedia, redactProtectedMediaResponse } from "../protected-media-redaction-middlewares"

const product = {
  id: "prod_1",
  metadata: { protected_media: [{ key: "library/prod_1/secret-uuid.pdf", title: "Kniha" }, { key: 5 }], other: "ok" },
}

function run(body: unknown) {
  const sent: unknown[] = []
  const res: any = { json: (b: unknown) => { sent.push(b); return res } }
  const next = jest.fn()
  redactProtectedMediaResponse({}, res, next)
  expect(next).toHaveBeenCalled()
  res.json(body)
  return sent[0] as any
}

describe("Store API nevracia kľúče chránených médií", () => {
  it("v zozname aj detaile produktu ostane len názov a prípona", () => {
    const list = run({ products: [product], count: 1 })
    expect(JSON.stringify(list)).not.toContain("secret-uuid")
    expect(list.products[0].metadata).toEqual({ protected_media: [{ title: "Kniha", ext: "pdf" }], other: "ok" })
    expect(list.count).toBe(1)
    const detail = run({ product })
    expect(JSON.stringify(detail)).not.toContain("library/")
  })

  it("produkt bez chránených médií sa nemení; nečakaný tvar zoznamu sa vyprázdni", () => {
    expect(redactProtectedMedia({ id: "p", metadata: { a: 1 } })).toEqual({ id: "p", metadata: { a: 1 } })
    expect(redactProtectedMedia({ id: "p", metadata: { protected_media: { key: "x.pdf" } } }).metadata.protected_media).toEqual([])
  })
})
