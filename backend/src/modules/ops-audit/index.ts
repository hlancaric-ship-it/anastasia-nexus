import { Module } from "@medusajs/framework/utils"
import OpsAuditModuleService from "./service"

export const OPS_AUDIT_MODULE = "ops_audit"

export default Module(OPS_AUDIT_MODULE, {
  service: OpsAuditModuleService,
})

export * from "./policy"
