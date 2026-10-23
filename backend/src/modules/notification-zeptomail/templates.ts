/**
 * Šablony transakčních e-mailů (SK). Vstupem jsou jen data, která posílá backend
 * (`createNotifications({ template, data })`); veškerý text z dat se escapuje.
 * Neznámá šablona vyhodí chybu – raději nedoručený e-mail než prázdný.
 *
 * Texty (předmět, nadpis, odstavce, popisky tlačítek) jsou „sloty“ s výchozí hodnotou v kódu.
 * Správkyně je může přepsat z adminu (modul `email-template`); přepis přijde v `data.texts`.
 * Přepsat jde jen text – rozvržení, barvy, tabulka položek, kód poukazu a odkazy zůstávají v kódu,
 * takže úprava textu nerozbije vzhled. V textu smí být jen proměnné ze seznamu dané šablony (`{nazov}`).
 */

export type RenderedEmail = { subject: string; html: string; text: string }

type Data = Record<string, unknown>
type Row = { label: string; value: string; strong?: boolean }
type Block =
  | { kind: "p"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "code"; label: string; value: string }
  | { kind: "rows"; rows: Row[] }
type Body = { subject: string; heading: string; blocks: Block[]; button?: { label: string; url: string } | null }

export type SlotKind = "line" | "text"
export type SlotDef = { key: string; label: string; default: string; kind: SlotKind; optional?: boolean }
export type PlaceholderDef = { key: string; label: string }
export type TemplateDef = {
  name: string
  label: string
  description: string
  /** Zákazník ho potřebuje vždy (přihlášení, doručení poukazu) – v adminu nejde vypnout. */
  required: boolean
  audience: "customer" | "admin"
  placeholders: PlaceholderDef[]
  slots: SlotDef[]
  /** Syntetická data pro náhled v adminu (žádné skutečné osobní údaje). */
  sample: Data
}

const TIME_ZONE = "Europe/Bratislava"
const BRAND = "ANASTASIA"
const ACCENT = "#2d4936"
const LAVENDER = "#b8a0ce"
const CREAM = "#f7f2e8"
const SURFACE = "#fffcf8"
const INK = "#191b18"
const MUTED = "#625f59"
const LOGO_URL = "https://media.anastasiaoz.eu/logo-mark.png"

export const SLOT_MAX_LENGTH: Record<SlotKind, number> = { line: 160, text: 1000 }

export class UnknownTemplateError extends Error {
  constructor(template: string) {
    super(`Unknown e-mail template "${template}"`)
    this.name = "UnknownTemplateError"
  }
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!)
}

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null)
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null)
const own = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key)

/** Jen http(s) odkazy – cokoli jiného (javascript:, data:, relativní cesta) tlačítko nevykreslí. */
export function safeUrl(value: unknown): string | null {
  const raw = str(value)
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null
  } catch {
    return null
  }
}

function parseDate(value: unknown): Date | null {
  const raw = value instanceof Date ? value : str(value)
  if (!raw) return null
  const date = raw instanceof Date ? raw : new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(value: unknown): string | null {
  const date = parseDate(value)
  return date ? new Intl.DateTimeFormat("sk-SK", { timeZone: TIME_ZONE, day: "numeric", month: "numeric", year: "numeric" }).format(date) : null
}

export function formatTime(value: unknown): string | null {
  const date = parseDate(value)
  return date ? new Intl.DateTimeFormat("sk-SK", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(date) : null
}

function bookingTerm(data: Data): string | null {
  const day = formatDate(data.starts_at)
  const from = formatTime(data.starts_at)
  const to = formatTime(data.ends_at)
  if (!day || !from) return null
  return to ? `${day} od ${from} do ${to}` : `${day} o ${from}`
}

// ---------------------------------------------------------------------------------------------
// Sloty a proměnné
// ---------------------------------------------------------------------------------------------

const PLACEHOLDER_RE = /\{([a-z][a-z0-9_]{0,39})\}/g
const line = (key: string, label: string, value: string, optional = false): SlotDef => ({ key, label, default: value, kind: "line", optional })
const text = (key: string, label: string, value: string, optional = false): SlotDef => ({ key, label, default: value, kind: "text", optional })
const SUBJECT = (value: string) => line("subject", "Predmet e-mailu", value)
const HEADING = (value: string) => line("heading", "Nadpis", value)

const P = {
  order: { key: "cislo_objednavky", label: "Číslo objednávky" },
  total: { key: "suma", label: "Suma" },
  term: { key: "termin", label: "Termín konzultácie" },
  name: { key: "meno", label: "Krstné meno" },
  ttl: { key: "platnost_minut", label: "Platnosť odkazu v minútach" },
  expires: { key: "platny_do", label: "Dátum platnosti" },
  amount: { key: "hodnota", label: "Hodnota poukazu" },
  messages: { key: "pocet_sprav", label: "Počet nových správ" },
  conversations: { key: "pocet_konverzacii", label: "Počet konverzácií" },
  tracking: { key: "cislo_zasielky", label: "Číslo zásielky" },
  received: { key: "datum_prijatia", label: "Dátum prijatia" },
  email: { key: "email", label: "E-mail zákazníka" },
  items: { key: "polozky", label: "Položky odstúpenia" },
  orderDate: { key: "datum_objednavky", label: "Dátum objednávky" },
  receivedTime: { key: "cas_prijatia", label: "Čas prijatia" },
} satisfies Record<string, PlaceholderDef>

type Vars = Record<string, string | null>
type T = (key: string) => string | null

const tidy = (value: string) => value.replace(/[ \t]{2,}/g, " ").replace(/\s+([.,!?])/g, "$1").trim()

/**
 * Vykreslení slotu: přepis ze `data.texts` (je-li platný), jinak výchozí text.
 * Vrací null, když text obsahuje proměnnou bez hodnoty – šablona pak odstavec vynechá nebo použije náhradní slot.
 * Povinný slot (`optional` false) null vrátí jen přes náhradní větev šablony; sám padne na výchozí text,
 * v krajním případě s vynechanou proměnnou.
 */
function slotResolver(def: TemplateDef, overrides: Record<string, string>, vars: Vars): T {
  const fill = (template: string): string | null => {
    let missing = false
    const out = template.replace(PLACEHOLDER_RE, (_m, key: string) => {
      const value = own(vars, key) ? vars[key] : null
      if (value == null || value === "") missing = true
      return value ?? ""
    })
    return missing ? null : out
  }
  return (key: string) => {
    const slot = def.slots.find(s => s.key === key)
    if (!slot) throw new Error(`Unknown slot "${key}" in ${def.name}`)
    if (own(overrides, key)) {
      const override = overrides[key]
      if (override === "" && slot.optional) return null
      const value = override === "" ? null : fill(override)
      if (value !== null) return value
    }
    return fill(slot.default)
  }
}

/** Povinný text: když chybí proměnná, vynechá ji (nikdy nevrátí prázdný předmět/nadpis/tlačítko). */
function required(def: TemplateDef, t: T, key: string, vars: Vars): string {
  const value = t(key)
  if (value) return value
  const slot = def.slots.find(s => s.key === key)!
  return tidy(slot.default.replace(PLACEHOLDER_RE, (_m, k: string) => vars[k] ?? "")) || BRAND
}

export type TextsValidation = { ok: true; texts: Record<string, string> } | { ok: false; errors: string[] }

/**
 * Validace přepisů z adminu. Prázdný řetězec u volitelného slotu = odstavec vypnout,
 * `null` nebo text shodný s výchozím = přepis odstranit. Neznámá proměnná, nový řádek v jednořádkovém
 * slotu nebo překročená délka = chyba (raději odmítnout uložení než poslat rozbitý e-mail).
 */
export function validateTexts(template: string, input: unknown): TextsValidation {
  const def = BY_NAME.get(template)
  if (!def) return { ok: false, errors: ["UNKNOWN_TEMPLATE"] }
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, errors: ["texts: očakáva sa objekt"] }
  const allowed = new Set(def.placeholders.map(p => p.key))
  const errors: string[] = []
  const texts: Record<string, string> = {}
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    const slot = def.slots.find(s => s.key === key)
    if (!slot) { errors.push(`${key}: neznámy text`); continue }
    if (raw === null || raw === undefined) continue
    if (typeof raw !== "string") { errors.push(`${key}: očakáva sa text`); continue }
    // eslint-disable-next-line no-control-regex
    const value = raw.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim()
    if (value === slot.default) continue
    if (!value && !slot.optional) { errors.push(`${key}: text nesmie byť prázdny`); continue }
    if (slot.kind === "line" && value.includes("\n")) { errors.push(`${key}: musí byť v jednom riadku`); continue }
    if (value.length > SLOT_MAX_LENGTH[slot.kind]) { errors.push(`${key}: najviac ${SLOT_MAX_LENGTH[slot.kind]} znakov`); continue }
    const unknown = [...value.matchAll(PLACEHOLDER_RE)].map(m => m[1]).filter(k => !allowed.has(k))
    if (unknown.length) { errors.push(`${key}: neznáma premenná {${unknown[0]}}`); continue }
    texts[key] = value
  }
  return errors.length ? { ok: false, errors } : { ok: true, texts }
}

