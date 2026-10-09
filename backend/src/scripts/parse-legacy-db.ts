/**
 * Parser starého e-shopu ANASTASIA (Umbraco + dufeksoft.ecommerce, MS SQL dump DB.sql).
 *
 * Z dumpu vyčte POUZE katalogová data (produkty, kategorie, značky, ceny, sklad, kupóny,
 * elektronické produkty, URL pro 301 mapu). Zákazníky, objednávky, členy, přístupy ani
 * cokoli osobního NEČTE a nevypisuje (ty patří do jiných balíků migrace).
 *
 * Spuštění (mimo Medusu, bez závislostí):
 *   npx ts-node src/scripts/parse-legacy-db.ts <cesta/DB.sql> [výstupní-adresář]
 * Výchozí výstup: data-private/legacy/ (adresář je v .gitignore).
 *
 * Výstup:
 *   catalog.json        produkty, kategorie, značky, kupóny, elektronické produkty (vstup importéru)
 *   redirects-301.json  mapa starých URL -> nové (katalog + Umbraco přesměrování)
 *   parse-report.json   statistiky a varování (co potřebuje lidské rozhodnutí)
 */
import * as fs from "fs"
import * as path from "path"

// ---------------------------------------------------------------------------
// Typy výstupu
// ---------------------------------------------------------------------------

export type LegacyAvailability = "in_stock" | "on_order" | "unavailable"
export type LegacyProductKind = "physical" | "digital" | "service"

export interface LegacyBrand {
  legacy_id: string
  name: string
  handle: string
  description_html: string | null
  web: string | null
}

export interface LegacyCategory {
  legacy_id: string
  parent_legacy_id: string | null
  code: string
  name: string
  /** handle použitelný v Medusa (poslední segment staré URL, ASCII, lowercase) */
  handle: string
  /** původní categoryUrl ze starého e-shopu (může obsahovat '/') */
  legacy_url: string
  /** celá cesta ze starého webu: /eshop/kategoria/<legacy_url> */
  legacy_path: string
  rank: number
  is_active: boolean
  description_html: string | null
  image_path: string | null
  meta_title: string | null
  meta_description: string | null
}

export interface LegacyPrice {
  valid_from: string | null
  valid_to: string | null
  vat_rate: number
  /** cena bez DPH v EUR (hlavní jednotky, ne centy) */
  amount_no_vat: number
  /** koncová cena s DPH v EUR (hlavní jednotky) */
  amount_with_vat: number
}

export interface LegacyProduct {
  legacy_id: string
  sku: string
  title: string
  /** zachovaný handle = poslední segment /eshop/produkt/<handle> (lowercase) */
  handle: string
  legacy_url: string
  legacy_path: string
  is_visible: boolean
  kind: LegacyProductKind
  brand_legacy_id: string | null
  brand_name: string | null
  category_legacy_ids: string[]
  rank: number
  description_html: string | null
  description_text: string | null
  image_path: string | null
  meta_title: string | null
  meta_description: string | null
  availability: LegacyAvailability | null
  availability_label: string | null
  is_new: boolean
  is_action: boolean
  is_sale: boolean
  stock_quantity: number
  /** cesta Umbraco obsahu elektronického produktu (kurz), např. moje-elektronicke-produkty/reset-40-plus */
  electronic_product_path: string | null
  /** aktuálně platná cena (poslední platná řádka) */
  price: LegacyPrice | null
  /** celá historie cen (pro audit) */
  price_history: LegacyPrice[]
  related_legacy_ids: string[]
}

export interface LegacyCoupon {
  legacy_id: string
  code: string
  discount_percent: number
  discount_amount: number
  valid_from: string | null
  valid_until: string | null
  use_multiple: boolean
  cart_min: number
  cart_max: number
  product_codes: string[]
  status_at_parse: "active" | "expired" | "scheduled"
}

export interface LegacyDigitalProduct {
  sku: string
  handle: string
  title: string
  electronic_product_path: string
  /** názvy podstránek kurzu z Umbraco stromu (jen názvy, žádný obsah) */
  content_outline: Array<{ depth: number; name: string; sort_order: number }>
}

export interface LegacyCatalog {
  generated_at: string
  source: { file: string; sha_note: string }
  currency: "eur"
  prices_are_tax_inclusive: true
  company: { name: string | null; ico: string | null; dic: string | null; ic_dph: string | null }
  brands: LegacyBrand[]
  categories: LegacyCategory[]
  products: LegacyProduct[]
  coupons: LegacyCoupon[]
  digital_products: LegacyDigitalProduct[]
}

