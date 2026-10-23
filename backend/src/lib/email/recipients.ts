/**
 * Kdo smí dostat e-mail a kdo ho doručí. Čistá funkce bez závislostí, používá ji medusa-config.ts
 * (Resend/ZeptoMail provider mimo Cloud) i sendEmail (Medusa Emails na Cloudu), proto žádné importy z frameworku.
 */
import type { DeployEnv } from "../deploy-env"

type Env = Record<string, string | undefined>

/**
 * Testovací provoz (PAYMENTS_TEST_MODE na ostrém Cloudu, staging, náhledy PR): e-maily jen na EMAIL_RECIPIENT_ALLOWLIST,
 * bez seznamu neodejde nic. Ostrý provoz bez omezení, pokud seznam výslovně nenastavíš.
 */
export function emailRecipientAllowlist(deploy: Pick<DeployEnv, "onCloud" | "cloudType" | "paymentsTestMode">, env: Env = process.env): string[] | undefined {
  const raw = (env.EMAIL_RECIPIENT_ALLOWLIST || "").trim()
  const testTraffic = deploy.paymentsTestMode || (deploy.onCloud && deploy.cloudType !== "production")
  return raw || testTraffic ? raw.split(",").map((entry) => entry.trim()).filter(Boolean) : undefined
}

/** Na Cloudu doručuje kanál email vždy Medusa Emails (rozhodnutí 2026-10-23), Resend/ZeptoMail jen mimo Cloud. */
export function usesMedusaEmails(deploy: Pick<DeployEnv, "onCloud">): boolean {
  return deploy.onCloud
}
