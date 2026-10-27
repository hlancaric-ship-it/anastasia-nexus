import type { MiddlewareRoute } from "@medusajs/framework/http"

/**
 * Natívne `POST /admin/uploads` uloží čokoľvek do VEREJNÉHO bucketu. HTML alebo SVG so skriptom
 * by sa potom servírovali z domény médií (uložené XSS, phishing pod značkou obchodu).
 * Povolené sú len obrázky a videá, ktoré administrácia reálne nahráva, a typ sa overí
 * podľa obsahu súboru (magic bytes), nie podľa toho, čo tvrdí prehliadač.
 *
 * Beží po multeri jadra Medusy (jadro sa registruje pred projektom), takže `req.files` je naplnené.
 * Chránené médiá (PDF, audio, video kurzov) idú inou cestou – podpísaným nahrávaním do súkromného bucketu.
 */

type Kind = { mime: string[]; ext: string[]; magic: (b: Buffer) => boolean; maxBytes: number }

const MB = 1024 * 1024
const at = (b: Buffer, offset: number, ascii: string) => b.length >= offset + ascii.length && b.toString("latin1", offset, offset + ascii.length) === ascii

const KINDS: Kind[] = [
  { mime: ["image/jpeg"], ext: ["jpg", "jpeg"], maxBytes: 20 * MB, magic: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: ["image/png"], ext: ["png"], maxBytes: 20 * MB, magic: (b) => at(b, 0, "\x89PNG\r\n\x1a\n") },
  { mime: ["image/gif"], ext: ["gif"], maxBytes: 20 * MB, magic: (b) => at(b, 0, "GIF87a") || at(b, 0, "GIF89a") },
  { mime: ["image/webp"], ext: ["webp"], maxBytes: 20 * MB, magic: (b) => at(b, 0, "RIFF") && at(b, 8, "WEBP") },
  { mime: ["image/avif"], ext: ["avif"], maxBytes: 20 * MB, magic: (b) => at(b, 4, "ftyp") && (at(b, 8, "avif") || at(b, 8, "avis")) },
  { mime: ["video/mp4"], ext: ["mp4", "m4v"], maxBytes: 200 * MB, magic: (b) => at(b, 4, "ftyp") },
  { mime: ["video/webm"], ext: ["webm"], maxBytes: 200 * MB, magic: (b) => b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
]

export const UPLOAD_MAX_FILES = 20

export function uploadProblem(file: any): string | null {
  const name = typeof file?.originalname === "string" ? file.originalname : ""
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : ""
  const mime = String(file?.mimetype ?? "").toLowerCase()
  const buffer: Buffer | undefined = Buffer.isBuffer(file?.buffer) ? file.buffer : undefined
  if (!buffer || !buffer.length) return "EMPTY_FILE"
  if (name.length > 200 || /[\\/\0]/.test(name)) return "INVALID_FILE_NAME"
  const kind = KINDS.find((k) => k.mime.includes(mime) && k.ext.includes(ext))
  if (!kind) return "FILE_TYPE_NOT_ALLOWED"
  if (!kind.magic(buffer)) return "FILE_CONTENT_MISMATCH"
  if (buffer.length > kind.maxBytes) return "FILE_TOO_LARGE"
  return null
}

export function guardAdminUpload(req: any, res: any, next: any) {
  const files = Array.isArray(req.files) ? req.files : []
  // Bez rozparsovaných súborov sa nič neprepustí (fail closed) – napr. iné pole než `files`.
  if (!files.length) return res.status(400).json({ type: "invalid_data", message: "Nahrajte obrázok alebo video." })
  if (files.length > UPLOAD_MAX_FILES) return res.status(400).json({ type: "invalid_data", message: `Naraz najviac ${UPLOAD_MAX_FILES} súborov.` })
  for (const file of files) {
    const problem = uploadProblem(file)
    if (problem) {
      return res.status(400).json({ type: "invalid_data", code: problem, message: "Povolené sú len obrázky (JPG, PNG, WEBP, GIF, AVIF) a videá (MP4, WEBM)." })
    }
  }
  return next()
}

export const adminUploadGuardMiddlewares: MiddlewareRoute[] = [
  { matcher: "/admin/uploads", method: ["POST"], middlewares: [guardAdminUpload] },
]
