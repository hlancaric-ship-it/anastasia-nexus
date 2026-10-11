import type { AccountingAdapter, AccountingCommand, AccountingResult } from './types.js';
/** Transport must be implemented by a trusted integration service with vendor XML support. */
export interface PohodaTransport {
  testConnection(): Promise<boolean>;
  submit(command: AccountingCommand): Promise<Omit<AccountingResult, 'provider'>>;
}
export class PohodaAdapter implements AccountingAdapter {
  readonly provider = 'pohoda' as const;
  constructor(private readonly transport: PohodaTransport) {}
  testConnection(): Promise<boolean> { return this.transport.testConnection(); }
  async execute(command: AccountingCommand): Promise<AccountingResult> {
    return { ...await this.transport.submit(command), provider: this.provider };
  }
}
