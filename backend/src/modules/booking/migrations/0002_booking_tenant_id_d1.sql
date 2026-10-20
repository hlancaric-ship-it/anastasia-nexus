-- 0002_booking_tenant_id_d1.sql -- Cloudflare D1 verze (SQLite)
-- (wave1-base, 2026-10-19)
--
-- POZOR: D1 používá SQLite, která má omezenou podporu ALTER TABLE.
-- Tato migrace je kompatibilní s D1.

-- Přidání sloupce s default hodnotou (idempotentní)
ALTER TABLE booking
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

-- Vytvoření indexu pro efektivní dotazy (idempotentní)
CREATE INDEX IF NOT EXISTS idx_booking_tenant_product
  ON booking (tenant_id, product_id, starts_at, ends_at);

-- Idempotentní aktualizace stávajících záznamů (pro budoucí business logiku)
UPDATE booking SET tenant_id = 'default' WHERE tenant_id = 'defaul' OR tenant_id = '';