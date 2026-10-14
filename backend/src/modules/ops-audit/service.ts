import { MedusaService } from "@medusajs/framework/utils"
import OpsAuditEntry from "./models/ops-audit-entry"

class OpsAuditModuleService extends MedusaService({ OpsAuditEntry }) {}

export default OpsAuditModuleService
