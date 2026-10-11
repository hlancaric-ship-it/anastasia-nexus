/** Provider-neutral accounting boundary. No credentials or vendor-specific formats in domain code. */
export type AccountingProvider = 'pohoda' | 'money-s3';
export type AccountingOperation = 'upsert-contact' | 'export-invoice';
export interface AccountingContact { externalId: string; name: string; ico?: string; dic?: string; }
export interface AccountingInvoice { externalId: string; issuedOn: string; currency: string; customerExternalId: string; lines: ReadonlyArray<{ description: string; quantity: number; unitPrice: string; vatRate: string }>; }
export type AccountingCommand =
  | { operation: 'upsert-contact'; idempotencyKey: string; contact: AccountingContact }
  | { operation: 'export-invoice'; idempotencyKey: string; invoice: AccountingInvoice };
export interface AccountingResult { provider: AccountingProvider; externalId: string; status: 'accepted' | 'pending' | 'rejected'; message?: string; }
export interface AccountingAdapter {
  readonly provider: AccountingProvider;
  execute(command: AccountingCommand): Promise<AccountingResult>;
  testConnection(): Promise<boolean>;
}