/** Přepisy z dat notifikace – co neprojde validací (např. po změně šablony v kódu), se tiše ignoruje. */
function overridesFrom(def: TemplateDef, value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const out: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== "string") continue
    const single = validateTexts(def.name, { [key]: raw })
    if (single.ok && own(single.texts, key)) out[key] = single.texts[key]
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Šablony
// ---------------------------------------------------------------------------------------------

type R = (key: string) => string
type Builder = (data: Data, t: T, r: R) => Body
type Entry = TemplateDef & { vars: (data: Data) => Vars; build: Builder }

const ORDER_SAMPLE = {
  order_display_id: "1042",
  first_name: "Jana",
  total: "89,00 €",
  items: [
    { title: "Online kurz RESET 40+", quantity: 1, total: "59,00 €" },
    { title: "Konzultácia 60 min", quantity: 1, total: "30,00 €" },
  ],
  subtotal: "89,00 €",
  shipping_total: null,
  discount_total: null,
  paid: true,
  url: "https://anastasiaoz.eu/ucet/objednavky",
}

const orderVars = (data: Data): Vars => ({
  cislo_objednavky: str(data.order_display_id) ?? (num(data.order_display_id) != null ? String(num(data.order_display_id)) : null),
  suma: str(data.total) ?? str(data.amount),
  meno: str(data.first_name),
})

function orderRows(data: Data, r: R): Row[] {
  const items = Array.isArray(data.items) ? data.items.slice(0, 50) : []
  const rows: Row[] = []
  for (const item of items) {
    if (!item || typeof item !== "object") continue
    const title = str((item as Data).title)
    if (!title) continue
    const qty = num((item as Data).quantity)
    rows.push({ label: qty && qty !== 1 ? `${title} × ${qty}` : title, value: str((item as Data).total) ?? "" })
  }
  const subtotal = str(data.subtotal)
  const shipping = str(data.shipping_total)
  const discount = str(data.discount_total)
  const total = str(data.total)
  if (rows.length && subtotal && (shipping || discount)) rows.push({ label: r("label_subtotal"), value: subtotal })
  if (shipping) rows.push({ label: r("label_shipping"), value: shipping })
  if (discount) rows.push({ label: r("label_discount"), value: `−${discount}` })
  if (total) rows.push({ label: r("label_total"), value: total, strong: true })
  return rows
}

const PAYMENT_LABEL: Record<string, string> = { cod: "Na dobierku", card: "Kartou online", bank_transfer: "Prevodom na účet" }

function methodRows(data: Data, r: R): Block[] {
  const rows: Row[] = []
  const shipping = str(data.shipping_method)
  const payment = PAYMENT_LABEL[str(data.payment_method) ?? ""]
  if (shipping) rows.push({ label: r("label_shipping_method"), value: oneLine(shipping) })
  if (payment) rows.push({ label: r("label_payment_method"), value: payment })
  return rows.length ? [{ kind: "rows", rows }] : []
}

