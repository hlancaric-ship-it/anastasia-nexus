-- 0001_entitlement_tenant_id_d1.sql -- Cloudflare D1 verze (SQLite)
-- (wave1-base, 2026-10-19)
--
-- POZOR: D1 používá SQLite, která nemá EXCLUDE USING GIST ani některé PostgreSQL rozšíření.
-- Tato migrace je kompatibilní s D1.

-- Přidání sloupce s default hodnotou (idempotentní)
ALTER TABLE entitlement
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

-- Vytvoření indexu pro efektivní dotazy (idempotentní)
CREATE INDEX IF NOT EXISTS idx_entitlement_tenant_customer
  ON entitlement (tenant_id, customer_id, status, granted_at);

-- Vytvoření unikátního indexu pro deduplikační klíč (tenant + dedupe_key)
CREATE UNIQUE INDEX IF NOT EXISTS uq_entitlement_tenant_dedupe
  ON entitlement (tenant_id, dedupe_key);

-- Idempotentní aktualizace stávajících záznamů (pro budoucí business logiku)
UPDATE entitlement SET tenant_id = 'default' WHERE tenant_id = 'defaul' OR tenant_id = '';