import { loadEnv, defineConfig, Modules } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

const isProduction = process.env.NODE_ENV === "production"
const jwtSecret = process.env.JWT_SECRET || (isProduction ? "" : "local-development-jwt-secret-change-before-deploy")
const cookieSecret = process.env.COOKIE_SECRET || (isProduction ? "" : "local-development-cookie-secret-change-before-deploy")
const storeCors = process.env.STORE_CORS || (isProduction ? "" : "http://localhost:8000")
const adminCors = process.env.ADMIN_CORS || (isProduction ? "" : "http://localhost:9000")
const authCors = process.env.AUTH_CORS || (isProduction ? "" : "http://localhost:9000")
const productionOriginListIsSafe = (value: string) => value.split(",").every((entry) => {
  try {
    const origin = new URL(entry.trim())
    return origin.protocol === "https:" && origin.origin === entry.trim()
  } catch {
    return false
  }
})
const productionSecretIsSafe = (value: string) => value.length >= 32 && !/^(replace|local|change|supersecret)/i.test(value)
if (isProduction && (
  !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL || "") ||
  !productionSecretIsSafe(jwtSecret) || !productionSecretIsSafe(cookieSecret) || jwtSecret === cookieSecret ||
  !storeCors || !adminCors || !authCors ||
  !productionOriginListIsSafe(storeCors) || !productionOriginListIsSafe(adminCors) || !productionOriginListIsSafe(authCors)
)) {
  throw new Error("Production requires PostgreSQL, unique 32+ character secrets, and HTTPS-only STORE_CORS, ADMIN_CORS, and AUTH_CORS origins")
}

const env = (name: string): string => (process.env[name] || "").trim()
const flag = (name: string, fallback: boolean): boolean => {
  const value = env(name).toLowerCase()
  if (!value) return fallback
  return ["1", "true", "yes", "on"].includes(value)
}

// --- Stripe (platby kartou, Apple Pay, Google Pay přes Payment Element) ---
const stripeApiKey = env("STRIPE_API_KEY")
const stripeWebhookSecret = env("STRIPE_WEBHOOK_SECRET")
const stripeIsLiveKey = /^(sk|rk)_live_/.test(stripeApiKey)
if (stripeApiKey && !/^(sk|rk)_(test|live)_/.test(stripeApiKey)) {
  throw new Error("STRIPE_API_KEY must be a Stripe secret/restricted key (sk_/rk_ test or live)")
}
if (!isProduction && stripeIsLiveKey) {
  throw new Error("Live Stripe key refused outside production: use sk_test_ key for local development")
}
if (isProduction && (!stripeApiKey || !stripeIsLiveKey || !/^whsec_/.test(stripeWebhookSecret))) {
  throw new Error("Production requires a live Stripe key (STRIPE_API_KEY=sk_live_/rk_live_) and STRIPE_WEBHOOK_SECRET (whsec_)")
}
if (stripeApiKey && !stripeWebhookSecret) {
  console.warn("[medusa-config] STRIPE_WEBHOOK_SECRET is not set: Stripe webhooks will be rejected (use `stripe listen` locally)")
}

// --- Redis (jen pokud existuje REDIS_URL, jinak in-memory moduly pro lokální vývoj) ---
const redisUrl = env("REDIS_URL")
if (redisUrl && !/^rediss?:\/\//i.test(redisUrl)) {
  throw new Error("REDIS_URL must start with redis:// or rediss://")
}
if (isProduction && !redisUrl) {
  console.warn("[medusa-config] REDIS_URL is not set in production: in-memory event bus/cache/locking/workflow engine are not safe for production or multiple instances")
}

// --- Soubory: lokální disk (vývoj) nebo S3-kompatibilní úložiště (S3, Cloudflare R2) ---
const s3Bucket = env("S3_BUCKET")
const s3Configured = Boolean(s3Bucket && env("S3_FILE_URL") && env("S3_ACCESS_KEY_ID") && env("S3_SECRET_ACCESS_KEY") && env("S3_REGION"))
if (isProduction && !s3Configured) {
  console.warn("[medusa-config] S3_* is not configured in production: files would be stored on the local (ephemeral) disk of the Node host")
}

const fileProvider = s3Configured
  ? {
      resolve: "@medusajs/medusa/file-s3",
      id: "s3",
      options: {
        file_url: env("S3_FILE_URL"),
        access_key_id: env("S3_ACCESS_KEY_ID"),
        secret_access_key: env("S3_SECRET_ACCESS_KEY"),
        region: env("S3_REGION"),
        bucket: s3Bucket,
        ...(env("S3_ENDPOINT") ? { endpoint: env("S3_ENDPOINT") } : {}),
        ...(env("S3_ENDPOINT") ? { additional_client_config: { forcePathStyle: true } } : {}),
      },
    }
  : {
      resolve: "@medusajs/medusa/file-local",
      id: "local",
      options: {
        upload_dir: "static",
        backend_url: `${env("BACKEND_PUBLIC_URL") || "http://localhost:9000"}/static`,
      },
    }

// --- Notifikace: lokální log provider (placeholder). Pro SMTP/Resend viz docs/DEPLOY.md ---
const notificationProvider = {
  resolve: "@medusajs/medusa/notification-local",
  id: "local",
  options: {
    name: "Local notification log",
    channels: ["email", "feed"],
  },
}

const modules: Array<Record<string, unknown>> = [
  {
    key: Modules.FILE,
    resolve: "@medusajs/medusa/file",
    options: { providers: [fileProvider] },
  },
  {
    key: Modules.NOTIFICATION,
    resolve: "@medusajs/medusa/notification",
    options: { providers: [notificationProvider] },
  },
  { resolve: "./src/modules/entitlement" },
]

if (stripeApiKey) {
  modules.push({
    key: Modules.PAYMENT,
    resolve: "@medusajs/medusa/payment",
    options: {
      providers: [
        {
          // Provider ID v Medusa: pp_stripe_stripe, webhook: POST /hooks/payment/stripe_stripe
          resolve: "@medusajs/medusa/payment-stripe",
          id: "stripe",
          options: {
            apiKey: stripeApiKey,
            webhookSecret: stripeWebhookSecret,
            // Digitální produkty: platba se stahuje okamžitě. STRIPE_CAPTURE=false = ruční capture.
            capture: flag("STRIPE_CAPTURE", true),
            // Payment Element + automatické metody (karty, Apple Pay, Google Pay dle nastavení Stripe účtu).
            automaticPaymentMethods: true,
            ...(env("STRIPE_PAYMENT_METHOD_CONFIGURATION") ? { paymentMethodConfiguration: env("STRIPE_PAYMENT_METHOD_CONFIGURATION") } : {}),
          },
        },
      ],
    },
  })
}

if (redisUrl) {
  modules.push(
    { key: Modules.EVENT_BUS, resolve: "@medusajs/medusa/event-bus-redis", options: { redisUrl } },
    { key: Modules.CACHE, resolve: "@medusajs/medusa/cache-redis", options: { redisUrl } },
    { key: Modules.WORKFLOW_ENGINE, resolve: "@medusajs/medusa/workflow-engine-redis", options: { redisUrl } },
    {
      key: Modules.LOCKING,
      resolve: "@medusajs/medusa/locking",
      options: {
        providers: [
          { resolve: "@medusajs/medusa/locking-redis", id: "locking-redis", is_default: true, options: { redisUrl } },
        ],
      },
    },
  )
}

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    ...(redisUrl ? { redisUrl } : {}),
    http: {
      storeCors,
      adminCors,
      authCors,
      jwtSecret,
      cookieSecret,
    }
  },
  modules,
})
