import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { adminActor, auditAdminChange } from "../../../lib/observability/audit"
import { listAmbassadors, createAmbassador } from "../../../lib/ambassador/service"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!adminActor(req)) return res.status(401).json({ message: "Prihláste sa do administrácie." })

  try {
    const { ambassadors, count } = await listAmbassadors(req.scope)
    const totals = {
      total_ambassadors: count,
      active_ambassadors: ambassadors.filter((a) => a.status === "active").length,
      total_orders: ambassadors.reduce((s, a) => s + a.orders_count, 0),
      total_revenue: Math.round(ambassadors.reduce((s, a) => s + a.revenue, 0) * 100) / 100,
      total_commission: Math.round(ambassadors.reduce((s, a) => s + a.commission_total, 0) * 100) / 100,
      total_pending: Math.round(ambassadors.reduce((s, a) => s + a.commission_pending, 0) * 100) / 100,
      total_paid: Math.round(ambassadors.reduce((s, a) => s + a.commission_paid, 0) * 100) / 100,
    }
    return res.status(200).json({ ambassadors, count, totals })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("GET /admin/ambassadors zlyhal", error as Error)
    return res.status(500).json({ message: "Nepodarilo sa načítať zoznam ambasádorov." })
  }
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: "Prihláste sa do administrácie." })

  const body = (req.body ?? {}) as Record<string, unknown>
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : ""
  if (!code || !/^[A-Z0-9_-]{3,24}$/.test(code)) {
    return res.status(400).json({ message: "Zadajte platný kód ambasádora (3–24 znakov, len písmená, čísla a pomlčky)." })
  }

  const commissionPercent = typeof body.commission_percent === "number" ? body.commission_percent : undefined
  if (commissionPercent !== undefined && (commissionPercent < 0 || commissionPercent > 100)) {
    return res.status(400).json({ message: "Provízia musí byť medzi 0 a 100 %." })
  }

  try {
    const ambassador = await createAmbassador(req.scope, {
      customer_id: typeof body.customer_id === "string" ? body.customer_id : undefined,
      email: typeof body.email === "string" ? body.email : undefined,
      name: typeof body.name === "string" ? body.name : undefined,
      code,
      commission_percent: commissionPercent,
      note: typeof body.note === "string" ? body.note : undefined,
      status: body.status === "paused" ? "paused" : "active",
    })

    await auditAdminChange(req, "ambassador.created", "customer", ambassador.id, null, {
      code: ambassador.code,
      commission_percent: ambassador.commission_percent,
      status: ambassador.status,
    })

    return res.status(201).json({ ambassador })
  } catch (error: any) {
    if (error?.message === "AMBASSADOR_CODE_ALREADY_EXISTS") {
      return res.status(409).json({ message: `Kód „${code}“ už používa iný ambasádor. Zvoľte iný.` })
    }
    if (error?.message === "EMAIL_OR_CUSTOMER_ID_REQUIRED") {
      return res.status(400).json({ message: "Zadajte e-mail alebo vyberte existujúceho zákazníka." })
    }
    if (error?.message === "CUSTOMER_NOT_FOUND") {
      return res.status(404).json({ message: "Zákazník sa nenašiel." })
    }
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("POST /admin/ambassadors zlyhal", error as Error)
    return res.status(500).json({ message: "Ambasádora sa nepodarilo vytvoriť. Skúste to znova." })
  }
}
