// Runtime konfigurace storefrontu. Přepis přes window.__ANASTASIA__ (inline skript při nasazení)
// Medusa i Stripe publishable key jsou veřejné. Zákaznický web nepoužívá ukázkový režim.
const w = typeof window !== 'undefined' ? (window.__ANASTASIA__ || {}) : {};
export const config = {
  apiBaseUrl: w.apiBaseUrl || '',
  publishableKey: w.publishableKey || '',
  regionId: w.regionId || '',
  stripePublishableKey: w.stripePublishableKey || '',
  useMock: false,
};
try { globalThis.__ANASTASIA_CONFIG__ = config; } catch { /* noop */ }
