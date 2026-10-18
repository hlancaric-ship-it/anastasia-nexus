import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { adminActor, auditAdminChange } from "../../../../lib/observability/audit"
import { importInput, legacyLink, recordId, tenant, getRecord, saveRecord } from "../registry"
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: "Vyžaduje sa prihlásenie správcu." })
  const parsed = importInput.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: "Skontrolujte zoznam odkazov (najviac 100) a dátumy vydania." })
  let entries: any[]
  try {
    entries = parsed.data.links.map(row => ({ ...row, input: legacyLink(row.url) }))
    if (entries.some(row => row.issued_at && Date.parse(row.issued_at) > Date.now())) throw new Error("FUTURE_ISSUE_DATE")
  } catch { return res.status(400).json({ message: "Odkaz musí mať povolenú doménu a pôvodný tvar produkt/kupon/ks. Dátum vydania nesmie byť v budúcnosti." }) }
  try {
    const tenantId = tenant(), seen = new Set<string>()
    let created = 0, existing = 0
    for (const row of entries) {
      const id = recordId(tenantId, row.url)
      if (seen.has(id) || await getRecord(req.scope, id)) { existing++; continue }
      seen.add(id)
      if (parsed.data.dry_run) { created++; continue }
      const result = await saveRecord(req.scope, row.input, row.url, "legacy", actor, row.issued_at ?? null)
      if (result.created) {
        created++
        await auditAdminChange(req, "qr.imported", "coupon_link", id, null, { source: "legacy" })
      } else existing++
    }
    return res.json({ dry_run: parsed.data.dry_run, created, existing, total: entries.length })
  } catch { return res.status(503).json({ message: "Import sa nepodarilo dokončiť. Zopakujte rovnaký zoznam; existujúce záznamy aj čerpanie zostanú zachované." }) }
}
