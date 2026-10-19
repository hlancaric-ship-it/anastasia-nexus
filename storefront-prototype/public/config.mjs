// Runtime konfigurace storefrontu. Přepis přes window.__ANASTASIA__ (inline skript při nasazení)
// Medusa i Stripe publishable key jsou veřejné. Zákaznický web nepoužívá ukázkový režim.
const w = typeof window !== 'undefined' ? (window.__ANASTASIA__ || {}) : {};
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
export const config = {
  apiBaseUrl: w.apiBaseUrl || 'http://127.0.0.1:9100',
  publishableKey: w.publishableKey || 'pk_9ef952bc180b21bc185170d84beef244db20bdc2db358753964b8bb6371d4745',
  regionId: w.regionId || 'reg_01M4GBJKSXD1QK5WJ1V96TPM0B',
  stripePublishableKey: w.stripePublishableKey || 'pk_test_51TeLFi2NYUd3lQS2wADqJmdRjIo8FI2AlEuPvzu3h7RYsjUOiuxauij7mRFTZ3veJjE1Ftji2eU1ckZ5Dw0vYodf009dfFty4q',
  useMock: false,
};
try { globalThis.__ANASTASIA_CONFIG__ = config; } catch { /* noop */ }
