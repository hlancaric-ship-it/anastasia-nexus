import type { MiddlewareRoute } from "@medusajs/framework/http"

/**
 * Store API nevracia kľúče objektov chránených médií (`metadata.protected_media[].key`).
 * Kľúč sám prístup nedáva (súkromný bucket + krátky podpísaný odkaz po overení nároku),
 * ale pri chybnom nastavení bucketu by bol priamou adresou platného obsahu.
 * Storefront potrebuje len názov a príponu (ikona a popis obsahu balíka).
 */
export function redactProtectedMedia(product: any): any {
  const list = product?.metadata?.protected_media
  if (list === undefined) return product
  const safe = (Array.isArray(list) ? list : [])
    .filter((item: any) => item && typeof item.key === "string")
    .map((item: any) => ({
      title: typeof item.title === "string" ? item.title.slice(0, 200) : "",
      ext: (item.key.match(/\.([a-z0-9]{2,4})$/i)?.[1] ?? "").toLowerCase(),
    }))
  return { ...product, metadata: { ...product.metadata, protected_media: safe } }
}

export function redactProtectedMediaResponse(_req: any, res: any, next: any) {
  const json = res.json.bind(res)
  res.json = (body: any) => {
    try {
      if (body && Array.isArray(body.products)) body = { ...body, products: body.products.map(redactProtectedMedia) }
      else if (body && body.product) body = { ...body, product: redactProtectedMedia(body.product) }
    } catch {
      // Pri neočakávanom tvare sa chránený zoznam radšej celý odstráni (fail closed).
      body = JSON.parse(JSON.stringify(body ?? null), (key, value) => (key === "protected_media" ? [] : value))
    }
    return json(body)
  }
  return next()
}

export const protectedMediaRedactionMiddlewares: MiddlewareRoute[] = [
  { matcher: "/store/products", method: ["GET"], middlewares: [redactProtectedMediaResponse] },
  { matcher: "/store/products/:id", method: ["GET"], middlewares: [redactProtectedMediaResponse] },
]
