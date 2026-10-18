import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { adminActor } from "../../../../lib/observability/audit"
import { getRecord, describeRecord } from "../registry"
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!adminActor(req)) return res.status(401).json({ message: "Vyžaduje sa prihlásenie správcu." })
  try {
    const record = await getRecord(req.scope, req.params.id)
    if (!record) return res.status(404).json({ message: "QR kód sa nenašiel." })
    return res.json({ link: await describeRecord(req.scope, record) })
  } catch { return res.status(503).json({ message: "QR kód sa nepodarilo načítať. Skúste to znova." }) }
}
