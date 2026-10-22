import { resolveDeployEnv, type DeployEnv } from "../../lib/deploy-env"
import { batchSize, dailyLimit, hasNewsletterSecret, newsletterBaseUrl, newsletterSecret } from "./policy"

/**
 * Nastavenie behu newslettera z prostredia. Allowlist sa počíta rovnako ako v medusa-config:
 * v testovacej prevádzke (staging, náhľad, PAYMENTS_TEST_MODE) bez zoznamu neodíde nič.
 */
export type NewsletterRuntime = {
  configured: boolean
  secret: string | null
  baseUrl: string
  batch: number
  dailyLimit: number
  allowlist: string[] | undefined
}

export function newsletterRecipientAllowlist(env: NodeJS.ProcessEnv = process.env, deploy: DeployEnv = resolveDeployEnv(env)): string[] | undefined {
  const raw = (env.EMAIL_RECIPIENT_ALLOWLIST || "").trim()
  const testTraffic = deploy.paymentsTestMode || (deploy.onCloud && deploy.cloudType !== "production")
  if (!raw && !testTraffic) return undefined
  return raw ? raw.split(",").map(entry => entry.trim()).filter(Boolean) : []
}

export function newsletterRuntime(env: NodeJS.ProcessEnv = process.env, deploy: DeployEnv = resolveDeployEnv(env)): NewsletterRuntime {
  const configured = hasNewsletterSecret(env)
  return {
    configured,
    secret: configured ? newsletterSecret(env) : null,
    baseUrl: newsletterBaseUrl(env),
    batch: batchSize(env),
    dailyLimit: dailyLimit(env),
    allowlist: newsletterRecipientAllowlist(env, deploy),
  }
}
