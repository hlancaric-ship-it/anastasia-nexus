import { loadEnv, defineConfig } from '@medusajs/framework/utils'

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

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors,
      adminCors,
      authCors,
      jwtSecret,
      cookieSecret,
    }
  }
})
