import { MedusaService } from "@medusajs/framework/utils"
import OpsAuditEntry from "./models/ops-audit-entry"
import OpsEvent from "./models/ops-event"

class OpsAuditModuleService extends MedusaService({ OpsAuditEntry, OpsEvent }) {}

export default OpsAuditModuleService
