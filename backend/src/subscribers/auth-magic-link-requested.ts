import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { MAGIC_LINK_REQUESTED_EVENT } from "../modules/auth-magic-link/service"

type MagicLinkRequested = { email: string; url: string; ttl_minutes: number }

/** Skutečné odeslání přihlašovacího odkazu (notifikace má plný přístup k modulům, provider ne). */
export default async function authMagicLinkRequestedHandler({ event, container }: SubscriberArgs<MagicLinkRequested>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const notification = container.resolve(Modules.NOTIFICATION)
    await notification.createNotifications({
      to: event.data.email,
      channel: "email",
      template: "magic-link-sk",
      data: { url: event.data.url, subject: "Prihlasovací odkaz k vášmu účtu ANASTASIA", ttl_minutes: event.data.ttl_minutes },
    })
  } catch (error) {
    logger.error("[auth-magic-link] odeslání e-mailu selhalo", error as Error)
  }
}

export const config: SubscriberConfig = { event: MAGIC_LINK_REQUESTED_EVENT }
