import { Module, MedusaService } from "@medusajs/framework/utils"
import { AuthLinkState, AuthLinkRate } from "./models/state"
import AuthSessionEpoch from "./models/session-epoch"
class AuthSecurityService extends MedusaService({ AuthLinkState, AuthLinkRate, AuthSessionEpoch }) {}
export default Module("authSecurity", { service: AuthSecurityService })
