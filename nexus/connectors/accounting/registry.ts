import type { AccountingAdapter, AccountingCommand, AccountingProvider, AccountingResult } from './types.js';
export interface AccountingTenantSettings { tenantId: string; provider: AccountingProvider; }
export class AccountingRegistry {
  private readonly adapters = new Map<AccountingProvider, AccountingAdapter>();
  constructor(adapters: readonly AccountingAdapter[]) {
    for (const adapter of adapters) {
      if (this.adapters.has(adapter.provider)) throw new Error('Duplicate accounting adapter: ' + adapter.provider);
      this.adapters.set(adapter.provider, adapter);
    }
  }
  get(provider: AccountingProvider): AccountingAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) throw new Error('Accounting adapter not configured: ' + provider);
    return adapter;
  }
  async execute(settings: AccountingTenantSettings, command: AccountingCommand): Promise<AccountingResult> {
    if (!settings.tenantId.trim()) throw new Error('Tenant ID required');
    if (!command.idempotencyKey.trim()) throw new Error('Idempotency key required');
    return this.get(settings.provider).execute(command);
  }
}
