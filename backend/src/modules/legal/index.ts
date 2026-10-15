import { Module } from "@medusajs/framework/utils"
import LegalModuleService from "./service"
export const LEGAL_MODULE = "legal"
export default Module(LEGAL_MODULE, { service: LegalModuleService })
