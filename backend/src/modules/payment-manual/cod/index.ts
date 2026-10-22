import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import { CodPaymentProvider } from "../service"

// Platba na dobierku: registrovaná s id "cod" → provider pp_cod_cod (viz lib/checkout/delivery-payment.ts).
export default ModuleProvider(Modules.PAYMENT, { services: [CodPaymentProvider] })
