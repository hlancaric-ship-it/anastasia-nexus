import { randomUUID } from "node:crypto"
import { AbstractPaymentProvider, PaymentActions, PaymentSessionStatus } from "@medusajs/framework/utils"
import type {
  AuthorizePaymentInput, AuthorizePaymentOutput, CancelPaymentInput, CancelPaymentOutput, CapturePaymentInput, CapturePaymentOutput,
  CreateAccountHolderInput, CreateAccountHolderOutput, DeleteAccountHolderInput, DeleteAccountHolderOutput, DeletePaymentInput, DeletePaymentOutput,
  GetPaymentStatusInput, GetPaymentStatusOutput, InitiatePaymentInput, InitiatePaymentOutput, ProviderWebhookPayload, RefundPaymentInput,
  RefundPaymentOutput, RetrieveAccountHolderInput, RetrieveAccountHolderOutput, RetrievePaymentInput, RetrievePaymentOutput, UpdatePaymentInput,
  UpdatePaymentOutput, WebhookActionResult,
} from "@medusajs/framework/types"

/**
 * Manuálne platby bez brány (dobierka, prevod na účet). Správanie ako Medusa system provider:
 * session sa pri dokončení košíka len autorizuje, objednávka vznikne NEZAPLATENÁ a peniaze
 * „prijme“ až správkyňa v adminu (capture). Až capture spustí `payment.captured` → prístupy
 * k digitálnemu obsahu a e-mail o prijatí platby. Žiadne externé volania, žiadne tajomstvá.
 * Do `data` session sa zapisuje len typ metódy (audit), nikdy údaje zákazníčky.
 */
abstract class ManualPaymentProvider extends AbstractPaymentProvider<Record<string, never>> {
  protected abstract readonly method: "cod" | "bank_transfer"

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(cradle: Record<string, any>, options: Record<string, never> = {}) {
    super(cradle, options)
  }

  async initiatePayment(_input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    return { id: randomUUID(), data: { method: this.method }, status: PaymentSessionStatus.PENDING }
  }
  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    return { data: { ...(input.data || {}), method: this.method }, status: PaymentSessionStatus.AUTHORIZED }
  }
  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    return { data: input.data || {}, status: PaymentSessionStatus.AUTHORIZED }
  }
  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    return { data: { ...(input.data || {}), method: this.method } }
  }
  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    // Peniaze vracia správkyňa ručne (prevodom); Medusa len eviduje vrátenú sumu.
    return { data: input.data || {} }
  }
  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: input.data || {} }
  }
  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data || {} }
  }
  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: input.data || {} }
  }
  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    return { data: { ...(input.data || {}), method: this.method } }
  }
  async createAccountHolder(input: CreateAccountHolderInput): Promise<CreateAccountHolderOutput> {
    return { id: input.context.customer.id }
  }
  async retrieveAccountHolder(input: RetrieveAccountHolderInput): Promise<RetrieveAccountHolderOutput> {
    return { id: input.id }
  }
  async deleteAccountHolder(_input: DeleteAccountHolderInput): Promise<DeleteAccountHolderOutput> {
    return { data: {} }
  }
  async getWebhookActionAndData(_payload: ProviderWebhookPayload["payload"]): Promise<WebhookActionResult> {
    return { action: PaymentActions.NOT_SUPPORTED }
  }
}

/** Platba na dobierku – provider ID `pp_cod_cod`. */
export class CodPaymentProvider extends ManualPaymentProvider {
  static identifier = "cod"
  protected readonly method = "cod" as const
}

/** Prevod na účet – provider ID `pp_bank_transfer_bank_transfer`. */
export class BankTransferPaymentProvider extends ManualPaymentProvider {
  static identifier = "bank_transfer"
  protected readonly method = "bank_transfer" as const
}
