import { POST } from "../route"

const response = () => {
  const res: any = { headers: {} as Record<string, string> }
  res.setHeader = (k: string, v: string) => { res.headers[k] = v }
  res.status = jest.fn(() => res)
  res.json = jest.fn((b: unknown) => { res.body = b; return res })
  return res
}

describe("POST /admin/newsletter/preview", () => {
  it("bez prihláseného správcu vráti 401 a nič nevykreslí", async () => {
    const res = response()
    await POST({ body: { body_html: "<p>x</p>" } } as any, res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.body.html).toBeUndefined()
  })

  it("vykreslí serverovú šablónu zo sanitizovaného obsahu", async () => {
    const res = response()
    await POST({ auth_context: { actor_type: "user", actor_id: "u1" }, body: { subject: "Október", body_html: '<p>Ahoj</p><script>alert(1)</script><hr data-nl="dark"><h2>Tip</h2><p data-nl="quote">Pokoj</p>' } } as any, res)
    expect(res.headers["Cache-Control"]).toBe("no-store")
    expect(res.body.html).toContain("/assets/newsletter-hero.jpg")
    expect(res.body.html).toContain("Pokoj</div>")
    expect(res.body.html).not.toContain("<script")
    expect(res.body.html).not.toContain("alert(1)")
  })

  it("neplatné vstupy nespadnú", async () => {
    const res = response()
    await POST({ auth_context: { actor_type: "user", actor_id: "u1" }, body: { subject: 5, body_html: { x: 1 } } } as any, res)
    expect(typeof res.body.html).toBe("string")
  })
})
