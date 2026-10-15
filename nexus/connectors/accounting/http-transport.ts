import type { AccountingCommand, AccountingResult } from './types.js';
import type { PohodaTransport } from './pohoda.js';
import type { MoneyS3Transport } from './money-s3.js';
/**
 * Transport to a trusted on-premises integration gateway, NOT directly to a vendor API.
 * The gateway must implement vendor-specific import/export and actual-state reconciliation.
 * A 2xx gateway acknowledgement is NEVER proof of accounting posting.
 */
export class AccountingGatewayTransport implements PohodaTransport, MoneyS3Transport {
  private readonly endpoint: URL;
  constructor(endpoint: string, private readonly bearerToken: string, private readonly request: typeof fetch = fetch) {
    this.endpoint = new URL(endpoint);
    if (this.endpoint.protocol !== 'https:') throw new Error('Accounting gateway must use HTTPS');
    if (!bearerToken.trim()) throw new Error('Accounting gateway token required');
  }
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.request(new URL('health', this.baseUrl()), { method: 'GET', headers: this.headers(), signal: AbortSignal.timeout(10_000) });
      return response.ok;
    } catch { return false; }
  }
  async submit(command: AccountingCommand): Promise<Omit<AccountingResult, 'provider'>> {
    const response = await this.request(new URL('commands', this.baseUrl()), {
      method: 'POST', headers: { ...this.headers(), 'Content-Type': 'application/json', 'Idempotency-Key': command.idempotencyKey },
      body: JSON.stringify(command), signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error('Accounting gateway HTTP error: ' + response.status);
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object') throw new Error('Invalid accounting gateway response');
    const p = payload as Record<string, unknown>;
    if (typeof p.externalId !== 'string' || !p.externalId.trim() || !['accepted', 'pending', 'rejected'].includes(String(p.status))) {
      throw new Error('Invalid accounting gateway acknowledgement');
    }
    // Never trust transport to claim a finalized accounting entry.
    const status = p.status === 'rejected' ? 'rejected' : 'pending';
    return { externalId: p.externalId, status, ...(typeof p.message === 'string' ? { message: p.message } : {}) };
  }
  private headers(): Record<string, string> { return { Authorization: 'Bearer ' + this.bearerToken }; }
  private baseUrl(): URL { const url = new URL(this.endpoint); if (!url.pathname.endsWith('/')) url.pathname += '/'; return url; }
}
