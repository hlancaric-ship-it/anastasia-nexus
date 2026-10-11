import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import MagicLinkAuthService from "./service"

export default ModuleProvider(Modules.AUTH, {
  services: [MagicLinkAuthService],
})
