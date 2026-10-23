import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { sendEmail } from "../lib/email/send"

type InviteCreated = { id?: string; email?: string; invite_url?: string; url?: string; token?: string }

/** Notification subscriber for the core admin invite.created event. */
export default async function adminInviteCreatedHandler({ event, container }: SubscriberArgs<InviteCreated>) {
  const { email, invite_url, url, token, id } = event.data ?? {}
  if (!email) return
  const base = (process.env.ADMIN_URL || "").trim().replace(/\/+$/, "")
  const resolvedUrl = invite_url || url || (base && token ? `${base}/invite?token=${encodeURIComponent(token)}` : null)
  if (!resolvedUrl) return
  await sendEmail(container, {
    to: email,
    template: "admin-invite",
    ...(id ? { idempotency_key: `admin-invite:${id}`, resource_type: "invite", resource_id: id } : {}),
    data: { email, invite_url: resolvedUrl },
  })
}

export const config: SubscriberConfig = { event: "invite.created" }
