import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { AUTH_REGISTRATION_CONFIRMED_EVENT, MAGIC_LINK_REQUESTED_EVENT } from "../modules/auth-magic-link/service"
import { sendEmail } from "../lib/email/send"
import { recordEvent } from "../lib/observability/events"
import { saveRegistrationNewsletterConsent } from "../modules/auth-magic-link/registration-newsletter"

type MagicLinkRequested = { email: string; url?: string; ttl_minutes?: number; newsletter_version?: string }

/** Skutečné odeslání přihlašovacího odkazu (notifikace má plný přístup k modulům, provider ne). */
export default async function authMagicLinkRequestedHandler({ event, container }: SubscriberArgs<MagicLinkRequested>) {
  if (event.name === AUTH_REGISTRATION_CONFIRMED_EVENT) {
    await saveRegistrationNewsletterConsent(container, event.data)
    return
  }
  try {
    await sendEmail(container, {
      to: event.data.email,
      template: "magic-link-sk",
      data: { url: event.data.url, ttl_minutes: event.data.ttl_minutes },
    })
  } catch (error) {
    await recordEvent(container, "error", "notification", "magic_link_send_failed", { error })
  }
}

export const config: SubscriberConfig = { event: [MAGIC_LINK_REQUESTED_EVENT, AUTH_REGISTRATION_CONFIRMED_EVENT] }
