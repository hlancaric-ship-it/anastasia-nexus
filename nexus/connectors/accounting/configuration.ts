import type { AccountingProvider } from './types.js';
import { AccountingRegistry } from './registry.js';
import { PohodaAdapter } from './pohoda.js';
import { MoneyS3Adapter } from './money-s3.js';
import { AccountingGatewayTransport } from './http-transport.js';
export interface AccountingTenantConfiguration {
  tenantId: string;
  provider: AccountingProvider;
  gatewayUrl: string;
  /** Secret value loaded server-side from a secure vault, never sent to browser. */
  gatewayToken: string;
}
export function configureAccounting(config: AccountingTenantConfiguration, request: typeof fetch = fetch): AccountingRegistry {
  const transport = new AccountingGatewayTransport(config.gatewayUrl, config.gatewayToken, request);
  const adapter = config.provider === 'pohoda' ? new PohodaAdapter(transport) : config.provider === 'money-s3' ? new MoneyS3Adapter(transport) : null;
  if (!adapter) throw new Error('Unsupported accounting provider');
  return new AccountingRegistry([adapter]);
}
