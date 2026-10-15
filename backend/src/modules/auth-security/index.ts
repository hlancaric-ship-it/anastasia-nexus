import { Module, MedusaService } from "@medusajs/framework/utils"
import { AuthLinkState, AuthLinkRate } from "./models/state"
class AuthSecurityService extends MedusaService({ AuthLinkState, AuthLinkRate }) {}
export default Module("authSecurity", { service: AuthSecurityService })
