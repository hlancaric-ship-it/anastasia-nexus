import { Module } from "@medusajs/framework/utils"
import ResetJournalModuleService from "./service"

export const RESET_JOURNAL_MODULE = "reset_journal"

export default Module(RESET_JOURNAL_MODULE, {
  service: ResetJournalModuleService,
})

export * from "./types"
export { JournalError, MAX_JOURNAL_ENTRIES_PER_DAY } from "./policy"