export interface RedirectEntry {
  type: "product" | "category" | "category_all" | "cms"
  from: string
  /** cílová cesta v novém e-shopu (výchozí = stejná struktura jako ve starém) */
  to: string
  handle?: string
  /** true = cesta se nemění (starý web porovnával cesty bez ohledu na velikost písmen; stačí kanonizace host/protokol) */
  identity: boolean
  note?: string
}

export interface ParseReport {
  generated_at: string
  counts: Record<string, number>
  warnings: string[]
  decisions_needed: string[]
}

// ---------------------------------------------------------------------------
// T-SQL INSERT tokenizer
// ---------------------------------------------------------------------------

export type SqlValue = string | number | boolean | null

export interface SqlRow {
  [column: string]: SqlValue
}

/** Dekóduje dump: UTF-16LE (BOM) i UTF-8, CRLF -> LF. */
export function decodeDump(buf: Buffer): string {
  let text: string
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    text = buf.subarray(2).toString("utf16le")
  } else if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    // UTF-16BE: prohodit bajty
    const swapped = Buffer.from(buf.subarray(2))
    swapped.swap16()
    text = swapped.toString("utf16le")
  } else if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    text = buf.subarray(3).toString("utf8")
  } else {
    text = buf.toString("utf8")
  }
  return text.replace(/\r\n/g, "\n")
}

class Cursor {
  constructor(public s: string, public i: number) {}
  peek(): string {
    return this.s[this.i]
  }
  eof(): boolean {
    return this.i >= this.s.length
  }
  skipWs(): void {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++
  }
}

function readString(c: Cursor): string {
  // c.i je na otevírací apostrof
  c.i++
  let out = ""
  for (;;) {
    if (c.eof()) throw new Error("Neukončený řetězec v SQL")
    const ch = c.s[c.i]
    if (ch === "'") {
      if (c.s[c.i + 1] === "'") {
        out += "'"
        c.i += 2
        continue
      }
      c.i++
      return out
    }
    out += ch
    c.i++
  }
}

function readIdentifierList(c: Cursor): string[] {
  // "([a], [b], [c])"
  c.skipWs()
  if (c.peek() !== "(") throw new Error("Očekávána '(' u seznamu sloupců")
  c.i++
  const cols: string[] = []
  for (;;) {
    c.skipWs()
    if (c.peek() === "[") {
      const end = c.s.indexOf("]", c.i)
      if (end < 0) throw new Error("Neukončený identifikátor")
      cols.push(c.s.slice(c.i + 1, end))
      c.i = end + 1
    } else {
      throw new Error(`Neočekávaný znak v seznamu sloupců: '${c.peek()}'`)
    }
    c.skipWs()
    if (c.peek() === ",") {
      c.i++
      continue
    }
    if (c.peek() === ")") {
      c.i++
      return cols
    }
    throw new Error(`Neočekávaný znak v seznamu sloupců: '${c.peek()}'`)
  }
}

function readValue(c: Cursor): SqlValue {
  c.skipWs()
  const ch = c.peek()
  if (ch === "N" && c.s[c.i + 1] === "'") {
    c.i++
    return readString(c)
  }
  if (ch === "'") return readString(c)
  if (c.s.startsWith("NULL", c.i)) {
    c.i += 4
    return null
  }
  if (c.s.startsWith("CAST(", c.i) || c.s.startsWith("CONVERT(", c.i)) {
    const isCast = c.s.startsWith("CAST(", c.i)
    c.i += isCast ? 5 : 8
    let inner: SqlValue
    let typeName = ""
    if (isCast) {
      inner = readValue(c)
      c.skipWs()
      if (!c.s.startsWith("AS", c.i)) throw new Error("CAST bez AS")
      c.i += 2
      c.skipWs()
      const close = findClosingParen(c.s, c.i)
      typeName = c.s.slice(c.i, close).trim().toLowerCase()
      c.i = close + 1
      return castValue(inner, typeName)
    }
    // CONVERT(type, value[, style])
    const close = findClosingParen(c.s, c.i)
    const body = c.s.slice(c.i, close)
    c.i = close + 1
    const comma = body.indexOf(",")
    typeName = body.slice(0, comma).trim().toLowerCase()
    const sub = new Cursor(body.slice(comma + 1), 0)
    inner = readValue(sub)
    return castValue(inner, typeName)
  }
  if (ch === "0" && (c.s[c.i + 1] === "x" || c.s[c.i + 1] === "X")) {
    let j = c.i + 2
    while (j < c.s.length && /[0-9a-fA-F]/.test(c.s[j])) j++
    const hex = c.s.slice(c.i, j)
    c.i = j
    return hex
  }
  const m = /^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?/.exec(c.s.slice(c.i, c.i + 64))
  if (m) {
    c.i += m[0].length
    return Number(m[0])
  }
  throw new Error(`Neznámý SQL literál na pozici ${c.i}: '${c.s.slice(c.i, c.i + 30)}'`)
}

