import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { freeShippingThreshold } from "../../../../lib/checkout/delivery-payment"

/**
 * Hranica dopravy zdarma pre ukazovateľ v košíku. Berie sa z pravidiel ceny kuriéra v Meduse
 * (item_total gte X → 0 €), takže košík ukazuje to isté, čo neskôr naúčtuje pokladňa.
 * O cene dopravy rozhoduje vždy server v /store/nexus-checkout/options.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
    const { data } = await query.graph({
      entity: "shipping_option",
      fields: ["id", "type.code", "prices.amount", "prices.currency_code", "prices.price_rules.attribute", "prices.price_rules.operator", "prices.price_rules.value"],
    })
    const eur = (option: any) => (option?.prices || []).filter((price: any) => !price.currency_code || price.currency_code === "eur")
    // Základná cena = cena bez pravidla (pravidlá item_total sú zľavy dopravy).
    const base = (option: any) => {
      const amounts = eur(option).filter((price: any) => !(price.price_rules || []).length).map((price: any) => Number(price.amount)).filter((n: number) => Number.isFinite(n) && n >= 0)
      return amounts.length ? Math.min(...amounts) : null
    }
    const ofType = (code: string) => (data || []).filter((option: any) => option?.type?.code === code)
    const thresholds = ofType("courier").map((option: any) => freeShippingThreshold(eur(option))).filter((value: number | null): value is number => value !== null)
    const lowest = (code: string) => { const values = ofType(code).map(base).filter((n: number | null): n is number => n !== null); return values.length ? Math.min(...values) : null }
    res.setHeader("cache-control", "public, max-age=300")
    return res.status(200).json({ ok: true, currency_code: "eur", threshold: thresholds.length ? Math.min(...thresholds) : null, courier: lowest("courier"), pickup: lowest("pickup") })
  } catch {
    return res.status(200).json({ ok: true, currency_code: "eur", threshold: null, courier: null, pickup: null })
  }
}
