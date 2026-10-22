/** Native Medusa contracts for the bespoke Slovak shop workspace. No checkout calculations. */
export const sections = ["prehled", "produkty", "ceny", "kategorie", "kupony", "objednavky", "zakaznicky"] as const
export type Section = typeof sections[number]
export const labels: Record<Section, string> = { prehled: "Prehľad", produkty: "Produkty", ceny: "Ceny", kategorie: "Kategórie", kupony: "Kupóny", objednavky: "Objednávky", zakaznicky: "Zákazníci" }
export const resources: Record<Exclude<Section, "prehled">, { path: string; key: string; fields?: string }> = {
  produkty: { path: "/admin/products", key: "products", fields: "id,title,description,status,handle,updated_at,categories.id,categories.name,variants.id,variants.title,*variants.prices" },
  ceny: { path: "/admin/products", key: "products", fields: "id,title,status,variants.id,variants.title,*variants.prices" },
  kategorie: { path: "/admin/product-categories", key: "product_categories" },
  kupony: { path: "/admin/promotions", key: "promotions", fields: "id,code,type,status,is_automatic,limit,used,*application_method,*rules,*application_method.target_rules,*application_method.buy_rules" },
  objednavky: { path: "/admin/orders", key: "orders" },
  zakaznicky: { path: "/admin/customers", key: "customers" },
}
export type Price = { id: string; currency_code: string; amount: number; min_quantity?: number | null; max_quantity?: number | null; rules?: Record<string, string> }
export type Variant = { id: string; title: string; prices?: Price[] }
export type Row = {
  id: string; title?: string; name?: string; code?: string; description?: string | null; status?: string;
  email?: string; first_name?: string; last_name?: string; phone?: string; display_id?: number;
  is_active?: boolean; is_internal?: boolean; parent_category_id?: string | null;
  variants?: Variant[]; categories?: { id: string; name: string }[]; metadata?: Record<string, unknown>;
  total?: number; currency_code?: string; payment_status?: string; fulfillment_status?: string;
  items?: { id: string; title: string; quantity: number; unit_price: number }[];
  type?: string; is_automatic?: boolean; limit?: number | null; used?: number;
  rules?: unknown[]; application_method?: { type: string; value: number; target_type: string; currency_code?: string; max_quantity?: number | null; apply_to_quantity?: number | null; buy_rules_min_quantity?: number | null; target_rules?: unknown[]; buy_rules?: unknown[] };
}
export type Values = Record<string, string>
export class FieldError extends Error { constructor(public field: string, message: string) { super(message) } }
export function text(value: string | undefined, field: string, max = 200) {
  const result = (value ?? "").trim()
  if (!result || result.length > max) throw new FieldError(field, `Vyplňte toto pole, najviac ${max} znakov.`)
  return result
}
export function amount(value: string | undefined, field = "amount", positive = false): number {
  const raw = (value ?? "").trim().replace(",", ".")
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(raw)) throw new FieldError(field, "Zadajte platnú sumu v eurách, najviac dve desatinné miesta.")
  const number = Number(raw)
  if (!Number.isFinite(number) || number < 0 || (positive && number === 0)) throw new FieldError(field, "Suma musí byť väčšia ako nula.")
  return number
}
export function email(value: string | undefined) {
  const result = text(value, "email", 254)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new FieldError("email", "Zadajte platný e-mail.")
  return result
}
export function simplePrice(variant: Variant): Price | null {
  const prices = variant.prices
  if (!prices || prices.length !== 1) return null
  const p = prices[0]
  return p.currency_code === "eur" && p.min_quantity == null && p.max_quantity == null && !Object.keys(p.rules ?? {}).length ? p : null
}
export function priceUpdate(variant: Variant, value: string) {
  const p = simplePrice(variant)
  if (!p) throw new FieldError("amount", "Táto varianta má viac cien alebo osobitné pravidlá. Zjednodušený editor ich nemôže prepísať.")
  return { prices: [{ id: p.id, currency_code: "eur", amount: amount(value) }] }
}
export function supportedCoupon(row: Row) {
  const a = row.application_method
  return row.type === "standard" && row.is_automatic === false && Array.isArray(row.rules) && !row.rules.length &&
    a?.type === "percentage" && a.target_type === "items" && Array.isArray(a.target_rules) && !a.target_rules.length &&
    Array.isArray(a.buy_rules) && !a.buy_rules.length && a.max_quantity == null && a.apply_to_quantity == null && a.buy_rules_min_quantity == null
}
export function couponInput(v: Values, existing?: Row) {
  if (existing && !supportedCoupon(existing)) throw new FieldError("code", "Tento kupón má osobitné pravidlá. Tu môžete meniť iba bežné percentuálne kupóny.")
  const code = text(v.code, "code", 128)
  if (/[\x00-\x1f\x7f]/.test(code)) throw new FieldError("code", "Kód nesmie obsahovať riadiace znaky.")
  const value = amount(v.value, "value", true)
  if (value > 100) throw new FieldError("value", "Zľava môže byť najviac 100 %.")
  if (!['draft', 'active', 'inactive'].includes(v.status)) throw new FieldError("status", "Vyberte platný stav kupónu.")
  let limit: number | null = null
  if (v.limit?.trim()) {
    if (!/^[1-9]\d{0,8}$/.test(v.limit.trim())) throw new FieldError("limit", "Limit musí byť kladné celé číslo.")
    limit = Number(v.limit)
    if (existing?.used != null && limit < existing.used) throw new FieldError("limit", "Limit nemôže byť nižší ako počet použití.")
  }
  return existing ? { code, status: v.status, limit, application_method: { value } } : {
    code, type: "standard", is_automatic: false, status: v.status, limit, rules: [],
    application_method: { type: "percentage", target_type: "items", allocation: "across", value, target_rules: [], buy_rules: [] },
  }
}
export function productInput(v: Values, existing?: Row, context?: { channel: string; profile: string }) {
  const title = text(v.title, "title")
  if (!['draft', 'published', 'proposed', 'rejected'].includes(v.status)) throw new FieldError("status", "Vyberte platný stav produktu.")
  if ((v.description ?? '').length > 5000) throw new FieldError("description", "Popis môže mať najviac 5000 znakov.")
  const common = { title, description: v.description ?? '', status: v.status, categories: (v.categories ?? '').split(',').filter(Boolean).map(id => ({ id })) }
  if (existing) return common
  if (!context?.channel || !context.profile) throw new Error("Obchod nemá pripravený predajný kanál alebo profil dopravy. Produkt zatiaľ nevytvárajte.")
  return { ...common, status: "draft", shipping_profile_id: context.profile, sales_channels: [{ id: context.channel }],
    options: [{ title: "Verzia", values: ["Základná"] }], variants: [{ title: "Základná", ...(v.sku?.trim() ? { sku: text(v.sku, "sku", 100) } : {}),
      manage_inventory: true, allow_backorder: false, options: { Verzia: "Základná" }, prices: [{ currency_code: "eur", amount: amount(v.amount) }] }] }
}
export function categoryInput(v: Values, existing?: Row) {
  const name = text(v.name, "name")
  if ((v.description ?? '').length > 5000) throw new FieldError("description", "Popis môže mať najviac 5000 znakov.")
  if (existing && v.parent_category_id === existing.id) throw new FieldError("parent_category_id", "Kategória nemôže patriť sama do seba.")
  return { name, description: v.description ?? '', is_active: v.is_active === "true", is_internal: existing?.is_internal ?? false, parent_category_id: v.parent_category_id || null }
}
export function customerInput(v: Values) {
  return { email: email(v.email), first_name: text(v.first_name, "first_name", 100), last_name: text(v.last_name, "last_name", 100), phone: (v.phone ?? '').trim().slice(0, 50) }
}
export function orderInput(v: Values, fresh: Row) {
  if ((v.note ?? '').length > 2000) throw new FieldError("note", "Poznámka môže mať najviac 2000 znakov.")
  return { email: email(v.email), metadata: { ...fresh.metadata, shop_admin_note: v.note ?? '' } }
}
export class ApiError extends Error { constructor(public status: number, message: string, public uncertain = false) { super(message) } }
export async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  try { response = await fetch(path, { method: body === undefined ? "GET" : "POST", credentials: "include", cache: "no-store", redirect: "error", signal,
    headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) }
  catch (e) { if (signal?.aborted) throw e; throw new ApiError(0, body === undefined ? "Spojenie sa prerušilo. Skúste načítať údaje znova." : "Výsledok uloženia nepoznáme. Najprv obnovte zoznam a overte zmenu; nevytvárajte ju znova.", body !== undefined) }
  if (!response.ok) {
    const messages: Record<number, string> = { 401: "Prihlásenie vypršalo. Prihláste sa do administrácie znova.", 403: "Na túto zmenu nemáte oprávnenie.", 404: "Záznam sa už nenašiel. Obnovte zoznam.", 409: "Údaje sa medzičasom zmenili alebo už existujú. Obnovte ich a skontrolujte zmenu.", 429: "Príliš veľa požiadaviek. Chvíľu počkajte a potom skúste znova." }
    const uncertain = body !== undefined && response.status >= 500
    throw new ApiError(response.status, messages[response.status] ?? (uncertain ? "Výsledok uloženia treba overiť. Obnovte zoznam pred ďalším pokusom." : response.status < 500 ? "Skontrolujte vyplnené údaje. Server túto zmenu neprijal." : "Údaje sa teraz nedajú načítať. Skúste to neskôr."), uncertain)
  }
  try { return await response.json() as T } catch { throw new ApiError(0, "Server nevrátil očakávané údaje. Obnovte zoznam a overte výsledok.", body !== undefined) }
}
export function listUrl(section: Exclude<Section, "prehled">, q = '', offset = 0) {
  const spec = resources[section]
  const params = new URLSearchParams({ limit: "12", offset: String(offset), ...(q.trim() ? { q: q.trim() } : {}), ...(spec.fields ? { fields: spec.fields } : {}) })
  return `${spec.path}?${params}`
}
export const money = (value: number | undefined, currency = 'eur') => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('sk-SK', { style: 'currency', currency: currency.toUpperCase() }).format(value) : 'Neuvedené'
export function caption(row: Row) { return row.title || row.name || row.code || (row.display_id ? `Objednávka č. ${row.display_id}` : [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email || 'Bez názvu') }