/** Text o platbe: zaplatené / prevod s platobnými údajmi / dobierka / iné nezaplatené. */
function paymentBlocks(data: Data, t: T): Block[] {
  if (data.paid === true) return p(t("paid"))
  const transfer = data.bank_transfer && typeof data.bank_transfer === "object" ? data.bank_transfer as Data : null
  if (data.payment_method === "bank_transfer" && transfer && str(transfer.iban) && str(transfer.variable_symbol)) {
    return [
      ...p(t("bank_transfer") ?? t("unpaid")),
      { kind: "rows", rows: [
        { label: "Príjemca", value: oneLine(str(transfer.beneficiary) ?? "") },
        { label: "Banka", value: oneLine(str(transfer.bank) ?? "") },
        { label: "IBAN", value: oneLine(str(transfer.iban)!) },
        ...(str(transfer.swift) ? [{ label: "SWIFT/BIC", value: oneLine(str(transfer.swift)!) }] : []),
        { label: "Variabilný symbol", value: oneLine(str(transfer.variable_symbol)!) },
        { label: "Suma", value: oneLine(str(transfer.amount) ?? ""), strong: true },
      ].filter(row => row.value) },
    ]
  }
  if (data.payment_method === "cod") return p(t("cod") ?? t("unpaid"))
  return p(t("unpaid"))
}

const button = (label: string, url: unknown) => (safeUrl(url) ? { label, url: safeUrl(url)! } : null)
const p = (value: string | null): Block[] => (value ? [{ kind: "p", text: value }] : [])

