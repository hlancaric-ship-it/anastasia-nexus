import { describe, it, expect, vi } from 'vitest';
import { configureAccounting } from '../../../connectors/accounting/configuration.js';
import { AccountingGatewayTransport } from '../../../connectors/accounting/http-transport.js';
const command = { operation: 'upsert-contact' as const, idempotencyKey: 'tenant-1:contact-123', contact: { externalId: '123', name: 'Customer' } };
describe('accounting gateway transport', () => {
  it('requires HTTPS and token', () => {
    expect(() => new AccountingGatewayTransport('http://localhost:3000/', 'secret')).toThrow('HTTPS');
    expect(() => new AccountingGatewayTransport('https://example.test/', '')).toThrow('token');
  });
  it('routes to chosen provider and never reports posting on HTTP acceptance', async () => {
    const request = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ 'Idempotency-Key': command.idempotencyKey });
      return new Response(JSON.stringify({ externalId: 'gateway-job-1', status: 'accepted' }), { status: 202 });
    });
    const registry = configureAccounting({ tenantId: 'tenant-1', provider: 'money-s3', gatewayUrl: 'https://gateway.example.test/api/', gatewayToken: 'secret' }, request as typeof fetch);
    const result = await registry.execute({ tenantId: 'tenant-1', provider: 'money-s3' }, command);
    expect(result).toMatchObject({ provider: 'money-s3', externalId: 'gateway-job-1', status: 'pending' });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid acknowledgement', async () => {
    const transport = new AccountingGatewayTransport('https://gateway.example.test/', 'secret', async () => new Response('{}') );
    await expect(transport.submit(command)).rejects.toThrow('Invalid');
  });
});
