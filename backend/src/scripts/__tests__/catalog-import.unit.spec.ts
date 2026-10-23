import {
  buildCatalog,
  decodeDump,
  parseInserts,
} from "../parse-legacy-db"
import {
  buildProductCreateInput,
  buildProductUpdateInput,
  planStock,
  validateCatalog,
} from "../import-anastasia-catalog"
import type { LegacyProduct } from "../parse-legacy-db"

describe("legacy catalog parser", () => {
  it("parses multiple tuples in one INSERT and preserves escaped strings and nulls", () => {
    const sql = "INSERT [dbo].[ecProduct] ([pk], [productName], [productCode], [notes]) VALUES " +
      "('id-1', N'Lucia''s product', 'SKU-1', NULL), ('id-2', N'Druhý produkt', 'SKU-2', N'text, (with punctuation)')\nGO\n"

    expect(parseInserts(sql, ["ecProduct"]).ecProduct).toEqual([
      { pk: "id-1", productName: "Lucia's product", productCode: "SKU-1", notes: null },
      { pk: "id-2", productName: "Druhý produkt", productCode: "SKU-2", notes: "text, (with punctuation)" },
    ])
  })

  it("decodes UTF-16LE dump content", () => {
    const content = Buffer.from("SELECT N'žluťoučký'", "utf16le")
    const bom = Buffer.from([0xff, 0xfe])
    expect(decodeDump(Buffer.concat([bom, content]))).toBe("SELECT N'žluťoučký'")

    const bigEndian = Buffer.from(content)
    bigEndian.swap16()
    expect(decodeDump(Buffer.concat([Buffer.from([0xfe, 0xff]), bigEndian]))).toBe("SELECT N'žluťoučký'")
  })

  it("builds catalog rows from only selected catalog tables", () => {
    const sql = [
      "INSERT [dbo].[ecProducer] ([pk], [producerName]) VALUES ('brand-1', N'Značka')",
      "INSERT [dbo].[ecCategory] ([pk], [parentCategoryKey], [categoryCode], [categoryName], [categoryUrl], [categoryOrder], [categoryIsVisible]) VALUES ('cat-1', NULL, 'C1', N'Kategória', 'kategoria', 1, 1)",
      "INSERT [dbo].[ecProduct2Category] ([pkProduct], [pkCategory], [productOrder]) VALUES ('prod-1', 'cat-1', 1), ('prod-2', 'cat-1', 2)",
      "INSERT [dbo].[ecProductPrice] ([productKey], [validFrom], [validTo], [vatRate], [price_1_NoVat], [price_1_WithVat]) VALUES ('prod-1', NULL, NULL, 23, 10, 12.3), ('prod-2', NULL, NULL, 23, 20, 24.6)",
      "INSERT [dbo].[ecProduct] ([pk], [productCode], [productName], [productUrl], [productIsVisible], [producerKey], [availablePcs], [productIsNew]) VALUES ('prod-1', 'SKU-1', N'Produkt', 'stary-url', 1, 'brand-1', 3, 0), ('prod-2', 'EP.001', N'Digitálny produkt', 'digital-url', 1, NULL, 0, 0)",
      "INSERT [dbo].[ecCustomer] ([name]) VALUES (N'SYNTHETIC CUSTOMER')",
      "INSERT [dbo].[ecOrder] ([orderNumber]) VALUES (N'SYNTHETIC ORDER')",
    ].join("\n")

    const { catalog, redirects, report } = buildCatalog(sql, "anonymous.sql", new Date("2026-10-09T12:00:00Z"))
    expect(catalog.products).toHaveLength(2)
    expect(catalog.products[0]).toMatchObject({ sku: "SKU-1", handle: "stary-url", price: { amount_with_vat: 12.3 } })
    expect(catalog.products[1]).toMatchObject({ sku: "EP.001", handle: "digital-url" })
    expect(redirects[0]).toMatchObject({ from: "/eshop/produkt/stary-url", to: "/eshop/produkt/stary-url", identity: true })
    expect(report.counts.products).toBe(2)
    // The catalog export shape does not include customer or order tables.
    expect(catalog).not.toHaveProperty("customers")
    expect(catalog).not.toHaveProperty("orders")
  })
})