const CATALOG: Entry[] = [
  {
    name: "magic-link-sk",
    label: "Prihlasovací odkaz",
    description: "Odkaz na prihlásenie do účtu bez hesla. Odchádza vždy, nedá sa vypnúť.",
    required: true,
    audience: "customer",
    placeholders: [P.ttl],
    slots: [
      SUBJECT("Prihlasovací odkaz k vášmu účtu ANASTASIA"),
      HEADING("Prihlásenie do účtu"),
      text("intro", "Úvodný text", "Kliknutím na tlačidlo nižšie sa prihlásite do svojho účtu ANASTASIA."),
      text("validity", "Platnosť odkazu", "Odkaz platí {platnost_minut} minút a je možné ho použiť iba raz.", true),
      text("outro", "Záverečný text", "Ak ste o prihlásenie nežiadali, tento e-mail pokojne ignorujte.", true),
      line("button", "Tlačidlo", "Prihlásiť sa"),
    ],
    sample: { url: "https://anastasiaoz.eu/prihlasenie?token=ukazka", ttl_minutes: 15 },
    vars: data => ({ platnost_minut: num(data.ttl_minutes) != null ? String(num(data.ttl_minutes)) : null }),
    build: (data, t, r) => {
      const url = safeUrl(data.url)
      if (!url) throw new Error("magic-link-sk: missing url")
      return {
        subject: r("subject"),
        heading: r("heading"),
        blocks: [...p(t("intro")), ...p(t("validity")), ...p(t("outro"))],
        button: { label: r("button"), url },
      }
    },
  },
  {
    name: "customer-welcome-sk",
    label: "Uvítanie po registrácii",
    description: "Odchádza raz po vytvorení nového účtu (nie pri prenose zákazníkov zo starého webu).",
    required: false,
    audience: "customer",
    placeholders: [P.name],
    slots: [
      SUBJECT("Vitajte v ANASTASIA"),
      HEADING("Vitajte, {meno}"),
      line("heading_anonymous", "Nadpis bez mena", "Vitajte"),
      text("intro", "Úvodný text", "Váš účet je pripravený. Nájdete v ňom svoje objednávky, konzultácie, kurzy a správy."),
      text("outro", "Záverečný text", "Ak budete mať akúkoľvek otázku, stačí odpovedať na tento e-mail.", true),
      line("button", "Tlačidlo", "Môj účet"),
    ],
    sample: { first_name: "Jana", url: "https://anastasiaoz.eu/ucet" },
    vars: data => ({ meno: str(data.first_name) }),
    build: (data, t, r) => ({
      subject: r("subject"),
      heading: t("heading") ?? r("heading_anonymous"),
      blocks: [...p(t("intro")), ...p(t("outro"))],
      button: button(r("button"), data.url),
    }),
  },
  {
    name: "order-placed-sk",
    label: "Potvrdenie objednávky",
    description: "Po dokončení objednávky. Obsahuje zoznam položiek a sumu; text o platbe podľa toho, či je už zaplatená.",
    required: false,
    audience: "customer",
    placeholders: [P.order, P.total, P.name],
    slots: [
      SUBJECT("Potvrdenie objednávky č. {cislo_objednavky}"),
      HEADING("Ďakujeme za objednávku"),
      text("intro", "Úvodný text", "Vašu objednávku č. {cislo_objednavky} sme prijali."),
      text("paid", "Text pri zaplatenej objednávke", "Platbu vo výške {suma} sme prijali, objednávku pripravujeme.", true),
      text("unpaid", "Text pri nezaplatenej objednávke", "Objednávku vybavíme hneď po prijatí platby vo výške {suma}.", true),
      text("bank_transfer", "Text pri platbe prevodom", "Prosíme, uhraďte {suma} prevodom na účet nižšie do 48 hodín. Ako variabilný symbol uveďte číslo objednávky {cislo_objednavky}. Objednávku vybavíme a digitálny obsah sprístupníme hneď po pripísaní platby.", true),
      text("cod", "Text pri platbe na dobierku", "Platíte pri prevzatí zásielky: {suma}.", true),
      text("pickup", "Text pri osobnom odbere", "Objednávku si vyzdvihnete osobne: Lucrat spol. s r.o., Sokolská 88, 960 01 Zvolen. Keď bude pripravená, ozveme sa Vám.", true),
      text("outro", "Záverečný text", "Stav objednávky nájdete kedykoľvek vo svojom účte.", true),
      line("label_subtotal", "Riadok: medzisúčet", "Medzisúčet"),
      line("label_shipping", "Riadok: doprava", "Doprava"),
      line("label_discount", "Riadok: zľava", "Zľava"),
      line("label_total", "Riadok: spolu", "Spolu"),
      line("label_shipping_method", "Riadok: spôsob dopravy", "Doprava"),
      line("label_payment_method", "Riadok: spôsob platby", "Platba"),
      line("button", "Tlačidlo", "Moja objednávka"),
    ],
    sample: ORDER_SAMPLE,
    vars: orderVars,
    build: (data, t, r) => {
      const rows = orderRows(data, r)
      return {
        subject: r("subject"),
        heading: r("heading"),
        blocks: [
          ...p(t("intro") ?? "Vašu objednávku sme prijali."),
          ...(rows.length ? [{ kind: "rows" as const, rows }] : []),
          ...methodRows(data, r),
          ...paymentBlocks(data, t),
          ...(str(data.shipping_method)?.startsWith("Osobný odber") ? p(t("pickup")) : []),
          ...p(t("outro")),
        ],
        button: button(r("button"), data.url),
      }
    },
  },
  {
    name: "payment-captured-sk",
    label: "Prijatie platby",
    description: "Keď platba príde neskôr než objednávka (napr. prevodom). Pri platbe kartou ho nahrádza potvrdenie objednávky.",
    required: false,
    audience: "customer",
    placeholders: [P.order, P.total],
    slots: [
      SUBJECT("Prijali sme platbu k objednávke č. {cislo_objednavky}"),
      HEADING("Platba je prijatá"),
      text("intro", "Úvodný text", "Ďakujeme, platbu vo výške {suma} k objednávke č. {cislo_objednavky} sme prijali."),
      text("outro", "Záverečný text", "Objednávku teraz pripravujeme.", true),
      line("button", "Tlačidlo", "Moja objednávka"),
    ],
    sample: { order_display_id: "1042", amount: "89,00 €", url: ORDER_SAMPLE.url },
    vars: orderVars,
    build: (data, t, r) => ({
      subject: r("subject"),
      heading: r("heading"),
      blocks: [...p(t("intro") ?? "Ďakujeme, platbu k Vašej objednávke sme prijali."), ...p(t("outro"))],
      button: button(r("button"), data.url),
    }),
  },
  {
    name: "order-shipped-sk",
    label: "Odoslanie zásielky",
    description: "Keď objednávku odovzdáte dopravcovi. Ak je známe číslo zásielky, zobrazí sa aj s odkazom na sledovanie.",
    required: false,
    audience: "customer",
    placeholders: [P.order, P.tracking],
    slots: [
      SUBJECT("Vaša objednávka č. {cislo_objednavky} je na ceste"),
      HEADING("Objednávka je odoslaná"),
      text("intro", "Úvodný text", "Objednávku č. {cislo_objednavky} sme práve odovzdali dopravcovi."),
      text("tracking", "Číslo zásielky", "Číslo zásielky: {cislo_zasielky}", true),
      text("outro", "Záverečný text", "Ďakujeme, že nakupujete u nás.", true),
      line("button_tracking", "Tlačidlo: sledovanie zásielky", "Sledovať zásielku"),
      line("button", "Tlačidlo: objednávka", "Moja objednávka"),
    ],
    sample: { order_display_id: "1042", tracking_number: "SK123456789", tracking_url: "https://tracking.example.test/SK123456789", url: ORDER_SAMPLE.url },
    vars: data => ({ ...orderVars(data), cislo_zasielky: str(data.tracking_number) }),
    build: (data, t, r) => ({
      subject: r("subject"),
      heading: r("heading"),
      blocks: [...p(t("intro") ?? "Vašu objednávku sme práve odovzdali dopravcovi."), ...p(t("tracking")), ...p(t("outro"))],
      button: button(r("button_tracking"), data.tracking_url) ?? button(r("button"), data.url),
    }),
  },
  {
    name: "order-refunded-sk",
    label: "Vrátenie peňazí",
    description: "Po každom vrátení peňazí (aj čiastočnom) k objednávke.",
    required: false,
    audience: "customer",
    placeholders: [P.order, P.total],
    slots: [
      SUBJECT("Vrátili sme Vám peniaze k objednávke č. {cislo_objednavky}"),
      HEADING("Peniaze sú na ceste späť"),
      text("intro", "Úvodný text", "K objednávke č. {cislo_objednavky} sme Vám vrátili {suma}."),
      text("outro", "Záverečný text", "Na Vašom účte by mali byť do niekoľkých pracovných dní, podľa Vašej banky.", true),
      line("button", "Tlačidlo", "Moja objednávka"),
    ],
    sample: { order_display_id: "1042", amount: "30,00 €", url: ORDER_SAMPLE.url },
    vars: orderVars,
    build: (data, t, r) => ({
      subject: r("subject"),
      heading: r("heading"),
      blocks: [...p(t("intro") ?? "Vrátili sme Vám peniaze k Vašej objednávke."), ...p(t("outro"))],
      button: button(r("button"), data.url),
    }),
  },
  {
    name: "order-canceled-sk",
    label: "Zrušenie objednávky",
    description: "Keď je objednávka zrušená (zákazníkom alebo v administrácii).",
    required: false,
    audience: "customer",
    placeholders: [P.order],
    slots: [
      SUBJECT("Objednávka č. {cislo_objednavky} je zrušená"),
      HEADING("Objednávka je zrušená"),
      text("intro", "Úvodný text", "Vaša objednávka č. {cislo_objednavky} bola zrušená."),
      text("paid", "Text pri zaplatenej objednávke", "Peniaze Vám vrátime a o vrátení Vám pošleme e-mail.", true),
      text("outro", "Záverečný text", "Ak máte otázky, odpovedzte na tento e-mail.", true),
      line("button", "Tlačidlo", "Moja objednávka"),
    ],
    sample: { order_display_id: "1042", paid: true, url: ORDER_SAMPLE.url },
    vars: orderVars,
    build: (data, t, r) => ({
      subject: r("subject"),
      heading: r("heading"),
      blocks: [...p(t("intro") ?? "Vaša objednávka bola zrušená."), ...(data.paid === true ? p(t("paid")) : []), ...p(t("outro"))],
      button: button(r("button"), data.url),
    }),
  },
  {
    name: "withdrawal-received-sk",
    label: "Prijatie odstúpenia od zmluvy",
    description: "Potvrdenie, že sme prijali formulár odstúpenia od zmluvy (14 dní).",
    required: false,
    audience: "customer",
    placeholders: [P.order, P.received],
    slots: [
      SUBJECT("Prijali sme Vaše odstúpenie od zmluvy"),
      HEADING("Odstúpenie od zmluvy je prijaté"),
      text("intro", "Úvodný text", "Dňa {datum_prijatia} sme prijali Vaše odstúpenie od zmluvy k objednávke č. {cislo_objednavky}."),
      text("outro", "Záverečný text", "Odstúpenie posúdime a o ďalšom postupe Vás budeme informovať e-mailom.", true),
      line("button", "Tlačidlo", "Moja objednávka"),
    ],
    sample: { order_display_id: "1042", received_at: "2026-10-15T08:00:00Z", url: ORDER_SAMPLE.url },
    vars: data => ({ ...orderVars(data), datum_prijatia: formatDate(data.received_at) }),
    build: (data, t, r) => ({
      subject: r("subject"),
      heading: r("heading"),
      blocks: [...p(t("intro") ?? "Prijali sme Vaše odstúpenie od zmluvy."), ...p(t("outro"))],
      button: button(r("button"), data.url),
    }),
  },
  {
    name: "contract-withdrawal-received-sk",
    label: "Potvrdenie doručenia odstúpenia od zmluvy",
    description: "Potvrdenie doručenia oznámenia o odstúpení od zmluvy poslaného formulárom na webe (VOP čl. 9.2). Obsahuje obsah oznámenia, dátum a čas doručenia. Nedá sa vypnúť.",
    required: true,
    audience: "customer",
    placeholders: [P.order, P.received, P.receivedTime, P.items, P.orderDate, P.name],
    slots: [
      SUBJECT("Potvrdenie doručenia odstúpenia od zmluvy č. {cislo_objednavky}"),
      HEADING("Odstúpenie od zmluvy je prijaté"),
      text("intro", "Úvodný text", "Dňa {datum_prijatia} o {cas_prijatia} sme prijali Vaše odstúpenie od zmluvy k objednávke č. {cislo_objednavky}."),
      line("label_order", "Označenie čísla objednávky", "Číslo objednávky"),
      line("label_items", "Označenie položiek", "Položky"),
      line("label_order_date", "Označenie dátumu objednávky", "Dátum objednávky"),
      line("label_reason", "Označenie dôvodu", "Dôvod"),
      text("outro", "Záverečný text", "Vrátenie peňazí alebo výmenu tovaru vybavíme podľa podmienok odstúpenia od zmluvy. Ak máte otázky, odpovedzte na tento e-mail.", true),
    ],
    sample: {
      order_number: "2026-0142",
      items: ["Kurz RESET 40+"],
      order_date: "2026-10-12T00:00:00.000Z",
      received_at: "2026-10-21T08:00:00.000Z",
      first_name: "Jana",
    },
    vars: data => ({
      cislo_objednavky: str(data.order_number) ?? str(data.order_display_id),
      polozky: Array.isArray(data.items) ? data.items.map(item => str(item)).filter(Boolean).join(", ") : str(data.items),
      datum_objednavky: formatDate(data.order_date),
      datum_prijatia: formatDate(data.received_at),
      cas_prijatia: formatTime(data.received_at),
      meno: str(data.first_name),
    }),
    build: (data, t, r) => {
      const rows: Row[] = []
      const order = str(data.order_number) ?? str(data.order_display_id)
      if (order) rows.push({ label: r("label_order"), value: order })
      const items = Array.isArray(data.items) ? data.items.map(item => str(item)).filter(Boolean).join(", ") : str(data.items)
      if (items) rows.push({ label: r("label_items"), value: items })
      const orderDate = formatDate(data.order_date)
      if (orderDate) rows.push({ label: r("label_order_date"), value: orderDate })
      const reason = str(data.reason)
      if (reason) rows.push({ label: r("label_reason"), value: reason })
      return {
        subject: r("subject"),
        heading: r("heading"),
        blocks: [...p(t("intro") ?? "Prijali sme Vaše odstúpenie od zmluvy."), ...(rows.length ? [{ kind: "rows" as const, rows }] : []), ...p(t("outro"))],
      }
    },
  },
  {
    name: "contract-withdrawal-admin",
    label: "Nové odstúpenie od zmluvy (pre Vás)",
    description: "Interný e-mail pre správkyňu, keď zákazník odstúpi od zmluvy formulárom na webe.",
    required: false,
    audience: "admin",
    placeholders: [P.order, P.email, P.name, P.items, P.received],
    slots: [
      SUBJECT("Nové odstúpenie od zmluvy č. {cislo_objednavky}"),
      HEADING("Nové odstúpenie od zmluvy"),
      text("intro", "Úvodný text", "Dňa {datum_prijatia} prijal/a odstúpenie od zmluvy k objednávke č. {cislo_objednavky}."),
      line("label_email", "Označenie e-mailu", "E-mail zákazníka"),
      line("label_items", "Označenie položiek", "Položky"),
      text("outro", "Záverečný text", "Spracujte odstúpenie v administrácii (Odstúpenia od zmluvy).", true),
    ],
    sample: {
      order_number: "2026-0142",
      items: ["Kurz RESET 40+"],
      email: "zakaznik@example.test",
      first_name: "Jana",
      received_at: "2026-10-21T08:00:00.000Z",
    },
    vars: data => ({
      cislo_objednavky: str(data.order_number) ?? str(data.order_display_id),
      email: str(data.email),
      meno: str(data.first_name),
      polozky: Array.isArray(data.items) ? data.items.map(item => str(item)).filter(Boolean).join(", ") : str(data.items),
      datum_prijatia: formatDate(data.received_at),
    }),
    build: (data, t, r) => {
      const rows: Row[] = []
      const email = str(data.email)
      if (email) rows.push({ label: r("label_email"), value: email })
      const items = Array.isArray(data.items) ? data.items.map(item => str(item)).filter(Boolean).join(", ") : str(data.items)
      if (items) rows.push({ label: r("label_items"), value: items })
      return {
        subject: r("subject"),
        heading: r("heading"),
        blocks: [...p(t("intro") ?? "Prišlo nové odstúpenie od zmluvy."), ...(rows.length ? [{ kind: "rows" as const, rows }] : []), ...p(t("outro"))],
      }
    },
  },
  {
    name: "booking-confirmed-sk",
    label: "Potvrdenie konzultácie",
    description: "Po zaplatení rezervovaného termínu konzultácie.",
    required: false,
    audience: "customer",
    placeholders: [P.term],
    slots: [
      SUBJECT("Vaša konzultácia je potvrdená"),
      HEADING("Konzultácia je potvrdená"),
      text("intro", "Úvodný text", "Teším sa na Vás {termin}."),
      text("outro", "Záverečný text", "Podrobnosti nájdete vo svojom účte.", true),
      line("button", "Tlačidlo", "Moje konzultácie"),
    ],
    sample: { starts_at: "2026-11-02T09:00:00Z", ends_at: "2026-11-02T10:00:00Z", url: "https://anastasiaoz.eu/ucet/konzultacie" },
    vars: data => ({ termin: bookingTerm(data) }),
    build: (data, t, r) => ({
      subject: r("subject"),
      heading: r("heading"),
      blocks: [...p(t("intro") ?? "Teším sa na Vás v dohodnutom termíne."), ...p(t("outro"))],
      button: button(r("button"), data.url),
    }),
  },
  {
    name: "booking-canceled-sk",
    label: "Zrušenie konzultácie",
    description: "Keď je termín konzultácie zrušený. Dôvod sa vyberá podľa toho, kto termín zrušil.",
    required: false,
    audience: "customer",
    placeholders: [P.term],
    slots: [
      SUBJECT("Vaša konzultácia bola zrušená"),
      HEADING("Konzultácia bola zrušená"),
      text("intro", "Úvodný text", "Termín {termin} je zrušený."),
      text("reason_order_canceled", "Dôvod: zrušená objednávka", "Konzultácia bola zrušená spolu s objednávkou.", true),
      text("reason_customer_request", "Dôvod: na žiadosť zákazníka", "Konzultáciu sme zrušili na Vašu žiadosť.", true),
      text("reason_admin_canceled", "Dôvod: zrušené z našej strany", "Konzultáciu sme z organizačných dôvodov museli zrušiť.", true),
      text("reason_other", "Iný dôvod", "Ak máte otázky, odpovedzte na tento e-mail.", true),
      line("button", "Tlačidlo", "Moje konzultácie"),
    ],
    sample: { starts_at: "2026-11-02T09:00:00Z", ends_at: "2026-11-02T10:00:00Z", cancel_kind: "admin_canceled", url: "https://anastasiaoz.eu/ucet/konzultacie" },
    vars: data => ({ termin: bookingTerm(data) }),
    build: (data, t, r) => {
      const kind = str(data.cancel_kind)
      const reasonSlot = kind && ["order_canceled", "customer_request", "admin_canceled"].includes(kind) ? `reason_${kind}` : "reason_other"
      return {
        subject: r("subject"),
        heading: r("heading"),
        blocks: [...p(t("intro") ?? "Termín konzultácie je zrušený."), ...p(t(reasonSlot))],
        button: button(r("button"), data.url),
      }
    },
  },
  {
    name: "gift-voucher-recipient-sk",
    label: "Darčekový poukaz pre obdarovanú",
    description: "Odchádza obdarovanej v deň doručenia s kódom poukazu. Nedá sa vypnúť.",
    required: true,
    audience: "customer",
    placeholders: [P.name, P.amount, P.expires],
    slots: [
      SUBJECT("Dostali ste darčekový poukaz ANASTASIA"),
      HEADING("{meno}, máte darček"),
      line("heading_anonymous", "Nadpis bez mena", "Máte darček"),
      text("intro", "Úvodný text", "Niekto Vám daroval poukaz ANASTASIA v hodnote {hodnota}."),
      line("code_label", "Popis kódu", "Kód poukazu"),
      text("instructions", "Návod na použitie", "Kód zadajte v košíku e-shopu.", true),
      text("validity", "Platnosť", "Poukaz platí do {platny_do}.", true),
    ],
    sample: { code: "ABCD-EFGH-JKLM", amount: "50 €", recipient_name: "Jana", message: "Všetko najlepšie!", expires_at: "2027-10-15T00:00:00Z" },
    vars: data => ({ meno: str(data.recipient_name), hodnota: str(data.amount), platny_do: formatDate(data.expires_at) }),
    build: (data, t, r) => {
      const code = str(data.code)
      if (!code) throw new Error("gift-voucher-recipient-sk: missing code")
      const message = str(data.message)
      return {
        subject: r("subject"),
        heading: t("heading") ?? r("heading_anonymous"),
        blocks: [
          ...p(t("intro") ?? "Niekto Vám daroval poukaz ANASTASIA."),
          ...(message ? [{ kind: "quote" as const, text: message }] : []),
          { kind: "code", label: r("code_label"), value: code },
          ...p(t("instructions")),
          ...p(t("validity")),
        ],
      }
    },
  },
  {
    name: "gift-voucher-buyer-sk",
    label: "Darčekový poukaz pre kupujúcu (PDF)",
    description: "Kupujúca dostane poukaz v PDF. Nedá sa vypnúť.",
    required: true,
    audience: "customer",
    placeholders: [P.amount, P.expires],
    slots: [
      SUBJECT("Váš darčekový poukaz ANASTASIA (PDF)"),
      HEADING("Váš darčekový poukaz"),
      text("intro", "Úvodný text", "Ďakujeme za nákup. Poukaz v hodnote {hodnota} nájdete v prílohe vo formáte PDF, pripravený na tlač alebo odoslanie."),
      line("code_label", "Popis kódu", "Kód poukazu"),
      text("validity", "Platnosť", "Poukaz platí do {platny_do}.", true),
    ],
    sample: { masked_code: "ABCD-••••-JKLM", amount: "50 €", expires_at: "2027-10-15T00:00:00Z" },
    vars: data => ({ hodnota: str(data.amount), platny_do: formatDate(data.expires_at) }),
    build: (data, t, r) => ({
      subject: r("subject"),
      heading: r("heading"),
      blocks: [
        ...p(t("intro") ?? "Ďakujeme za nákup. Poukaz nájdete v prílohe vo formáte PDF, pripravený na tlač alebo odoslanie."),
        ...(str(data.masked_code) ? [{ kind: "code" as const, label: r("code_label"), value: str(data.masked_code)! }] : []),
        ...p(t("validity")),
      ],
    }),
  },
  {
    name: "chat-admin-digest",
    label: "Súhrn nových správ (pre Vás)",
    description: "Interný e-mail pre správkyňu o neprečítaných správach v chate (najviac raz za hodinu).",
    required: false,
    audience: "admin",
    placeholders: [P.messages, P.conversations],
    slots: [
      SUBJECT("Nové správy od zákazníkov ({pocet_sprav})"),
      HEADING("Nové správy v chate"),
      text("intro", "Text", "Neprečítané správy: {pocet_sprav}, konverzácie: {pocet_konverzacii}."),
      line("button", "Tlačidlo", "Otvoriť chat"),
    ],
    sample: { messages: 3, conversations: 2, url: "https://admin.anastasiaoz.eu/#/spravy" },
    vars: data => ({ pocet_sprav: String(num(data.messages) ?? 0), pocet_konverzacii: String(num(data.conversations) ?? 0) }),
    build: (data, t, r) => ({
      subject: r("subject"),
      heading: r("heading"),
      blocks: p(t("intro")),
      button: button(r("button"), data.url),
    }),
  },
  {
    name: "chat-admin-reply",
    label: "Odpoveď v chate",
    description: "Zákazník dostane upozornenie, že máte pre neho odpoveď. Text správy sa do e-mailu nevkladá.",
    required: false,
    audience: "customer",
    placeholders: [P.name],
    slots: [
      SUBJECT("Lucia vám odpovedala"),
      HEADING("{meno}, máte novú odpoveď"),
      line("heading_anonymous", "Nadpis bez mena", "Máte novú odpoveď"),
      text("intro", "Text", "Lucia odpovedala na Vašu správu. Odpoveď si prečítate vo svojom účte."),
      line("button", "Tlačidlo", "Zobraziť odpoveď"),
    ],
    sample: { first_name: "Jana", url: "https://anastasiaoz.eu/ucet/spravy/ukazka" },
    vars: data => ({ meno: str(data.first_name) }),
    build: (data, t, r) => ({
      subject: r("subject"),
      heading: t("heading") ?? r("heading_anonymous"),
      blocks: p(t("intro")),
      button: button(r("button"), data.url),
    }),
  },
  {
    name: "order-placed-admin",
    label: "Nová objednávka (pre Vás)",
    description: "Interný e-mail, ktorý vám príde pri každej novej objednávke. Dá sa vypnúť, ak máte vlastné upozornenie.",
    required: false,
    audience: "admin",
    placeholders: [P.order, P.total, P.name],
    slots: [
      SUBJECT("Nová objednávka č. {cislo_objednavky}"),
      HEADING("Nová objednávka"),
      text("intro", "Úvodný text", "Prišla nová objednávka č. {cislo_objednavky} za {suma}."),
      line("label_customer", "Riadok: zákazník", "Zákazník"),
      line("label_payment", "Riadok: platba", "Platba"),
      line("label_shipping", "Riadok: doprava", "Doprava"),
      line("button", "Tlačidlo", "Otvoriť objednávku"),
    ],
    sample: { ...ORDER_SAMPLE, order_display_id: "1043", payment_status: "zaplatená", shipping_method: "Kuriér", admin_url: "https://anastasia-test-admin.l-code-dynamics.com/#/objednavky" },
    vars: orderVars,
    build: (data, t, r) => ({
      subject: r("subject"),
      heading: r("heading"),
      blocks: [
        ...p(t("intro")),
        { kind: "rows" as const, rows: [
          { label: r("label_customer"), value: oneLine(str(data.first_name) ?? "—") },
          { label: r("label_payment"), value: oneLine(str(data.payment_status) ?? "—") },
          { label: r("label_shipping"), value: oneLine(str(data.shipping_method) ?? "—") },
        ] },
      ],
      button: button(r("button"), data.admin_url),
    }),
  },
  {
    name: "contact-form-admin",
    label: "Správa z kontaktného formulára (pre Vás)",
    description: "Interný e-mail so správou z webu. Odpoveď ide priamo na e-mail odosielateľky. Nedá sa vypnúť – inak by sa správy strácali.",
    required: true,
    audience: "admin",
    placeholders: [P.name],
    slots: [
      SUBJECT("Nová správa z webu: {meno}"),
      HEADING("Nová správa z kontaktného formulára"),
      text("intro", "Text", "Na správu odpovedzte priamo z e-mailu – odpoveď pôjde odosielateľke."),
    ],
    sample: { name: "Jana Nováková", email: "jana@example.com", topic: "Konzultácia", message: "Dobrý deň, mám otázku k termínu konzultácie." },
    vars: data => ({ meno: str(data.name) }),
    build: (data, t, r) => ({
      subject: r("subject"),
      heading: r("heading"),
      blocks: [
        ...p(t("intro")),
        { kind: "rows" as const, rows: [
          { label: "Meno", value: oneLine(str(data.name) ?? "—") },
          { label: "E-mail", value: oneLine(str(data.email) ?? "—") },
          { label: "Téma", value: oneLine(str(data.topic) ?? "—") },
        ] },
        ...(str(data.message) ? [{ kind: "quote" as const, text: str(data.message)! }] : []),
      ],
      button: null,
    }),
  },
]

