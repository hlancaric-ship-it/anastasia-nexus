-- 0002_booking_tenant_id_postgres.sql -- PostgreSQL verze
-- (wave1-base, 2026-10-19)
-- POZOR: Tato migrace je určena pro PostgreSQL. D1 použije jinou verzi.

-- Přidání sloupce s default hodnotou (idempotentní)
ALTER TABLE booking
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

-- Vytvoření indexu pro efektivní dotazy (idempotentní)
CREATE INDEX IF NOT EXISTS idx_booking_tenant_product
  ON booking (tenant_id, product_id, starts_at, ends_at);

-- Idempotentní aktualizace stávajících záznamů (pro budoucí business logiku)
UPDATE booking SET tenant_id = 'default' WHERE tenant_id = 'defaul' OR tenant_id = '';