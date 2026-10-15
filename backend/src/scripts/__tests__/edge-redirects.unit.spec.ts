import { buildEdgeRedirects, readRedirectEntities } from "../export-edge-redirects"

const row = (from: string, handle: string) => ({ id: "prod_synthetic", handle, metadata: { legacy_path: from } })

describe("edge redirect export", () => {
  it("exports imported product/category paths without query loss or self redirects", () => {
    const manifest = buildEdgeRedirects([row("/eshop/produkt/Old", "new"), row("/eshop/produkt/same", "same")], [row("/eshop/kategoria/Parent/Old", "category")])
    expect(manifest.redirects).toEqual([
      { from: "/eshop/kategoria/Parent/Old", to: "/eshop/kategoria/parent/category", status: 301, preserve_query: true },
      { from: "/eshop/produkt/Old", to: "/eshop/produkt/new", status: 301, preserve_query: true },
    ])
  })
  it.each(["https://evil.test", "//evil.test/", "/eshop/produkt/a?coupon=SECRET", "/eshop/produkt/a#b", "/eshop/produkt/../a", "/eshop/produkt/a\\b"])("rejects unsafe source %s", (from) => {
    expect(() => buildEdgeRedirects([row(from, "valid")], [])).toThrow()
  })
  it("refuses conflicting targets rather than silently overwriting one", () => {
    expect(() => buildEdgeRedirects([row("/eshop/produkt/old", "one"), row("/eshop/produkt/old", "two")], [])).toThrow("CONFLICTING_REDIRECT_TARGET")
    expect(() => buildEdgeRedirects([row("/eshop/produkt/old", "old"), row("/eshop/produkt/old", "two")], [])).toThrow("CONFLICTING_REDIRECT_TARGET")
  })
  it("refuses chains and cycles", () => {
    expect(() => buildEdgeRedirects([row("/eshop/produkt/a", "b"), row("/eshop/produkt/b", "a")], [])).toThrow("REDIRECT_CHAIN_OR_CYCLE")
  })
  it("does not invent paths for entities without legacy metadata", () => {
    expect(buildEdgeRedirects([{ id: "prod_new", handle: "new" }], []).redirects).toEqual([])
  })
  it("reads past the first database page with deterministic ordering", async () => {
    const graph = jest.fn().mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, i) => row(`/eshop/produkt/p${i}`, `p${i}`)) }).mockResolvedValueOnce({ data: [row("/eshop/produkt/last", "last")] })
    expect(await readRedirectEntities({ graph }, "product", { status: "published" })).toHaveLength(101)
    expect(graph.mock.calls[1][0]).toMatchObject({ filters: { status: "published" }, pagination: { skip: 100, take: 100, order: { id: "ASC" } } })
  })
})
