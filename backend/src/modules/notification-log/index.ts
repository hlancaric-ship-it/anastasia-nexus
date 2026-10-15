import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import NotificationLogService from "./service"

export default ModuleProvider(Modules.NOTIFICATION, {
  services: [NotificationLogService],
})
