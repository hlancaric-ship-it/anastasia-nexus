import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { ILockingModule, IPricingModuleService } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { z } from "zod"
import { adminActor, auditAdminChange } from "../../../../lib/observability/audit"

const euro = z.number().finite().min(0).max(999999999.99).refine(n => Number(n.toFixed(2)) === n)
export const priceInput = z.object({ price_id: z.string().min(1).max(100), amount: euro, expected_amount: euro }).strict()

/** Restricted base-price edit. Native pricing updates replace the base-price collection;
 * reject complex sets instead of silently deleting other currencies/rules. Price-list sales
 * are excluded by the native updatePriceSets contract and remain untouched. */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!adminActor(req)) return res.status(401).json({ message: "Prihláste sa do administrácie." })
  const input = priceInput.safeParse(req.body)
  if (!input.success) return res.status(400).json({ message: "Zadajte nezápornú cenu v eurách, najviac dve desatinné miesta." })
  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({ entity: "product_variant", fields: ["id", "price_set.id"], filters: { id: req.params.id } })
    const priceSet = data[0]?.price_set?.id
    if (!priceSet) return res.status(404).json({ message: "Varianta alebo jej cena sa nenašla." })
    const pricing = req.scope.resolve<IPricingModuleService>(Modules.PRICING)
    const locking = req.scope.resolve<ILockingModule>(Modules.LOCKING)
    return await locking.execute(`shop-price:${priceSet}`, async () => {
      const read = () => pricing.listPrices({ price_set_id: [priceSet] }, { relations: ["price_list", "price_rules"], take: null })
      const rows = await read()
      const base = rows.filter(p => !p.price_list)
      const price = base[0]
      if (base.length !== 1 || price.id !== input.data.price_id || price.currency_code !== 'eur' ||
          price.min_quantity != null || price.max_quantity != null || price.price_rules?.length || Number(price.amount) !== input.data.expected_amount) {
        return res.status(409).json({ message: "Cena sa zmenila alebo má osobitné pravidlá. Obnovte údaje; ostatné ceny zostali zachované." })
      }
      await pricing.updatePriceSets(priceSet, { prices: [{ id: price.id, currency_code: 'eur', amount: input.data.amount }] })
      const after = (await read()).find(p => p.id === price.id && !p.price_list)
      if (!after || Number(after.amount) !== input.data.amount) throw new Error("PRICE_READBACK_MISMATCH")
      await auditAdminChange(req, "shop.price.update", "price", price.id, { amount: Number(price.amount), currency_code: 'eur' }, { amount: Number(after.amount), currency_code: 'eur' })
      return res.json({ price: { id: after.id, variant_id: req.params.id, amount: Number(after.amount), currency_code: 'eur' } })
    })
  } catch {
    return res.status(503).json({ message: "Výsledok zmeny ceny treba overiť. Načítajte aktuálne údaje pred ďalším pokusom." })
  }
}
