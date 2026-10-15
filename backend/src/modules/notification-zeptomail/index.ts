import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import ZeptoMailNotificationService from "./service"

export default ModuleProvider(Modules.NOTIFICATION, {
  services: [ZeptoMailNotificationService],
})
