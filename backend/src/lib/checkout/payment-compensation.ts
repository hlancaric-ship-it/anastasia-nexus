import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { recordEvent } from "../observability/events"
import { STRIPE_PROVIDER_ID } from "./delivery-payment"

/**
 * Kompenzácia platby kartou, keď objednávka po zaplatení nevznikla (zlyhalo dokončenie košíka,
 * zmena ceny, SafeOrder REVIEW…). Zákazníčka nesmie zostať bez peňazí aj bez objednávky:
 * - autorizovaná platba (requires_capture) sa zruší,
 * - stiahnutá platba (succeeded) sa vráti celá (idempotentne, jeden refund na PaymentIntent).
 *
 * Najprv sa PaymentIntent pod zámkom košíka (rovnaký kľúč ako completeCart) zapíše do
 * `cart.metadata.compensated_payment_intents` – validate hook potom takú session odmietne, takže
 * súbežný Stripe webhook ani opakovaný checkout nemôže vytvoriť „zaplatenú“ objednávku z vrátenej platby.
 * Ak košík medzitým dokončil niekto iný (webhook), nič sa nevracia.
 * Volá priamo Stripe API (kľúč len zo servera, nič sa nevypisuje); výsledok ide do ops auditu,
 * neúspech ako `error` = alert.
 */

export const COMPENSATED_PI_KEY = "compensated_payment_intents"

export type CompensationStatus = "none" | "completed" | "canceled" | "refunded" | "failed"
export type CompensationResult = { status: CompensationStatus; payment_intents: Array<{ id: string; action: string }> }

type Container = Pick<MedusaContainer, "resolve">
type Deps = { fetch?: typeof fetch; apiKey?: string }

const PI_RE = /^pi_[A-Za-z0-9]+$/

export function compensatedPaymentIntents(metadata: Record<string, unknown> | null | undefined): string[] {
  const raw = metadata?.[COMPENSATED_PI_KEY]
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string" && PI_RE.test(id)) : []
}

/** Validate hook: session, ktorej platba bola vrátená/zrušená, už nesmie dokončiť objednávku. */
export function assertNoCompensatedSession(cart: { metadata?: Record<string, unknown> | null; payment_collection?: { payment_sessions?: Array<{ data?: Record<string, unknown> | null }> | null } | null }) {
  const compensated = new Set(compensatedPaymentIntents(cart.metadata))
  if (!compensated.size) return
  for (const session of cart.payment_collection?.payment_sessions || []) {
    const id = session?.data?.id
    if (typeof id === "string" && compensated.has(id)) throw new Error("PAYMENT_COMPENSATED")
  }
}

async function stripe(deps: Required<Deps>, method: "GET" | "POST", path: string, body?: Record<string, string>, idempotencyKey?: string) {
  const response = await deps.fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(10000),
    headers: {
      authorization: `Bearer ${deps.apiKey}`,
      ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  })
  let json: any = null
  try { json = await response.json() } catch { json = null }
  if (!response.ok) throw new Error(`STRIPE_${response.status}_${typeof json?.error?.code === "string" ? json.error.code : "ERROR"}`)
  return json
}

export async function compensateUnfinishedCheckout(container: Container, cartId: string, reason: string, deps: Deps = {}): Promise<CompensationResult> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const fields = ["id", "completed_at", "metadata", "payment_collection.payment_sessions.provider_id", "payment_collection.payment_sessions.data"]
  const load = async () => (await query.graph({ entity: "cart", fields, filters: { id: cartId } })).data?.[0]
  const cart = await load()
  const intents = [...new Set((cart?.payment_collection?.payment_sessions || [])
    .filter((s: any) => s?.provider_id === STRIPE_PROVIDER_ID && typeof s?.data?.id === "string" && PI_RE.test(s.data.id))
    .map((s: any) => s.data.id as string))] as string[]
  if (!cart || !intents.length) return { status: "none", payment_intents: [] }
  if (cart.completed_at) return { status: "completed", payment_intents: [] }

  const apiKey = deps.apiKey ?? (process.env.STRIPE_API_KEY || "").trim()
  const resolved: Required<Deps> = { fetch: deps.fetch ?? fetch, apiKey }
  const result: CompensationResult = { status: "none", payment_intents: [] }
  try {
    if (!/^(sk|rk)_(test|live)_/.test(apiKey)) throw new Error("STRIPE_NOT_CONFIGURED")
    // Zámok košíka: buď objednávka už vznikla (nevraciame), alebo ju odteraz žiadna cesta nedokončí s touto platbou.
    const locking = container.resolve(Modules.LOCKING) as any
    const completed = await locking.execute(cartId, async () => {
      const current = await load()
      if (!current || current.completed_at) return true
      const metadata = { ...(current.metadata || {}) }
      metadata[COMPENSATED_PI_KEY] = [...new Set([...compensatedPaymentIntents(current.metadata), ...intents])]
      await (container.resolve(Modules.CART) as any).updateCarts(cartId, { metadata })
      return false
    }, { timeout: 15 })
    if (completed) return { status: "completed", payment_intents: [] }

    for (const id of intents) {
      const intent = await stripe(resolved, "GET", `payment_intents/${id}`)
      if (intent?.status === "requires_capture") {
        await stripe(resolved, "POST", `payment_intents/${id}/cancel`, { cancellation_reason: "abandoned" }, `checkout-compensation-cancel:${id}`)
        result.payment_intents.push({ id, action: "canceled" })
      } else if (intent?.status === "succeeded") {
        await stripe(resolved, "POST", "refunds", { payment_intent: id, reason: "requested_by_customer", "metadata[reason]": reason.slice(0, 60) }, `checkout-compensation-refund:${id}`)
        result.payment_intents.push({ id, action: "refunded" })
      } else if (intent?.status === "processing") {
        throw new Error("STRIPE_PAYMENT_PROCESSING")
      } else {
        result.payment_intents.push({ id, action: "nothing_to_do" })
      }
    }
    result.status = result.payment_intents.some((p) => p.action === "refunded") ? "refunded"
      : result.payment_intents.some((p) => p.action === "canceled") ? "canceled" : "none"
    if (result.status !== "none") {
      await recordEvent(container as any, "warn", "checkout", "payment_compensated", { cart_id: cartId, reason, payment_intents: result.payment_intents.map((p) => `${p.id}:${p.action}`) })
    }
    return result
  } catch (error) {
    const code = error instanceof Error && /^[A-Z][A-Z0-9_]{2,80}$/.test(error.message) ? error.message : "COMPENSATION_FAILED"
    // Alert: zákazníčka mohla zaplatiť bez objednávky – vyžaduje ručnú kontrolu v Stripe.
    await recordEvent(container as any, "error", "checkout", "payment_compensation_failed", { cart_id: cartId, reason, error_code: code, payment_intents: intents }).catch(() => undefined)
    return { status: "failed", payment_intents: result.payment_intents }
  }
}
