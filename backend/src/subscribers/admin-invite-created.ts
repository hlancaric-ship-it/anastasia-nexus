import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sendEmail } from "../lib/email/send"

type InviteEvent = { id?: string; email?: string; invite_url?: string; url?: string; token?: string }
type InviteRow = { id: string; email?: string | null; token?: string | null; accepted?: boolean | null }

/** Pozvánka do vlastného adminu: jadro v udalosti pošle len id, e-mail a token sa dočítajú, odkaz vedie na #/pozvanka/<token>. */
export default async function adminInviteCreatedHandler({ event, container }: SubscriberArgs<InviteEvent | InviteEvent[]>) {
  const items = (Array.isArray(event.data) ? event.data : [event.data]).filter(Boolean) as InviteEvent[]
  const base = (process.env.ADMIN_URL || process.env.CHAT_ADMIN_URL || "").trim().replace(/\/+$/, "")
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  for (const item of items) {
    let { email, token } = item
    const id = item.id
    if (id && (!email || !token)) {
      const { data } = await query.graph({ entity: "invite", fields: ["id", "email", "token", "accepted"], filters: { id } })
      const row = data?.[0] as InviteRow | undefined
      if (!row || row.accepted) continue
      email = email || row.email || undefined
      token = token || row.token || undefined
    }
    if (!email) continue
    const resolvedUrl = item.invite_url || item.url || (/^https?:\/\//.test(base) && token ? `${base}/#/pozvanka/${encodeURIComponent(token)}` : null)
    if (!resolvedUrl) continue
    await sendEmail(container, {
      to: email,
      template: "admin-invite",
      // Opätovné odoslanie má nový token, preto ho kľúč obsahuje.
      ...(id ? { idempotency_key: `admin-invite:${id}:${(token || "").slice(-12)}`, resource_type: "invite", resource_id: id } : {}),
      data: { email, invite_url: resolvedUrl },
    })
  }
}

export const config: SubscriberConfig = { event: ["invite.created", "invite.resent"] }