const BY_NAME = new Map(CATALOG.map(entry => [entry.name, entry]))

export const TEMPLATE_NAMES = Object.freeze(CATALOG.map(entry => entry.name))

/** Popis šablony pro admin (bez funkcí). */
export function getTemplateDef(template: string): TemplateDef | null {
  const entry = BY_NAME.get(template)
  if (!entry) return null
  const { vars: _vars, build: _build, ...def } = entry
  return def
}

export function listTemplateDefs(): TemplateDef[] {
  return TEMPLATE_NAMES.map(name => getTemplateDef(name)!)
}

// ---------------------------------------------------------------------------------------------
// HTML a text
// ---------------------------------------------------------------------------------------------

function renderHtml(body: Body): string {
  const blocks = body.blocks.map(block => {
    if (block.kind === "quote") {
      return `<p style="margin:0 0 16px;padding:12px 16px;border-left:3px solid ${LAVENDER};background:#f7f2e8;font-style:italic;white-space:pre-line">${escapeHtml(block.text)}</p>`
    }
    if (block.kind === "code") {
      return `<p style="margin:0 0 6px;font-size:13px;color:#6b6b6b">${escapeHtml(block.label)}</p>` +
        `<p style="margin:0 0 16px;font-size:22px;font-weight:bold;letter-spacing:2px;font-family:Menlo,Consolas,monospace">${escapeHtml(block.value)}</p>`
    }
    if (block.kind === "rows") {
      const rows = block.rows.map(row => {
        const weight = row.strong ? "font-weight:bold;border-top:1px solid #e6e0dc;" : ""
        return `<tr><td style="padding:6px 0;${weight}">${escapeHtml(row.label)}</td><td align="right" style="padding:6px 0 6px 12px;white-space:nowrap;${weight}">${escapeHtml(row.value)}</td></tr>`
      }).join("")
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:15px">${rows}</table>`
    }
    return `<p style="margin:0 0 16px;white-space:pre-line">${escapeHtml(block.text)}</p>`
  }).join("\n")
  const button = body.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0"><tr><td bgcolor="${ACCENT}" style="border-radius:9px;background:${ACCENT}"><a href="${escapeHtml(body.button.url)}" style="display:inline-block;padding:13px 24px;background:${ACCENT};color:#ffffff;text-decoration:none;border-radius:9px;font-weight:bold;font-family:Figtree,Arial,sans-serif">${escapeHtml(body.button.label)}</a></td></tr></table>` +
      `<p style="margin:0 0 16px;font-size:12px;color:${MUTED};word-break:break-all;font-family:Figtree,Arial,sans-serif">Ak tlačidlo nefunguje, skopírujte do prehliadača: ${escapeHtml(body.button.url)}</p>`
    : ""
  return `<!doctype html>
<html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(body.subject)}</title></head>
<body style="margin:0;padding:0;background:${CREAM};color:${INK};-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${CREAM}" style="width:100%;background:${CREAM}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${SURFACE}" style="width:100%;max-width:600px;background:${SURFACE};border:1px solid #eae3d8;border-radius:12px;overflow:hidden;color:${INK}">
<tr><td align="center" style="padding:24px 24px 16px;border-bottom:1px solid #eae3d8"><img src="${LOGO_URL}" width="52" height="52" alt="ANASTASIA" style="display:block;width:52px;height:52px;object-fit:contain;border:0"><div style="padding-top:10px;font-family:Fraunces,Georgia,serif;font-size:12px;letter-spacing:4px;color:${ACCENT}">${BRAND}</div></td></tr>
<tr><td style="padding:28px 32px 22px;font-family:Figtree,Arial,sans-serif;font-size:15px;line-height:1.7;color:${INK}">
<h1 style="margin:0 0 18px;font-family:Fraunces,Georgia,serif;font-size:28px;line-height:1.25;font-weight:300;color:${ACCENT}">${escapeHtml(body.heading)}</h1>
${blocks}
${button}
</td></tr>
<tr><td style="padding:18px 32px 22px;border-top:1px solid #eae3d8;font-family:Figtree,Arial,sans-serif;font-size:12px;line-height:1.7;color:${MUTED}">LUCRAT spol. s r.o. · IČO 36652164<br><a href="https://anastasiaoz.eu" style="color:${ACCENT};text-decoration:underline">anastasiaoz.eu</a> · <a href="mailto:info@anastasiaoz.eu" style="color:${ACCENT};text-decoration:underline">info@anastasiaoz.eu</a></td></tr>
</table></td></tr></table>
</body></html>`
}

