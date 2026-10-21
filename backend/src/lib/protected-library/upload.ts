import { randomBytes } from "node:crypto"
import { z } from "zod"

/**
 * Nahrávanie chránených súborov digitálnych produktov (A-07).
 *
 * Pravidlá sú tu, aby sa nedali obísť na strane klienta:
 *  - povolený je len zoznam typov nižšie (platený obsah sa nesmie stiahnuť),
 *  - limit veľkosti je na súbor, nie na dávku,
 *  - kľúč objektu si vymyšľa server, klient posiela iba meno súboru.
 */

export type ProtectedUploadKind = "video" | "audio" | "document"

export type ProtectedUploadType = {
  /** Druh obsahu prehrávača a prehliadača. */
  kind: ProtectedUploadKind
  /** Najväčšia povolená veľkosť súboru v bajtoch. */
  maxBytes: number
  /** MIME typ, ktorý sa uloží do R2 a podľa ktorého sa súbor doručuje. */
  contentType: string
}

/**
 * Povolené typy. ZIP a EPUB sú zámerne vynechané: platený obsah sa nesmie
 * sťahovať, PDF sa zobrazuje len v náhlade v prehliadači.
 */
export const PROTECTED_UPLOAD_TYPES: Readonly<Record<string, ProtectedUploadType>> = Object.freeze({
  mp4: { kind: "video", maxBytes: 2 * 1024 * 1024 * 1024, contentType: "video/mp4" },
  mp3: { kind: "audio", maxBytes: 200 * 1024 * 1024, contentType: "audio/mpeg" },
  m4a: { kind: "audio", maxBytes: 200 * 1024 * 1024, contentType: "audio/mp4" },
  pdf: { kind: "document", maxBytes: 200 * 1024 * 1024, contentType: "application/pdf" },
})

/** Zoznam povolených prípon na jednom mieste (hlásenia aj kontrola klienta). */
export const PROTECTED_UPLOAD_EXTENSIONS: readonly string[] = Object.freeze(Object.keys(PROTECTED_UPLOAD_TYPES))

export const libraryUploadRequest = z.object({
  filename: z.string().trim().min(1).max(200),
  size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  content_type: z.string().trim().max(120).optional(),
}).strict()

export const libraryAttachRequest = z.object({
  key: z.string().trim().min(1).max(300),
  // Názov je voliteľný: keď ho Lucia nechá prázdny, server ho odvodí z kľúča.
  title: z.string().trim().max(200).refine((s) => !/[\u0000-\u001f\u007f]/.test(s)).optional(),
}).strict()

/** Prípona súboru bez bodky, malými písmenami. */
export function uploadExtension(filename: string): string | null {
  const name = String(filename ?? "").trim().toLowerCase()
  const dot = name.lastIndexOf(".")
  if (dot <= 0 || dot === name.length - 1) return null
  const ext = name.slice(dot + 1)
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : null
}

/** Povolený typ nahrávania pre meno súboru, inak null. */
export function uploadType(filename: string): (ProtectedUploadType & { extension: string }) | null {
  const extension = uploadExtension(filename)
  if (!extension) return null
  const type = PROTECTED_UPLOAD_TYPES[extension]
  if (!type) return null
  return { extension, ...type }
}

/** Názov súboru bez prípony pre čitateľný názov v knižnici. */
export function titleFromFilename(filename: string): string {
  const base = String(filename ?? "").trim().split(/[\\/]/).pop() ?? ""
  const withoutExt = base.replace(/\.[^.]+$/, "")
  const cleaned = withoutExt.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
  return (cleaned || base || "Súbor").slice(0, 200)
}

/** Bezpečný slug pre kľúč objektu (latinika, malé písmená, pomlčky). */
export function slugFromFilename(filename: string): string {
  const base = String(filename ?? "").trim().split(/[\\/]/).pop() ?? ""
  const withoutExt = base.replace(/\.[^.]+$/, "")
  const ascii = withoutExt
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
  return ascii.slice(0, 60).replace(/-+$/g, "") || "subor"
}

/** Adresár produktu v bucketu: handle produktu, inak bezpečný náhradný tvar. */
export function productFolder(handle: string | null | undefined, productId: string): string {
  const base = String(handle ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "")
  if (base) return base
  const fallback = String(productId ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40)
  return fallback || "produkt"
}

/** Náhodný suffix kľúča (6 znakov), aby dva súbory s rovnakým menom neprepisali seba. */
export function randomKeySuffix(): string {
  return randomBytes(6).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6).padEnd(6, "0")
}

/** Kľúč objektu: `<adresár-produktu>/<slug-názvu>-<random6>.<ext>`. */
export function buildUploadKey(params: { folder: string; filename: string; suffix?: string }): string {
  const extension = uploadExtension(params.filename)
  if (!extension) throw new Error("UNSUPPORTED_EXTENSION")
  const folder = params.folder.replace(/[^a-z0-9-]/g, "")
  if (!folder) throw new Error("INVALID_FOLDER")
  const slug = slugFromFilename(params.filename)
  const suffix = (params.suffix ?? randomKeySuffix()).replace(/[^a-z0-9]/g, "").slice(0, 6).padEnd(6, "0")
  return `${folder}/${slug}-${suffix}.${extension}`
}

/** Tvar kľúča, ktorý smie vznikať iba z nahrávacieho endpointu. */
const PROTECTED_KEY = /^[a-z0-9][a-z0-9-]{0,59}\/[a-z0-9][a-z0-9-]{0,79}\.[a-z0-9]{1,8}$/

export function isProtectedKeyShape(key: string): boolean {
  return typeof key === "string" && PROTECTED_KEY.test(key)
}

/**
 * Kľúč musí ležať v adresári vlastného produktu a obsahovať len jeden level.
 * Cudzí kľúč sa k produktu nikdy nepripája.
 */
export function keyBelongsToProduct(key: string, folder: string): boolean {
  if (!isProtectedKeyShape(key)) return false
  const prefix = `${folder}/`
  if (!key.startsWith(prefix)) return false
  return !key.slice(prefix.length).includes("/")
}

/** Ľudský text limitu pre chyby v administrácii. */
export function describeLimit(type: ProtectedUploadType): string {
  const mb = type.maxBytes % (1024 * 1024 * 1024) === 0
    ? `${type.maxBytes / (1024 * 1024 * 1024)} GB`
    : `${Math.round(type.maxBytes / (1024 * 1024))} MB`
  return mb
}
