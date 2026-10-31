import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { adminActor, auditAdminChange } from "../../../../lib/observability/audit"
import { getAmbassadorById, updateAmbassador, recordPayout } from "../../../../lib/ambassador/service"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!adminActor(req)) return res.status(401).json({ message: "Prihláste sa do administrácie." })

  try {
    const data = await getAmbassadorById(req.scope, req.params.id)
    return res.status(200).json(data)
  } catch (error: any) {
    if (error?.message === "CUSTOMER_NOT_FOUND" || error?.message === "NOT_AN_AMBASSADOR") {
      return res.status(404).json({ message: "Ambasádor sa nenašiel." })
    }
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("GET /admin/ambassadors/:id zlyhal", error as Error)
    return res.status(500).json({ message: "Nepodarilo sa načítať detail ambasádora." })
  }
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: "Prihláste sa do administrácie." })

  const body = (req.body ?? {}) as Record<string, unknown>
  const action = typeof body.action === "string" ? body.action : "update"

  try {
    if (action === "payout") {
      const amount = Number(body.amount)
      if (!amount || amount <= 0 || isNaN(amount)) {
        return res.status(400).json({ message: "Zadajte kladnú sumu výplaty v eurách." })
      }
      const ambassador = await recordPayout(req.scope, req.params.id, {
        amount,
        period: typeof body.period === "string" ? body.period : undefined,
        note: typeof body.note === "string" ? body.note : undefined,
        by: actor,
      })

      await auditAdminChange(req, "ambassador.payout_recorded", "customer", req.params.id, null, {
        amount,
        period: body.period,
        by: actor,
      })

      return res.status(200).json({ ambassador })
    }

    const commissionPercent = typeof body.commission_percent === "number" ? body.commission_percent : undefined
    if (commissionPercent !== undefined && (commissionPercent < 0 || commissionPercent > 100)) {
      return res.status(400).json({ message: "Provízia musí byť medzi 0 a 100 %." })
    }

    const ambassador = await updateAmbassador(req.scope, req.params.id, {
      commission_percent: commissionPercent,
      status: body.status === "paused" ? "paused" : body.status === "active" ? "active" : undefined,
      note: typeof body.note === "string" ? body.note : undefined,
      code: typeof body.code === "string" ? body.code : undefined,
    })

    await auditAdminChange(req, "ambassador.updated", "customer", req.params.id, null, {
      code: ambassador.code,
      status: ambassador.status,
      commission_percent: ambassador.commission_percent,
    })

    return res.status(200).json({ ambassador })
  } catch (error: any) {
    if (error?.message === "CUSTOMER_NOT_FOUND" || error?.message === "NOT_AN_AMBASSADOR") {
      return res.status(404).json({ message: "Ambasádor sa nenašiel." })
    }
    if (error?.message === "AMBASSADOR_CODE_ALREADY_EXISTS") {
      return res.status(409).json({ message: "Zadaný kód už používa iný ambasádor." })
    }
    if (error?.message === "INVALID_AMBASSADOR_CODE") {
      return res.status(400).json({ message: "Zadajte platný kód (3–24 znakov, len písmená, čísla a pomlčky)." })
    }
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("POST /admin/ambassadors/:id zlyhal", error as Error)
    return res.status(500).json({ message: "Ambasádora sa nepodarilo upraviť. Skúste to znova." })
  }
}
