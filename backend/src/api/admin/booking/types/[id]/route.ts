import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow, updateProductVariantsWorkflow } from "@medusajs/medusa/core-flows"
import { bookingMeta, requireAdmin, retrieveTypeProduct, toTypeDTO, updateTypeSchema, zodMessage } from "../helpers"
import { auditAdminChange } from "../../../../../lib/observability/audit"
import { requireAdminCapability } from "../../../../../lib/admin/guard"

/** GET /admin/booking/types/:id */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!requireAdmin(req)) return res.status(401).json({ message: "Vyžaduje se přihlášení správce." })
  try {
    const product = await retrieveTypeProduct(req.scope, req.params.id)
    if (!product) return res.status(404).json({ message: "Typ konzultace neexistuje." })
    return res.json({ type: toTypeDTO(product) })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("GET /admin/booking/types/:id selhalo", error as Error)
    return res.status(500).json({ message: "Typ konzultace se nepodařilo načíst." })
  }
}

/**
 * POST /admin/booking/types/:id : úprava, (de)aktivace a archivace typu přes Medusa workflows.
 * Archivace = produkt do konceptu + metadata.booking.archived; existující rezervace zůstávají platné.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!requireAdmin(req)) return res.status(401).json({ message: "Vyžaduje se přihlášení správce." })
  const parsed = updateTypeSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: zodMessage(parsed.error) })
  const input = parsed.data
  try {
    const product = await retrieveTypeProduct(req.scope, req.params.id)
    if (!product) return res.status(404).json({ message: "Typ konzultace neexistuje." })
    const current = toTypeDTO(product)
    if (input.price_eur !== undefined && input.price_eur !== current.price_eur) {
      // Cenu konzultace mení len vlastník (asistent nesmie meniť ceny).
      if (!(await requireAdminCapability(req, res, "pricing"))) return
      if (!current.variant_id) return res.status(409).json({ message: "Typ konzultace nemá variantu s cenou." })
      await updateProductVariantsWorkflow(req.scope).run({ input: {
        product_variants: [{ id: current.variant_id, prices: [{ amount: input.price_eur, currency_code: "eur" }] }],
      } })
    }
    const archived = input.archived ?? current.archived
    const active = archived ? false : (input.active ?? current.active)
    await updateProductsWorkflow(req.scope).run({ input: { products: [{
      id: product.id,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      status: active ? "published" : "draft",
      metadata: {
        ...(product.metadata ?? {}),
        booking: {
          ...(product.metadata?.booking ?? {}),
          ...bookingMeta({
            duration_minutes: input.duration_minutes ?? current.duration_minutes,
            buffer_minutes: input.buffer_minutes ?? current.buffer_minutes,
            form: input.form ?? current.form,
            archived,
          }),
        },
      },
    }] } })
    const updated = await retrieveTypeProduct(req.scope, product.id)
    const dto = toTypeDTO(updated)
    await auditAdminChange(req, "booking_type.update", "booking_type", product.id, toTypeDTO(product) as unknown as Record<string, unknown>, dto as unknown as Record<string, unknown>)
    return res.json({ type: dto })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("POST /admin/booking/types/:id selhalo", error as Error)
    return res.status(500).json({ message: "Typ konzultace se nepodařilo uložit." })
  }
}
