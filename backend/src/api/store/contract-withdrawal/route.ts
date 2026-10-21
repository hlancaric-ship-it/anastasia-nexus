import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sendEmail } from "../../../lib/email/send"
import { legalService } from "../../legal-helpers"
import { parseContractWithdrawal } from "./policy"

/**
 * POST /store/contract-withdrawal – online odstúpenie od zmluvy (časť C právnych textov klientky).
 * Oznámenie sa uloží ako záznam pre správcu a zákazníkovi ide potvrdenie doručenia.
 * Verejné: prihlásenie nie je potrebné, zákazník môže odstúpiť aj e-mailom.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const auth = (req as any).auth_context
  const customer = auth?.actor_type === "customer" ? auth.actor_id : null
  const parsed = parseContractWithdrawal(req.body, customer)
  // Robot dostane rovnakú odpoveď ako človek, nič sa neuloží a neodošle.
  if (parsed.ok === "spam") return res.json({ ok: true, message: "Ďakujeme, odstúpenie od zmluvy sme prijali. Potvrdenie doručenia Vám pošleme e-mailom." })
  if (!parsed.ok) {
    return res.status(400).json({
      ok: false,
      error: "CONTRACT_WITHDRAWAL_INVALID",
      errors: parsed.errors,
      message: "Skontrolujte číslo objednávky, e-mail, položky a dátum objednávky a potvrďte informácie o súkromí.",
    })
  }
  const value = parsed.value
  try {
    const { row, replayed } = await legalService(req).requestContractWithdrawal(value)
    // Idempotencia: rovnaké oznámenie poslané dvakrát nevyrobí druhý záznam ani druhý e-mail.
    await sendEmail(req.scope, {
      to: value.email,
      template: "contract-withdrawal-received-sk",
      idempotency_key: `contract-withdrawal.received:${row.id}`,
      resource_id: row.id,
      resource_type: "contract_withdrawal",
      data: {
        order_number: value.order_number,
        items: value.items,
        order_date: value.order_date,
        reason: value.reason,
        first_name: value.name,
        received_at: new Date(row.received_at ?? Date.now()).toISOString(),
      },
    })
    const admin = (process.env.CONTACT_NOTIFY_EMAIL || process.env.CHAT_ADMIN_NOTIFY_EMAIL || "").trim()
    if (admin) {
      await sendEmail(req.scope, {
        to: admin,
        template: "contract-withdrawal-admin",
        resource_id: row.id,
        resource_type: "contract_withdrawal",
        data: {
          order_number: value.order_number,
          items: value.items,
          email: value.email,
          first_name: value.name,
          received_at: new Date(row.received_at ?? Date.now()).toISOString(),
        },
      }).catch(() => undefined)
    }
    return res.status(replayed ? 200 : 201).json({
      ok: true,
      replayed,
      withdrawal: { id: row.id, order_number: row.order_number, status: row.status, received_at: row.received_at },
      message: "Ďakujeme, odstúpenie od zmluvy sme prijali. Potvrdenie doručenia Vám pošleme e-mailom.",
    })
  } catch (error) {
    logger.error("[contract-withdrawal] odoslanie odstúpenia zlyhalo")
    return res.status(503).json({ ok: false, error: "CONTRACT_WITHDRAWAL_UNAVAILABLE", message: "Odstúpenie sa teraz nedá odoslať. Skúste to prosím neskôr alebo nám napíšte e-mailom." })
  }
}