/** Najde ')' párující otevřenou závorku (c.i je uvnitř závorky); respektuje apostrofy. */
function findClosingParen(s: string, from: number): number {
  let depth = 1
  let inStr = false
  for (let i = from; i < s.length; i++) {
    const ch = s[i]
    if (inStr) {
      if (ch === "'") {
        if (s[i + 1] === "'") i++
        else inStr = false
      }
      continue
    }
    if (ch === "'") inStr = true
    else if (ch === "(") depth++
    else if (ch === ")") {
      depth--
      if (depth === 0) return i
    }
  }
  throw new Error("Neuzavřená závorka")
}

function castValue(v: SqlValue, type: string): SqlValue {
  if (v === null) return null
  if (/^(decimal|numeric|float|real|money|smallmoney|int|bigint|smallint|tinyint)/.test(type)) {
    const n = typeof v === "number" ? v : Number(v)
    if (!Number.isFinite(n)) throw new Error(`Neplatné číslo v CAST: ${String(v)}`)
    return n
  }
  if (/^(datetime|datetime2|smalldatetime|date|datetimeoffset)/.test(type)) {
    // zachová původní naivní čas (bez zóny), např. 2026-09-17T00:00:00.000
    return String(v)
  }
  if (/^bit/.test(type)) return Number(v) !== 0
  return v
}

/**
 * Vyparsuje všechny `INSERT [dbo].[<tabulka>] (...) VALUES (...)` pro vyjmenované tabulky.
 * Vrací řádky jako objekty {sloupec: hodnota}. Ostatní tabulky přeskočí (nečte jejich data).
 */
export function parseInserts(sql: string, tables: string[]): Record<string, SqlRow[]> {
  const wanted = new Set(tables)
  const out: Record<string, SqlRow[]> = {}
  for (const t of tables) out[t] = []

  const header = /^INSERT \[dbo\]\.\[([^\]]+)\] /gm
  let m: RegExpExecArray | null
  while ((m = header.exec(sql))) {
    const table = m[1]
    if (!wanted.has(table)) continue
    const c = new Cursor(sql, header.lastIndex)
    try {
      const cols = readIdentifierList(c)
      c.skipWs()
      if (!sql.startsWith("VALUES", c.i)) throw new Error("Chybí VALUES")
      c.i += 6
      c.skipWs()
      if (c.peek() !== "(") throw new Error("Chybí '(' po VALUES")
      // SQL Server obvykle exportuje jeden INSERT na řádek, ale některé exportéry
      // skládají více tuple do jednoho VALUES. Všechny zpracujeme před hledáním
      // dalšího INSERT, jinak by se další řádky stejné tabulky potichu ztratily.
      for (;;) {
        if (c.peek() !== "(") throw new Error("Chybí '(' u řádku VALUES")
        c.i++
        const row: SqlRow = {}
        for (let k = 0; k < cols.length; k++) {
          row[cols[k]] = readValue(c)
          c.skipWs()
          if (k < cols.length - 1) {
            if (c.peek() !== ",") throw new Error(`Očekávána ',' za sloupcem ${cols[k]}`)
            c.i++
          }
        }
        c.skipWs()
        if (c.peek() !== ")") throw new Error("Očekávána ')' na konci VALUES")
        c.i++
        out[table].push(row)
        c.skipWs()
        if (c.peek() !== ",") break
        const comma = c.i
        c.i++
        c.skipWs()
        if (c.peek() !== "(") {
          // Čárka za statementem není validní SQL INSERT tuple; ponecháme ji
          // parseru dalšího statementu, který vrátí konkrétní chybu syntaxe.
          c.i = comma
          break
        }
      }
      header.lastIndex = c.i
    } catch (err) {
      const line = sql.slice(0, m.index).split("\n").length
      throw new Error(`Chyba parsování INSERT ${table} (řádek ${line}): ${(err as Error).message}`)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Pomocné funkce
// ---------------------------------------------------------------------------

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", ndash: "–", mdash: "—", hellip: "…",
  laquo: "«", raquo: "»", bdquo: "„", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", euro: "€",
  deg: "°", copy: "©", reg: "®", times: "×", middot: "·",
  aacute: "á", Aacute: "Á", eacute: "é", Eacute: "É", iacute: "í", Iacute: "Í", oacute: "ó", Oacute: "Ó",
  uacute: "ú", Uacute: "Ú", yacute: "ý", Yacute: "Ý", acirc: "â", ocirc: "ô", Ocirc: "Ô", auml: "ä",
  Auml: "Ä", ouml: "ö", uuml: "ü", ccaron: "č", Ccaron: "Č", scaron: "š", Scaron: "Š", zcaron: "ž",
  Zcaron: "Ž", rcaron: "ř", ncaron: "ň", dcaron: "ď", tcaron: "ť", lacute: "ĺ", Lacute: "Ĺ", racute: "ŕ",
  lcaron: "ľ", Lcaron: "Ľ", ecaron: "ě", uring: "ů",
}

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (full, ent: string) => {
    if (ent[0] === "#") {
      const code = ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10)
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return full
      try {
        return String.fromCodePoint(code)
      } catch {
        return full
      }
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, ent) ? NAMED_ENTITIES[ent] : full
  })
}

