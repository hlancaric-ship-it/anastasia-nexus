import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { runInNewContext } from "node:vm"

const docs = resolve(__dirname, "../../../../..", "docs/wp")
const markdown = readFileSync(resolve(docs, "qr-redirects.md"), "utf8")
const snippet = markdown.match(/```js\n([\s\S]*?)\n```/)![1]
const redirect = runInNewContext(`${snippet}\ncanonicalRedirect`, { URL, Response }) as (request: Request) => Response | null

describe("documented edge proposal", () => {
  it("preserves encoded legacy query and target path in one 301 hop", () => {
    const response = redirect(new Request("http://anastasiaoz.eu/eshop/kosik?produkt=KO.001&kupon=A%2BB%26C&ks=2"))!
    expect(response.status).toBe(301)
    expect(response.headers.get("Location")).toBe("https://www.anastasiaoz.eu/eshop/kosik?produkt=KO.001&kupon=A%2BB%26C&ks=2")
    expect(redirect(new Request(response.headers.get("Location")!))).toBeNull()
  })
  it("does not redirect foreign hosts or mutations", () => {
    expect(redirect(new Request("http://evil.example/kosik"))).toBeNull()
    expect(redirect(new Request("http://anastasiaoz.eu/kosik", { method: "POST" }))).toBeNull()
  })
  it("covers 39 GSC rows and four QR variants without loops or lost paths", () => {
    const lines = readFileSync(resolve(docs, "redirects-map.csv"), "utf8").trim().split(/\r?\n/).slice(1)
    expect(lines).toHaveLength(43)
    for (const line of lines) {
      const [source, target, action, status] = line.split(",")
      expect(new URL(source).pathname).toBe(new URL(target).pathname)
      const response = redirect(new Request(source))
      if (action === "KEEP") { expect(response).toBeNull(); expect(status).toBe("200") }
      else { expect(response?.status).toBe(301); expect(response?.headers.get("Location")).toBe(target) }
    }
  })
})