describe("catalog import planning", () => {
  const product: LegacyProduct = {
    legacy_id: "legacy-1",
    sku: "SKU-1",
    title: "Produkt",
    handle: "stary-handle",
    legacy_url: "stary-handle",
    legacy_path: "/eshop/produkt/stary-handle",
    is_visible: true,
    kind: "physical",
    brand_legacy_id: null,
    brand_name: null,
    category_legacy_ids: [],
    rank: 1,
    description_html: null,
    description_text: null,
    image_path: null,
    meta_title: null,
    meta_description: null,
    availability: "in_stock",
    availability_label: "Skladom",
    is_new: false,
    is_action: false,
    is_sale: false,
    stock_quantity: 4,
    electronic_product_path: null,
    price: { valid_from: null, valid_to: null, vat_rate: 23, amount_no_vat: 10, amount_with_vat: 12.3 },
    price_history: [],
    related_legacy_ids: [],
  }

  const context = {
    categoryIds: new Map<string, string>(),
    categoriesByLegacyId: new Map(),
    brandCollectionIds: new Map<string, string>(),
    productSkusByLegacyId: new Map<string, string>(),
    salesChannelId: "sc_1",
    physicalProfileId: "sp_physical",
    digitalProfileId: "sp_digital",
    options: { mediaBaseUrl: null, descriptionFormat: "html" as const },
  }

  it("plans EUR tax-inclusive price, stock, shipping, and preserves legacy handle", () => {
    const input = buildProductCreateInput(product, context)
    expect(input.handle).toBe("stary-handle")
    expect(input.variants[0].prices).toEqual([{ amount: 12.3, currency_code: "eur" }])
    expect(input.variants[0].manage_inventory).toBe(true)
    expect(input.shipping_profile_id).toBe("sp_physical")
    expect(planStock(product).quantity).toBe(4)
  })

  it("keeps existing entities unchanged unless the matching update flag is enabled", () => {
    const existing = { id: "prod_1", metadata: { preserved: true }, variants: [{ id: "var_1", sku: "SKU-1" }] }
    expect(buildProductUpdateInput(product, existing, context, { update: false, updatePrices: false, updateStatus: false })).toBeNull()
    const update = buildProductUpdateInput(product, existing, context, { update: true, updatePrices: false, updateStatus: false })
    expect(update?.metadata).toMatchObject({ preserved: true, legacy_id: "legacy-1" })
  })

  it("updates every gallery image and remains a no-op on the second update run", () => {
    const galleryProduct = { ...product, image_path: "/one.png", image_paths: ["/one.png", "/two.png"] } as any
    const galleryContext = { ...context, options: { mediaBaseUrl: "https://anastasiaoz.eu", descriptionFormat: "html" as const } }
    const create = buildProductCreateInput(galleryProduct, galleryContext)
    expect(create.images).toEqual([
      { url: "https://anastasiaoz.eu/one.png" },
      { url: "https://anastasiaoz.eu/two.png" },
    ])
    const existing = {
      id: "prod_1", title: create.title, description: create.description, external_id: create.external_id,
      collection_id: null, categories: [], shipping_profile_id: create.shipping_profile_id,
      status: create.status, thumbnail: create.thumbnail, images: create.images,
      metadata: create.metadata, variants: [{ id: "var_1", sku: "SKU-1", prices: [{ amount: 12.3, currency_code: "eur" }] }],
    }
    expect(buildProductUpdateInput(galleryProduct, existing, galleryContext, { update: true, updatePrices: true, updateStatus: true })).toBeNull()
  })

  it("rejects duplicate SKUs and malformed catalog records", () => {
    expect(() => validateCatalog({ currency: "eur", brands: [], categories: [], products: [product, product], coupons: [] })).toThrow(/Duplicitní SKU/)
  })
})