/** HTML -> prostý text (pro metadata/SEO, ne pro zobrazení). */
export function htmlToText(html: string | null): string | null {
  if (!html) return null
  const text = decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return text.length ? text : null
}

const str = (v: SqlValue | undefined): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length ? s : null
}
const num = (v: SqlValue | undefined, fallback = 0): number => {
  if (typeof v === "number" && Number.isFinite(v)) return v
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}
const bool = (v: SqlValue | undefined): boolean => v === true || v === 1 || v === "1"
const EMPTY_GUID = "00000000-0000-0000-0000-000000000000"
const guid = (v: SqlValue | undefined): string | null => {
  const s = str(v)
  return s && s.toLowerCase() !== EMPTY_GUID ? s.toLowerCase() : null
}
const round2 = (n: number) => Math.round(n * 100) / 100

/** Staré URL: /eshop/produkt/<url> (ProductContentFinder), /eshop/kategoria/<url> (CategoryContentFinder). */
const PRODUCT_PATH = "/eshop/produkt/"
const CATEGORY_PATH = "/eshop/kategoria/"

/**
 * Služby poznané z kódu produktu (staré členění: L005 konzultace, KONZ.* supervízia, NR.* astrologie,
 * L004/L003 protokoly). Heuristika je záměrně explicitní, výsledek jde do reportu k potvrzení klientkou.
 */
const SERVICE_CODE_PATTERNS: RegExp[] = [/^KONZ\./i, /^NR\./i, /^L00[345]$/i]

export function classifyKind(code: string, electronicPath: string | null): LegacyProductKind {
  if (electronicPath) return "digital"
  if (SERVICE_CODE_PATTERNS.some((r) => r.test(code))) return "service"
  return "physical"
}

function mapAvailability(label: string | null): LegacyAvailability | null {
  if (!label) return null
  const l = slugify(label)
  if (l === "skladom") return "in_stock"
  if (l === "na-objednavku") return "on_order"
  if (l === "nedostupne") return "unavailable"
  return null
}

