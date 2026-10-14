import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { MAGIC_LINK_REQUESTED_EVENT } from "../modules/auth-magic-link/service"
import { recordEvent } from "../lib/observability/events"

type MagicLinkRequested = { email: string; url: string; ttl_minutes: number }

/** Skutečné odeslání přihlašovacího odkazu (notifikace má plný přístup k modulům, provider ne). */
export default async function authMagicLinkRequestedHandler({ event, container }: SubscriberArgs<MagicLinkRequested>) {
  try {
    const notification = container.resolve(Modules.NOTIFICATION)
    await notification.createNotifications({
      to: event.data.email,
      channel: "email",
      template: "magic-link-sk",
      data: { url: event.data.url, subject: "Prihlasovací odkaz k vášmu účtu ANASTASIA", ttl_minutes: event.data.ttl_minutes },
    })
  } catch (error) {
    await recordEvent(container, "error", "notification", "magic_link_send_failed", { error })
  }
}

export const config: SubscriberConfig = { event: MAGIC_LINK_REQUESTED_EVENT }