function renderText(body: Body): string {
  const lines = [body.heading, ""]
  for (const block of body.blocks) {
    if (block.kind === "code") lines.push(`${block.label}: ${block.value}`, "")
    else if (block.kind === "quote") lines.push(block.text.split("\n").map(l => `> ${l}`).join("\n"), "")
    else if (block.kind === "rows") lines.push(...block.rows.map(row => `${row.label}: ${row.value}`), "")
    else lines.push(block.text, "")
  }
  if (body.button) lines.push(`${body.button.label}: ${body.button.url}`, "")
  lines.push("--", "LUCRAT spol. s r.o. · IČO 36652164", "https://anastasiaoz.eu", "info@anastasiaoz.eu")
  return lines.join("\n")
}

const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim()

/**
 * Předmět: přepis z adminu (`data.texts.subject`) > `data.subject` od volajícího (zpětná kompatibilita) > výchozí.
 * Nový řádek v předmětu ani nadpisu nikdy neprojde (hlavičky e-mailu).
 */
export function renderTemplate(template: string, data: Data = {}): RenderedEmail {
  const entry = BY_NAME.get(template)
  if (!entry) throw new UnknownTemplateError(template)
  const overrides = overridesFrom(entry, data.texts)
  const vars = entry.vars(data)
  const t = slotResolver(entry, overrides, vars)
  const body = entry.build(data, t, key => required(entry, t, key, vars))
  const subject = oneLine((own(overrides, "subject") ? body.subject : str(data.subject) ?? body.subject) || BRAND)
  const finalBody = { ...body, subject, heading: oneLine(body.heading) }
  return { subject, html: renderHtml(finalBody), text: renderText(finalBody) }
}

/** Náhled pro admin: syntetická data šablony + navrhované (ještě neuložené) texty. */
export function renderPreview(template: string, texts: Record<string, string> = {}): RenderedEmail {
  const entry = BY_NAME.get(template)
  if (!entry) throw new UnknownTemplateError(template)
  return renderTemplate(template, { ...entry.sample, texts })
}
