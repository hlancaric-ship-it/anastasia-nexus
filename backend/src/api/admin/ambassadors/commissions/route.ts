import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { adminActor } from "../../../../lib/observability/audit"
import { listAmbassadors, getAmbassadorById } from "../../../../lib/ambassador/service"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!adminActor(req)) return res.status(401).json({ message: "Prihláste sa do administrácie." })

  try {
    const { ambassadors } = await listAmbassadors(req.scope)
    const allCommissions: any[] = []

    for (const amb of ambassadors) {
      const { orders } = await getAmbassadorById(req.scope, amb.id)
      for (const o of orders) {
        allCommissions.push({
          order_id: o.id,
          display_id: o.display_id,
          created_at: o.created_at,
          ambassador_id: amb.id,
          ambassador_name: amb.name,
          ambassador_code: amb.code,
          customer_name: o.customer_name,
          order_total: o.total,
          commission_percent: o.commission_percent,
          commission_amount: o.commission_amount,
          order_status: o.order_status,
          payment_status: o.payment_status,
        })
      }
    }

    allCommissions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    const totals = {
      total_commissions_count: allCommissions.length,
      total_order_volume: Math.round(allCommissions.reduce((s, c) => s + (c.order_status !== "canceled" ? c.order_total : 0), 0) * 100) / 100,
      total_commission_amount: Math.round(allCommissions.reduce((s, c) => s + (c.order_status !== "canceled" ? c.commission_amount : 0), 0) * 100) / 100,
    }

    return res.status(200).json({ commissions: allCommissions, totals })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error("GET /admin/ambassadors/commissions zlyhal", error as Error)
    return res.status(500).json({ message: "Zoznam provízií sa nepodarilo načítať." })
  }
}