function splitCodes(v: string | null): string[] {
  if (!v) return []
  return v
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
// Sestavení katalogu
// ---------------------------------------------------------------------------

export interface BuildResult {
  catalog: LegacyCatalog
  redirects: RedirectEntry[]
  report: ParseReport
}

export function buildCatalog(sql: string, sourceFile: string, now: Date = new Date()): BuildResult {
  const t = parseInserts(sql, [
    "ecProduct",
    "ecProducer",
    "ecCategory",
    "ecProduct2Category",
    "ecProductPrice",
    "ecProductRelation",
    "ecAvailability",
    "ecCoupon",
    "ecSysConst",
    "umbracoNode",
    "umbracoRedirectUrl",
  ])
  const warnings: string[] = []
  const decisions: string[] = []

  // --- dostupnost
  const availabilityLabel = new Map<string, string>()
  for (const r of t.ecAvailability) {
    const k = guid(r.pk)
    const n = str(r.availabilityName)
    if (k && n) availabilityLabel.set(k, n)
  }

  // --- značky
  const brandsById = new Map<string, LegacyBrand>()
  const usedBrandHandles = new Set<string>()
  for (const r of t.ecProducer) {
    const id = guid(r.pk)
    const name = str(r.producerName)
    if (!id || !name) {
      warnings.push("Značka bez pk/názvu přeskočena")
      continue
    }
    let handle = slugify(name) || `znacka-${id.slice(0, 8)}`
    if (usedBrandHandles.has(handle)) handle = `${handle}-${id.slice(0, 4)}`
    usedBrandHandles.add(handle)
    brandsById.set(id, {
      legacy_id: id,
      name,
      handle,
      description_html: str(r.producerDescription),
      web: str(r.producerWeb),
    })
  }

  // --- kategorie
  const categories: LegacyCategory[] = []
  const usedCatHandles = new Set<string>()
  for (const r of t.ecCategory) {
    const id = guid(r.pk)
    const name = str(r.categoryName)
    const legacyUrl = str(r.categoryUrl)
    if (!id || !name) {
      warnings.push("Kategorie bez pk/názvu přeskočena")
      continue
    }
    const lastSegment = (legacyUrl ?? name).split("/").filter(Boolean).pop() ?? name
    let handle = slugify(lastSegment) || slugify(name) || `kategorie-${id.slice(0, 8)}`
    if (usedCatHandles.has(handle)) {
      const unique = `${handle}-${id.slice(0, 4)}`
      warnings.push(`Duplicitní handle kategorie '${handle}' -> '${unique}' (${name})`)
      handle = unique
    }
    usedCatHandles.add(handle)
    const url = legacyUrl ?? handle
    categories.push({
      legacy_id: id,
      parent_legacy_id: guid(r.parentCategoryKey),
      code: String(r.categoryCode ?? "").trim(),
      name,
      handle,
      legacy_url: url,
      legacy_path: `${CATEGORY_PATH}${url}`,
      rank: num(r.categoryOrder),
      is_active: bool(r.categoryIsVisible),
      description_html: str(r.categoryDescription),
      image_path: str(r.categoryImg),
      meta_title: str(r.categoryMetaTitle),
      meta_description: str(r.categoryMetaDescription),
    })
  }
  const catIds = new Set(categories.map((c) => c.legacy_id))
  for (const c of categories) {
    if (c.parent_legacy_id && !catIds.has(c.parent_legacy_id)) {
      warnings.push(`Kategorie '${c.name}' odkazuje na neexistujícího rodiče, bude kořenová`)
      c.parent_legacy_id = null
    }
  }
  // detekce cyklu
  for (const c of categories) {
    const seen = new Set<string>([c.legacy_id])
    let p = c.parent_legacy_id
    while (p) {
      if (seen.has(p)) {
        warnings.push(`Cyklus v hierarchii kategorií u '${c.name}', bude kořenová`)
        c.parent_legacy_id = null
        break
      }
      seen.add(p)
      p = categories.find((x) => x.legacy_id === p)?.parent_legacy_id ?? null
    }
  }

  // --- ceny
  const pricesByProduct = new Map<string, LegacyPrice[]>()
  for (const r of t.ecProductPrice) {
    const pid = guid(r.productKey)
    if (!pid) continue
    const price: LegacyPrice = {
      valid_from: str(r.validFrom),
      valid_to: str(r.validTo),
      vat_rate: num(r.vatRate),
      amount_no_vat: round2(num(r.price_1_NoVat)),
      amount_with_vat: round2(num(r.price_1_WithVat)),
    }
    const arr = pricesByProduct.get(pid) ?? []
    arr.push(price)
    pricesByProduct.set(pid, arr)
  }

  const nowIso = now.toISOString().slice(0, 19)
  const pickCurrent = (list: LegacyPrice[]): LegacyPrice | null => {
    const valid = list
      .filter((p) => (!p.valid_from || p.valid_from.slice(0, 19) <= nowIso) && (!p.valid_to || p.valid_to.slice(0, 19) >= nowIso))
      .sort((a, b) => (b.valid_from ?? "").localeCompare(a.valid_from ?? ""))
    return valid[0] ?? null
  }

  // --- vazby produkt-kategorie, související
  const catsByProduct = new Map<string, Array<{ id: string; order: number }>>()
  for (const r of t.ecProduct2Category) {
    const pid = guid(r.pkProduct)
    const cid = guid(r.pkCategory)
    if (!pid || !cid) continue
    const arr = catsByProduct.get(pid) ?? []
    arr.push({ id: cid, order: num(r.productOrder) })
    catsByProduct.set(pid, arr)
  }
  const relatedByProduct = new Map<string, string[]>()
  for (const r of t.ecProductRelation) {
    const a = guid(r.pkProductMain)
    const b = guid(r.pkProductRelated)
    if (!a || !b) continue
    const arr = relatedByProduct.get(a) ?? []
    arr.push(b)
    relatedByProduct.set(a, arr)
  }

  // --- produkty
  const products: LegacyProduct[] = []
  const usedHandles = new Set<string>()
  const usedSkus = new Set<string>()
  for (const r of t.ecProduct) {
    const id = guid(r.pk)
    const sku = str(r.productCode)
    const title = str(r.productName)
    if (!id || !sku || !title) {
      warnings.push(`Produkt bez pk/kódu/názvu přeskočen (${sku ?? id ?? "?"})`)
      continue
    }
    if (usedSkus.has(sku)) {
      warnings.push(`Duplicitní SKU '${sku}' – druhý výskyt přeskočen`)
      continue
    }
    usedSkus.add(sku)

    const legacyUrl = str(r.productUrl) ?? slugify(title)
    // starý web porovnává cestu v lowercase (ProductContentFinder), takže lowercase je bezeztrátové
    let handle = legacyUrl.toLowerCase().replace(/\s+/g, "-")
    if (!/^[a-z0-9][a-z0-9._~-]*$/.test(handle)) {
      const slug = slugify(legacyUrl)
      warnings.push(`Handle '${legacyUrl}' obsahuje nepovolené znaky -> '${slug}' (starou URL pokryje 301)`)
      handle = slug || slugify(title) || `produkt-${id.slice(0, 8)}`
    }
    if (usedHandles.has(handle)) {
      const unique = `${handle}-${sku.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
      warnings.push(`Duplicitní handle '${handle}' -> '${unique}'`)
      handle = unique
    }
    usedHandles.add(handle)

    const electronicPath = str(r.electronicProductWeb)
    const kind = classifyKind(sku, electronicPath)
    const brandId = guid(r.producerKey)
    const brand = brandId ? brandsById.get(brandId) ?? null : null
    if (brandId && !brand) warnings.push(`Produkt ${sku}: neznámá značka ${brandId}`)
    const availLabel = guid(r.availabilityKey) ? availabilityLabel.get(guid(r.availabilityKey)!) ?? null : null
    const priceHistory = (pricesByProduct.get(id) ?? []).sort((a, b) => (a.valid_from ?? "").localeCompare(b.valid_from ?? ""))
    const current = pickCurrent(priceHistory)
    const descHtml = str(r.productDescription)

    if (!current) {
      warnings.push(`Produkt ${sku} (${title}) nemá aktuálně platnou cenu – cena nebude importována`)
    } else {
      const expected = round2(current.amount_no_vat * (1 + current.vat_rate / 100))
      if (Math.abs(expected - current.amount_with_vat) > 0.02) {
        warnings.push(
          `Produkt ${sku}: cena s DPH ${current.amount_with_vat} nesedí na cenu bez DPH ${current.amount_no_vat} × ${current.vat_rate} % (=${expected})`
        )
      }
      if (current.vat_rate !== 23 && current.vat_rate !== 19 && current.vat_rate !== 5) {
        decisions.push(
          `${sku} (${title}): v dumpu sazba DPH ${current.vat_rate} % (SK od 1. 1. 2025 základní 23 %, snížené 19 %/5 %) – potvrdit správnou sazbu a koncovou cenu`
        )
      }
    }
    if (kind === "physical" && num(r.availablePcs) <= 0 && mapAvailability(availLabel) === "in_stock") {
      warnings.push(`Produkt ${sku}: dostupnost 'Skladom', ale sklad 0 ks`)
    }

    products.push({
      legacy_id: id,
      sku,
      title,
      handle,
      legacy_url: legacyUrl,
      legacy_path: `${PRODUCT_PATH}${legacyUrl}`,
      is_visible: bool(r.productIsVisible),
      kind,
      brand_legacy_id: brand?.legacy_id ?? null,
      brand_name: brand?.name ?? null,
      category_legacy_ids: (catsByProduct.get(id) ?? [])
        .filter((c) => catIds.has(c.id))
        .sort((a, b) => a.order - b.order)
        .map((c) => c.id),
      rank: num(r.productOrder),
      description_html: descHtml,
      description_text: htmlToText(descHtml),
      image_path: str(r.productImg),
      meta_title: str(r.productMetaTitle),
      meta_description: str(r.productMetaDescription),
      availability: mapAvailability(availLabel),
      availability_label: availLabel,
      is_new: bool(r.productIsNew),
      is_action: bool(r.productIsAction),
      is_sale: bool(r.productIsSale),
      stock_quantity: Math.max(0, num(r.availablePcs)),
      electronic_product_path: electronicPath,
      price: current,
      price_history: priceHistory,
      related_legacy_ids: relatedByProduct.get(id) ?? [],
    })
  }
  const productIds = new Set(products.map((p) => p.legacy_id))
  for (const p of products) {
    p.related_legacy_ids = p.related_legacy_ids.filter((x) => productIds.has(x))
  }

  // --- kupóny
  const coupons: LegacyCoupon[] = []
  for (const r of t.ecCoupon) {
    const code = str(r.couponCode)
    const id = guid(r.pk)
    if (!code || !id) continue
    const from = str(r.validFrom)
    const until = str(r.validUntil)
    const status: LegacyCoupon["status_at_parse"] =
      until && until.slice(0, 19) < nowIso ? "expired" : from && from.slice(0, 19) > nowIso ? "scheduled" : "active"
    const perc = num(r.discountPerc)
    const amount = num(r.discountAmount)
    if (perc > 0 && amount > 0) warnings.push(`Kupón ${code}: zadané procento i částka – importér použije procento`)
    if (perc <= 0 && amount <= 0) warnings.push(`Kupón ${code}: nulová sleva`)
    const codes = splitCodes(str(r.productCodes))
    for (const pc of codes) {
      if (!usedSkus.has(pc)) warnings.push(`Kupón ${code}: kód produktu '${pc}' v katalogu neexistuje`)
    }
    coupons.push({
      legacy_id: id,
      code,
      discount_percent: perc,
      discount_amount: amount,
      valid_from: from,
      valid_until: until,
      use_multiple: bool(r.useMultiple),
      cart_min: num(r.quotePriceMin),
      cart_max: num(r.quotePriceMax),
      product_codes: codes,
      status_at_parse: status,
    })
  }
  if (coupons.length) {
    decisions.push(
      "Kupóny: NEXUS adapter u řádků vypíná Medusa promoce a nemá ověřenou kupónovou politiku – importér je proto zakládá jen jako neaktivní (draft). Rozhodnout, zda kupóny přenést do NEXUS policy."
    )
  }

  // --- firma
  const sys = t.ecSysConst[0]
  const company = {
    name: str(sys?.companyName),
    ico: str(sys?.companyIco),
    dic: str(sys?.companyDic),
    ic_dph: str(sys?.companyIcdph),
  }

  // --- Umbraco uzly (jen názvy a strom, kvůli osnově kurzů a překladu contentKey)
  interface NodeRow {
    id: number
    uniqueId: string
    parentId: number
    level: number
    sortOrder: number
    text: string
    path: string
    trashed: boolean
  }
  const nodes: NodeRow[] = t.umbracoNode.map((r) => ({
    id: num(r.id),
    uniqueId: String(r.uniqueId ?? "").toLowerCase(),
    parentId: num(r.parentId),
    level: num(r.level),
    sortOrder: num(r.sortOrder),
    text: String(r.text ?? ""),
    path: String(r.path ?? ""),
    trashed: bool(r.trashed),
  }))
  const nodeByUnique = new Map(nodes.map((n) => [n.uniqueId, n]))
  const nodeById = new Map(nodes.map((n) => [n.id, n]))

  const digital: LegacyDigitalProduct[] = []
  for (const p of products.filter((x) => x.kind === "digital")) {
    const seg = p.electronic_product_path!.split("/").filter(Boolean)
    const leaf = seg[seg.length - 1]
    // kořen kurzu = uzel, jehož URL segment (slug textu) odpovídá poslednímu segmentu a nemá smazaný stav
    const root = nodes.find((n) => !n.trashed && slugify(n.text) === slugify(leaf) && n.path.split(",").length >= 4)
    const outline: LegacyDigitalProduct["content_outline"] = []
    if (root) {
      const rootDepth = root.path.split(",").length
      const children = nodes
        .filter((n) => !n.trashed && n.id !== root.id && n.path.split(",").includes(String(root.id)))
        .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }) || a.sortOrder - b.sortOrder)
      for (const n of children) {
        outline.push({ depth: n.path.split(",").length - rootDepth, name: n.text, sort_order: n.sortOrder })
      }
    } else {
      warnings.push(`Digitální produkt ${p.sku}: v Umbraco stromu nenalezen kořen '${leaf}'`)
    }
    digital.push({
      sku: p.sku,
      handle: p.handle,
      title: p.title,
      electronic_product_path: p.electronic_product_path!,
      content_outline: outline,
    })
  }
  if (digital.length) {
    decisions.push(
      "Digitální produkty (RESET 40+ aj.): Medusa nemá entitlement – přístup k obsahu kurzu a doručení po zaplacení řeší jiný balík (NEXUS-INTEGRATION: post-payment digital delivery zatím neexistuje). Importér je zakládá bez shipping profilu a bez správy skladu."
    )
  }
  const services = products.filter((p) => p.kind === "service")
  if (services.length) {
    decisions.push(
      `Služby poznané z kódu (${services.map((s) => s.sku).join(", ")}) se zakládají bez dopravy a skladu – potvrdit klasifikaci s klientkou.`
    )
  }

  // --- 301 mapa
  const redirects: RedirectEntry[] = []
  for (const p of products) {
    const to = `${PRODUCT_PATH}${p.handle}`
    redirects.push({
      type: "product",
      from: p.legacy_path,
      to,
      handle: p.handle,
      identity: p.legacy_path.toLowerCase() === to,
      note: p.is_visible ? undefined : "produkt je ve starém e-shopu skrytý (draft) – nasadit až po rozhodnutí o publikaci",
    })
  }
  for (const c of categories) {
    // zachovat starou plochou strukturu /eshop/kategoria/<url>; poslední segment = handle v Medusě
    const segs = c.legacy_url.split("/").filter(Boolean)
    segs[segs.length - 1] = c.handle
    const to = `${CATEGORY_PATH}${segs.map((x, i) => (i === segs.length - 1 ? x : x.toLowerCase())).join("/")}`
    redirects.push({
      type: "category",
      from: c.legacy_path,
      to,
      handle: c.handle,
      identity: c.legacy_path.toLowerCase() === to,
      note: c.is_active ? undefined : "kategorie je ve starém e-shopu skrytá",
    })
  }
  redirects.push({
    type: "category_all",
    from: `${CATEGORY_PATH}-vsetko-`,
    to: `${CATEGORY_PATH}-vsetko-`,
    identity: true,
    note: "výpis celého katalogu – storefront musí tuto cestu obsloužit (nebo 301 na hlavní výpis)",
  })
  for (const r of t.umbracoRedirectUrl) {
    const from = str(r.url)
    if (!from) continue
    const node = nodeByUnique.get(String(r.contentKey ?? "").toLowerCase())
    const parent = node ? nodeById.get(node.parentId) : undefined
    redirects.push({
      type: "cms",
      from,
      to: "",
      identity: false,
      note: `Umbraco redirect -> uzel '${node?.text ?? "?"}'${parent ? ` (v '${parent.text}')` : ""}; cíl doplnit v balíku CMS/SEO`,
    })
  }

  // --- reporty
  const counts: Record<string, number> = {
    brands: brandsById.size,
    categories: categories.length,
    products: products.length,
    products_visible: products.filter((p) => p.is_visible).length,
    products_physical: products.filter((p) => p.kind === "physical").length,
    products_digital: products.filter((p) => p.kind === "digital").length,
    products_service: products.filter((p) => p.kind === "service").length,
    products_without_price: products.filter((p) => !p.price).length,
    coupons: coupons.length,
    redirects: redirects.length,
  }

  return {
    catalog: {
      generated_at: now.toISOString(),
      source: { file: path.basename(sourceFile), sha_note: "viz parse-report.json" },
      currency: "eur",
      prices_are_tax_inclusive: true,
      company,
      brands: [...brandsById.values()],
      categories,
      products,
      coupons,
      digital_products: digital,
    },
    redirects,
    report: { generated_at: now.toISOString(), counts, warnings, decisions_needed: decisions },
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function runCli(argv: string[]): void {
  const input = argv[0]
  if (!input) {
    throw new Error("Použití: ts-node src/scripts/parse-legacy-db.ts <DB.sql> [výstupní-adresář]")
  }
  const outDir = path.resolve(argv[1] ?? path.join(process.cwd(), "data-private", "legacy"))
  const sql = decodeDump(fs.readFileSync(path.resolve(input)))
  const { catalog, redirects, report } = buildCatalog(sql, input)

  fs.mkdirSync(outDir, { recursive: true })
  const write = (name: string, data: unknown) =>
    fs.writeFileSync(path.join(outDir, name), JSON.stringify(data, null, 2) + "\n", { encoding: "utf8", mode: 0o600 })
  write("catalog.json", catalog)
  write("redirects-301.json", redirects)
  write("parse-report.json", report)

  // eslint-disable-next-line no-console
  console.log(
    `OK: ${report.counts.products} produktů, ${report.counts.categories} kategorií, ${report.counts.brands} značek, ` +
      `${report.counts.coupons} kupónů -> ${outDir}\nVarování: ${report.warnings.length}, rozhodnutí k potvrzení: ${report.decisions_needed.length}`
  )
}

if (require.main === module) {
  try {
    runCli(process.argv.slice(2))
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error((err as Error).message)
    process.exit(1)
  }
}
