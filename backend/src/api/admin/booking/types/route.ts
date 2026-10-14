import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import { DIGITAL_PROFILE_NAME, SALES_CHANNEL_NAME } from "../../../../scripts/anastasia-bootstrap"
import { bookingMeta, createTypeSchema, listTypeProducts, requireAdmin, retrieveTypeProduct, toTypeDTO, uniqueHandle, zodMessage } from "./helpers"
import { auditAdminChange } from "../../../../lib/observability/audit"

/** GET /admin/booking/types?include_archived=true : typy konzultací (produkty s metadata.booking). */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!requireAdmin(req)) return res.status(401).json({ message: "Vyžaduje se přihlášení správce." })
  try {
    const includeArchived = String(req.query?.include_archived ?? "") === "true"
    const types = (await listTypeProducts(req.scope)).map(toTypeDTO)
      .filter((t) => includeArchived || !t.archived)
      .sort((a, b) => a.title.localeCompare(b.title, "cs"))
    return res.json({ types })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("GET /admin/booking/types selhalo", error as Error)
    return res.status(500).json({ message: "Typy konzultací se nepodařilo načíst." })
  }
}

/**
 * POST /admin/booking/types : nový typ konzultace = nový produkt přes createProductsWorkflow
 * (jedna varianta s cenou v EUR, bez skladu, digitální profil dopravy, hlavní prodejní kanál).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!requireAdmin(req)) return res.status(401).json({ message: "Vyžaduje se přihlášení správce." })
  const parsed = createTypeSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: zodMessage(parsed.error) })
  const input = parsed.data
  try {
    const query: any = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const [{ data: channels }, { data: profiles }] = await Promise.all([
      query.graph({ entity: "sales_channel", fields: ["id"], filters: { name: SALES_CHANNEL_NAME } }),
      query.graph({ entity: "shipping_profile", fields: ["id"], filters: { name: DIGITAL_PROFILE_NAME } }),
    ])
    if (channels?.length !== 1 || profiles?.length !== 1) {
      return res.status(409).json({ message: "Obchod nemá nastavený prodejní kanál nebo digitální dopravu. Kontaktujte správce systému." })
    }
    const handle = await uniqueHandle(req.scope, input.title)
    const { result } = await createProductsWorkflow(req.scope).run({ input: { products: [{
      title: input.title,
      description: input.description || undefined,
      handle,
      status: input.active ? "published" : "draft",
      shipping_profile_id: profiles[0].id,
      sales_channels: [{ id: channels[0].id }],
      options: [{ title: "Default", values: ["Default"] }],
      variants: [{
        title: input.title,
        manage_inventory: false,
        options: { Default: "Default" },
        prices: [{ amount: input.price_eur, currency_code: "eur" }],
      }],
      metadata: { booking: bookingMeta({ ...input, archived: false }) },
    }] } })
    const created = await retrieveTypeProduct(req.scope, result[0].id)
    const dto = toTypeDTO(created ?? result[0])
    await auditAdminChange(req, "booking_type.create", "booking_type", result[0].id, null, dto as unknown as Record<string, unknown>)
    return res.status(201).json({ type: dto })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("POST /admin/booking/types selhalo", error as Error)
    return res.status(500).json({ message: "Typ konzultace se nepodařilo vytvořit." })
  }
}
