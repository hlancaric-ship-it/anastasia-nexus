import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import { BankTransferPaymentProvider } from "../service"

// Prevod na účet: registrovaný s id "bank_transfer" → provider pp_bank_transfer_bank_transfer.
export default ModuleProvider(Modules.PAYMENT, { services: [BankTransferPaymentProvider] })
