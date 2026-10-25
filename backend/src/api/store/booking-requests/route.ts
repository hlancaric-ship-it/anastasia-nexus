import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { BOOKING_MODULE } from "../../../modules/booking"
import type BookingModuleService from "../../../modules/booking/service"
import { loadBookableProduct } from "../../../modules/booking/offer"
import { parseBookingRequest } from "../../../modules/booking/request-policy"
import { adminRequestsUrl, claimRequestAttempt, notifySafe, productTitle, publicRequest } from "../../../lib/booking-requests"

const OK_MESSAGE = "Ďakujeme, žiadosť o termín je odoslaná. Po schválení Vám príde e-mail s odkazom na platbu."

/**
 * POST /store/booking-requests { product_id, starts_at, name, email, phone?, note?, consent: true, website: "" }
 * Klient navrhne vlastný termín. Nič sa neblokuje ani neplatí, Lucia žiadosť schváli alebo zamietne v adminu.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const body = (req.body ?? {}) as Record<string, unknown>
  try {
    const productId = typeof body.product_id === "string" ? body.product_id.trim() : ""
    const product = productId ? await loadBookableProduct(req.scope, productId) : null
    if (!product && !String(body.website ?? "").trim()) return res.status(404).json({ ok: false, error: "BOOKING_TYPE_NOT_FOUND", message: "Táto konzultácia sa nedá rezervovať." })
    const parsed = parseBookingRequest(body, product?.config.durationMinutes ?? 60, product?.config.timezone ?? "Europe/Bratislava")
    if (parsed.ok === "spam") return res.status(201).json({ ok: true, message: OK_MESSAGE })
    if (parsed.ok === false) return res.status(400).json({ ok: false, error: "BOOKING_REQUEST_INVALID", errors: parsed.errors, message: "Skontrolujte termín, meno, e-mail a potvrďte informácie o súkromí." })
    const allowed = await claimRequestAttempt(req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION), req.ip || req.socket.remoteAddress || "unknown-peer")
    if (!allowed) return res.status(429).json({ ok: false, error: "BOOKING_REQUEST_RATE_LIMITED", message: "Odoslali ste viac žiadostí za krátky čas. Skúste to prosím neskôr." })

    const config = product!.config
    const v = parsed.value
    const endsAt = new Date(v.starts_at.getTime() + config.durationMinutes * 60_000)
    const service = req.scope.resolve(BOOKING_MODULE) as BookingModuleService
    const busy = await service.listActiveInRange(new Date(v.starts_at.getTime() - 4 * 3_600_000), new Date(endsAt.getTime() + 4 * 3_600_000))
    const clash = busy.some((b) => b.start.getTime() < endsAt.getTime() + config.bufferMinutes * 60_000
      && b.end.getTime() + (b.bufferMinutes ?? 0) * 60_000 > v.starts_at.getTime())
    if (clash) return res.status(409).json({ ok: false, error: "BOOKING_REQUEST_TAKEN", message: "Tento čas je už obsadený. Vyberte prosím iný." })

    const request = await service.createBookingRequests({
      product_id: product!.id, starts_at: v.starts_at, ends_at: endsAt, name: v.name, email: v.email, phone: v.phone, note: v.note, status: "pending",
    })
    const title = await productTitle(req.scope, product!.id)
    const data = { name: v.name, email: v.email, phone: v.phone, note: v.note, product_title: title, starts_at: v.starts_at.toISOString(), ends_at: endsAt.toISOString() }
    const to = (process.env.CONTACT_NOTIFY_EMAIL || process.env.CHAT_ADMIN_NOTIFY_EMAIL || "").trim()
    if (to) await notifySafe(req.scope, { to, template: "booking-request-admin", data: { ...data, url: adminRequestsUrl() }, resource_type: "booking_request", resource_id: request.id, idempotency_key: `booking-request.admin:${request.id}` })
    else logger.error("[booking-request] chýba CONTACT_NOTIFY_EMAIL – Lucia sa o žiadosti dozvie len z adminu")
    await notifySafe(req.scope, { to: v.email, template: "booking-request-received-sk", data, resource_type: "booking_request", resource_id: request.id, idempotency_key: `booking-request.received:${request.id}` })
    return res.status(201).json({ ok: true, message: OK_MESSAGE, request: publicRequest(request) })
  } catch (error) {
    logger.error("POST /store/booking-requests zlyhalo", error as Error)
    return res.status(500).json({ ok: false, error: "BOOKING_REQUEST_FAILED", message: "Žiadosť sa nepodarilo odoslať. Skúste to prosím znova o chvíľu." })
  }
}
