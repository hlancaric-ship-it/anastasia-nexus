import { buildTagCollectionPlan } from "../assign-tag-collections"

const product = (over: Partial<{ id: string; handle: string; title: string; manufacturer: string | null; collection_id: string | null }> = {}) => ({
  id: "prod_1",
  handle: "produkt",
  title: "Produkt",
  manufacturer: "FARMACIA CARE",
  collection_id: null,
  ...over,
})

describe("priradenie produktov ku značkovým kolekciám", () => {
  it("naviaže produkt na kolekciu podľa značky (výrobcu) zo starého e-shopu", () => {
    const plan = buildTagCollectionPlan({
      products: [product({ id: "prod_1", handle: "krem" })],
      collections: [{ id: "pcol_1", title: "FARMACIA CARE", handle: "farmacia-care" }],
    })
    expect(plan.assignments).toEqual([{ product_id: "prod_1", product_handle: "krem", collection_handle: "farmacia-care" }])
    expect(plan.createCollections).toEqual([])
  })

  it("založí chýbajúcu kolekciu s handlem ako pri importe", () => {
    const plan = buildTagCollectionPlan({
      products: [product({ manufacturer: "ORION PHARMA" })],
      collections: [],
    })
    expect(plan.createCollections).toEqual([{ title: "ORION PHARMA", handle: "orion-pharma" }])
    expect(plan.assignments[0]?.collection_handle).toBe("orion-pharma")
  })

  it("je idempotentní: druhý beh nič nemení", () => {
    const first = buildTagCollectionPlan({ products: [product()], collections: [] })
    expect(first.assignments).toHaveLength(1)
    const second = buildTagCollectionPlan({
      products: [product({ collection_id: "pcol_1" })],
      collections: [{ id: "pcol_1", title: "FARMACIA CARE", handle: "farmacia-care" }],
    })
    expect(second.assignments).toHaveLength(0)
    expect(second.createCollections).toHaveLength(0)
    expect(second.unchanged).toBe(1)
  })

  it("nerozlišuje veľkosť písmen v názve značky", () => {
    const plan = buildTagCollectionPlan({
      products: [product({ manufacturer: "farmacia care" })],
      collections: [{ id: "pcol_1", title: "FARMACIA CARE", handle: "farmacia-care" }],
    })
    expect(plan.assignments[0]?.collection_handle).toBe("farmacia-care")
    expect(plan.createCollections).toHaveLength(0)
  })

  it("produkt bez značky sa nepriradzuje, ale je vypísaný", () => {
    const plan = buildTagCollectionPlan({ products: [product({ manufacturer: null })], collections: [] })
    expect(plan.assignments).toHaveLength(0)
    expect(plan.withoutTag).toEqual([{ product_id: "prod_1", product_handle: "produkt" }])
  })

  it("duplicitná značka nevytvorí druhú kolekciu", () => {
    const plan = buildTagCollectionPlan({
      products: [product({ id: "prod_1" }), product({ id: "prod_2", handle: "dalsi" })],
      collections: [],
    })
    expect(plan.createCollections).toHaveLength(1)
    expect(plan.assignments).toHaveLength(2)
  })
})
