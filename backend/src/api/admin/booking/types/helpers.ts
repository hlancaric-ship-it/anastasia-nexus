import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { z } from "zod"
import { CONSULTATION_FORMS, type BookingProductMeta } from "../../../../modules/booking/availability"

const twoDecimals = (n: number) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6

// Hlášky čte Lucia v adminu: česky i u chybného typu hodnoty (prázdné pole, text místo čísla).
const fields = {
  title: z.string({ error: "Vyplňte název" }).trim().min(2, "Název musí mít aspoň 2 znaky").max(120, "Název může mít nejvýš 120 znaků"),
  description: z.string({ error: "Popis musí být text" }).trim().max(2000, "Popis může mít nejvýš 2000 znaků"),
  duration_minutes: z.number({ error: "Délka musí být číslo v minutách" }).int("Délka musí být celé číslo minut")
    .min(15, "Délka nejméně 15 minut").max(480, "Délka nejvýš 8 hodin")
    .refine((n) => n % 5 === 0, "Délka musí být násobek 5 minut"),
  buffer_minutes: z.number({ error: "Pauza musí být číslo v minutách" }).int("Pauza musí být celé číslo minut")
    .min(0, "Pauza nesmí být záporná").max(240, "Pauza nejvýš 240 minut"),
  price_eur: z.number({ error: "Cena musí být číslo v eurech" }).min(0, "Cena nesmí být záporná").max(100000, "Cena nejvýš 100 000 €")
    .refine(twoDecimals, "Cena může mít nejvýš 2 desetinná místa"),
  form: z.enum(CONSULTATION_FORMS, { error: "Zvolte formu: online nebo osobně" }),
  active: z.boolean({ error: "Pole „aktivní“ musí být ano/ne" }),
}

export const createTypeSchema = z.object({ ...fields, description: fields.description.default("") }, { error: "Neplatná data formuláře" }).strict()
export const updateTypeSchema = z.object({ ...fields, archived: z.boolean({ error: "Pole „archiv“ musí být ano/ne" }) }, { error: "Neplatná data formuláře" }).partial().strict()
  .refine((v) => Object.keys(v).length > 0, "Není co uložit")

export type CreateTypeInput = z.infer<typeof createTypeSchema>
export type UpdateTypeInput = z.infer<typeof updateTypeSchema>

export function zodMessage(error: z.ZodError): string {
  return error.issues.map((i) => i.message).join("; ")
}

export type ConsultationTypeDTO = {
  id: string
  title: string
  description: string
  handle: string | null
  status: string
  active: boolean
  archived: boolean
  duration_minutes: number
  buffer_minutes: number
  form: (typeof CONSULTATION_FORMS)[number]
  price_eur: number | null
  variant_id: string | null
}

export const TYPE_FIELDS = ["id", "title", "description", "handle", "status", "metadata", "variants.id", "variants.prices.id", "variants.prices.amount", "variants.prices.currency_code"]

export function isBookingProduct(product: any): boolean {
  const meta = product?.metadata?.booking
  return Boolean(meta && typeof meta === "object" && !Array.isArray(meta))
}

export function toTypeDTO(product: any): ConsultationTypeDTO {
  const meta = (product.metadata?.booking ?? {}) as Partial<BookingProductMeta>
  const variant = product.variants?.[0]
  const price = variant?.prices?.find((p: any) => p?.currency_code === "eur")
  return {
    id: product.id,
    title: product.title,
    description: product.description ?? "",
    handle: product.handle ?? null,
    status: product.status,
    active: product.status === "published" && meta.archived !== true,
    archived: meta.archived === true,
    duration_minutes: Number(meta.durationMinutes ?? 0),
    buffer_minutes: Number(meta.bufferMinutes ?? 0),
    form: meta.form === "in_person" ? "in_person" : "online",
    price_eur: price ? Number(price.amount) : null,
    variant_id: variant?.id ?? null,
  }
}

export function bookingMeta(input: { duration_minutes: number; buffer_minutes: number; form: BookingProductMeta["form"]; archived: boolean }): BookingProductMeta {
  return { version: 1, durationMinutes: input.duration_minutes, bufferMinutes: input.buffer_minutes, form: input.form, archived: input.archived }
}

export function slugify(title: string): string {
  const slug = title.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80)
  return slug || "konzultace"
}

/** Volný handle produktu (URL); při shodě přidá -2, -3, … */
export async function uniqueHandle(scope: Pick<MedusaContainer, "resolve">, title: string): Promise<string> {
  const query: any = scope.resolve(ContainerRegistrationKeys.QUERY)
  const base = slugify(title)
  const { data } = await query.graph({ entity: "product", fields: ["handle"], filters: { handle: { $like: `${base}%` } }, withDeleted: true })
  const taken = new Set<string>((data ?? []).map((p: any) => p.handle))
  if (!taken.has(base)) return base
  for (let i = 2; i < 1000; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`
  return `${base}-${Date.now().toString(36)}`
}

/** Všechny produkty-typy konzultací (metadata JSON neumí Query filtrovat, katalog se projde po stránkách). */
export async function listTypeProducts(scope: Pick<MedusaContainer, "resolve">): Promise<any[]> {
  const query: any = scope.resolve(ContainerRegistrationKeys.QUERY)
  const ids: string[] = []
  const take = 500
  for (let skip = 0; skip < 20_000; skip += take) {
    const { data } = await query.graph({ entity: "product", fields: ["id", "metadata"], pagination: { skip, take, order: { created_at: "ASC" } } })
    for (const p of data ?? []) if (isBookingProduct(p)) ids.push(p.id)
    if (!data || data.length < take) break
  }
  if (!ids.length) return []
  const { data } = await query.graph({ entity: "product", fields: TYPE_FIELDS, filters: { id: ids } })
  return (data ?? []).filter(isBookingProduct)
}

export async function retrieveTypeProduct(scope: Pick<MedusaContainer, "resolve">, id: string): Promise<any | null> {
  const query: any = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "product", fields: TYPE_FIELDS, filters: { id } })
  const product = data?.[0]
  return product && isBookingProduct(product) ? product : null
}

export function requireAdmin(req: { auth_context?: { actor_type?: string; actor_id?: string } }): boolean {
  return req.auth_context?.actor_type === "user" && Boolean(req.auth_context.actor_id)
}
