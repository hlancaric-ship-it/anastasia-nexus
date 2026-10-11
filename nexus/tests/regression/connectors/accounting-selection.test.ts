import { describe, it, expect, vi } from 'vitest';
import { AccountingRegistry } from '../../../connectors/accounting/registry.js';
import { PohodaAdapter } from '../../../connectors/accounting/pohoda.js';
import { MoneyS3Adapter } from '../../../connectors/accounting/money-s3.js';
import type { AccountingCommand } from '../../../connectors/accounting/types.js';
const command: AccountingCommand = { operation: 'upsert-contact', idempotencyKey: 'tenant1:contact:123', contact: { externalId: '123', name: 'Customer' } };
describe('tenant-selected accounting adapter', () => {
  it('routes each tenant to the selected provider only', async () => {
    const pohodaSubmit = vi.fn(async () => ({ externalId: 'P-1', status: 'accepted' as const }));
    const moneySubmit = vi.fn(async () => ({ externalId: 'M-1', status: 'accepted' as const }));
    const registry = new AccountingRegistry([
      new PohodaAdapter({ testConnection: async () => true, submit: pohodaSubmit }),
      new MoneyS3Adapter({ testConnection: async () => true, submit: moneySubmit }),
    ]);
    expect((await registry.execute({ tenantId: 'one', provider: 'pohoda' }, command)).provider).toBe('pohoda');
    expect((await registry.execute({ tenantId: 'two', provider: 'money-s3' }, command)).provider).toBe('money-s3');
    expect(pohodaSubmit).toHaveBeenCalledTimes(1);
    expect(moneySubmit).toHaveBeenCalledTimes(1);
  });
  it('fails closed on missing provider or idempotency key', async () => {
    const registry = new AccountingRegistry([]);
    await expect(registry.execute({ tenantId: 'one', provider: 'pohoda' }, command)).rejects.toThrow('not configured');
    const adapter = new PohodaAdapter({ testConnection: async () => true, submit: async () => ({ externalId: '1', status: 'accepted' }) });
    await expect(new AccountingRegistry([adapter]).execute({ tenantId: 'one', provider: 'pohoda' }, { ...command, idempotencyKey: '' })).rejects.toThrow('Idempotency');
    expect(() => new AccountingRegistry([adapter, adapter])).toThrow('Duplicate');
  });
});
