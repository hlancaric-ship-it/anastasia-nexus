import { guardAdminUpload, uploadProblem } from "../admin/upload-guard"

const png = Buffer.concat([Buffer.from("\x89PNG\r\n\x1a\n", "latin1"), Buffer.alloc(16)])
const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])
const webp = Buffer.concat([Buffer.from("RIFF\0\0\0\0WEBP", "latin1"), Buffer.alloc(8)])
const mp4 = Buffer.concat([Buffer.from("\0\0\0\x18ftypisom", "latin1"), Buffer.alloc(8)])
const file = (originalname: string, mimetype: string, buffer: Buffer) => ({ originalname, mimetype, buffer })

function run(files: unknown) {
  const req: any = { files }
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
  const next = jest.fn()
  guardAdminUpload(req, res, next)
  return { res, next }
}

describe("Nahrávanie do verejného bucketu", () => {
  it("prepustí obrázky a video so zhodným typom, príponou a obsahom", () => {
    const { next } = run([file("a.png", "image/png", png), file("b.JPG", "image/jpeg", jpg), file("c.webp", "image/webp", webp), file("d.mp4", "video/mp4", mp4)])
    expect(next).toHaveBeenCalled()
  })

  it.each([
    [file("x.html", "text/html", Buffer.from("<script>alert(1)</script>")), "FILE_TYPE_NOT_ALLOWED"],
    [file("x.svg", "image/svg+xml", Buffer.from("<svg onload=alert(1)>")), "FILE_TYPE_NOT_ALLOWED"],
    [file("x.png", "image/png", Buffer.from("<html><script>alert(1)</script>")), "FILE_CONTENT_MISMATCH"],
    [file("x.png.html", "image/png", png), "FILE_TYPE_NOT_ALLOWED"],
    [file("x.png", "image/png", Buffer.alloc(0)), "EMPTY_FILE"],
    [file("../x.png", "image/png", png), "INVALID_FILE_NAME"],
  ])("odmietne %#", (f, code) => {
    expect(uploadProblem(f)).toBe(code)
    const { res, next } = run([file("ok.png", "image/png", png), f])
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("bez rozparsovaných súborov alebo s príliš veľa súbormi nič neprepustí", () => {
    expect(run(undefined).next).not.toHaveBeenCalled()
    expect(run(Array.from({ length: 21 }, () => file("a.png", "image/png", png))).next).not.toHaveBeenCalled()
  })
})
