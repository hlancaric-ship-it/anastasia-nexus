import { normalizeEmail } from "./policy"

export async function saveRegistrationNewsletterConsent(container: any, data: { email?: unknown; newsletter_version?: unknown }) {
  const email = normalizeEmail(data.email)
  const version = typeof data.newsletter_version === "string" ? data.newsletter_version : ""
  if (!email || !version || version.length > 100) return
  const legal = container.resolve("legal") as any
  await legal.subscribe({ email, source: "account-registration", text_version: version })
}
