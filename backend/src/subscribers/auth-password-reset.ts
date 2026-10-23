import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { sendEmail } from "../lib/email/send"

type PasswordReset = { entity_id?: string; actor_type?: string; token?: string }

/** Obnova hesla správcu: jadro vydá token, odkaz vedie do vlastného adminu (#/obnova-hesla/<token>). Zákazníci používajú magic link. */
export default async function authPasswordResetHandler({ event, container }: SubscriberArgs<PasswordReset>) {
  const { entity_id: email, actor_type, token } = event.data ?? {}
  if (actor_type !== "user" || !email || !token) return
  const base = (process.env.ADMIN_URL || process.env.CHAT_ADMIN_URL || "").trim().replace(/\/+$/, "")
  if (!/^https?:\/\//.test(base)) return
  await sendEmail(container, {
    to: email,
    template: "admin-password-reset",
    data: { email, url: `${base}/#/obnova-hesla/${encodeURIComponent(token)}` },
  })
}

export const config: SubscriberConfig = { event: "auth.password_reset" }
