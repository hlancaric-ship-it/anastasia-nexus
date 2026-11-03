import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { adminActor, auditAdminChange } from "../../../../lib/observability/audit"
import { getAmbassadorSettings, updateAmbassadorSettings } from "../../../../lib/ambassador/service"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!adminActor(req)) return res.status(401).json({ message: "Prihláste sa do administrácie." })

  try {
    const settings = await getAmbassadorSettings(req.scope)
    return res.status(200).json({ settings })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("GET /admin/ambassadors/settings zlyhal", error as Error)
    return res.status(500).json({ message: "Nastavenie ambasadorského programu sa nepodarilo načítať." })
  }
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: "Prihláste sa do administrácie." })

  const body = (req.body ?? {}) as Record<string, unknown>
  const enabled = typeof body.enabled === "boolean" ? body.enabled : undefined
  const defaultPercent = typeof body.default_percent === "number" ? body.default_percent : undefined
  const cookieDays = typeof body.cookie_days === "number" ? body.cookie_days : undefined

  if (defaultPercent !== undefined && (defaultPercent < 0 || defaultPercent > 100)) {
    return res.status(400).json({ message: "Predvolená provízia musí byť medzi 0 a 100 %." })
  }
  if (cookieDays !== undefined && (cookieDays < 1 || cookieDays > 365)) {
    return res.status(400).json({ message: "Platnosť odporúčania musí byť od 1 do 365 dní." })
  }

  try {
    const current = await getAmbassadorSettings(req.scope)
    const settings = await updateAmbassadorSettings(req.scope, {
      enabled,
      default_percent: defaultPercent,
      cookie_days: cookieDays,
      attribution: body.attribution === "first_click" ? "first_click" : body.attribution === "last_click" ? "last_click" : undefined,
    })

    await auditAdminChange(req, "ambassador.settings_updated", "store", "global", current as any, settings as any)
    return res.status(200).json({ settings })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("POST /admin/ambassadors/settings zlyhal", error as Error)
    return res.status(500).json({ message: "Nastavenia sa nepodarilo uložiť. Skúste to znova." })
  }
}
