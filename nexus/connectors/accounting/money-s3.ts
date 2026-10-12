import type { AccountingAdapter, AccountingCommand, AccountingResult } from './types.js';
/** Transport implements the Money S3 integration channel selected for the deployment. */
export interface MoneyS3Transport {
  testConnection(): Promise<boolean>;
  submit(command: AccountingCommand): Promise<Omit<AccountingResult, 'provider'>>;
}
export class MoneyS3Adapter implements AccountingAdapter {
  readonly provider = 'money-s3' as const;
  constructor(private readonly transport: MoneyS3Transport) {}
  testConnection(): Promise<boolean> { return this.transport.testConnection(); }
  async execute(command: AccountingCommand): Promise<AccountingResult> {
    return { ...await this.transport.submit(command), provider: this.provider };
  }
}
