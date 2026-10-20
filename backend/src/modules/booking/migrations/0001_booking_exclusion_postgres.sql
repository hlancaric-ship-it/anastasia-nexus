-- 0001_booking_exclusion_postgres.sql -- PostgreSQL verze s btree_gist
-- (wave1-base, 2026-10-19)
--
-- PROČ EXCLUSION CONSTRAINT:
--   booking.service.holdSlot() se spoléhá na DB unikátní index (product_id, starts_at),
--   který ale chrání jen přesně stejný začátek. Zákazníci mohou chtít rezervaci
--   přes sebe (např. 14:00-15:00 vs 14:30-15:30), což je konflikt.
--
-- ŘEŠENÍ:
--   btree_gist + tstzrange: vyloučí překryvající se intervaly pro STEJNÝ product_id.
--   Použití `&&` (overlaps) v exclusion constraintu.
--
-- POŽADAVKY:
--   1. btree_gist extension (dostupná v Postgres)
--   2. starts_at/ends_at musí být TIMESTAMPTZ (ne DATE) pro tstzrange
--   3. constraint se vynucuje I PŘI CHYBĚ V KÓDU (poslední záchranná síť)
--
-- POZNÁMKA: Tato migrace NEMUSÍ BĚŽET NA CLOUDFLARE D1 (použij 0001_booking_exclusion_d1.sql)
-- Použijte tuto migraci pouze pro PostgreSQL produkční databázi.

-- Extension musí být vytvořena ručně (jedenkrát na DB):
--   CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Přidání tenant_id do booking tabulky (PostgreSQL kompatibilní)
ALTER TABLE booking
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

-- Exclusion constraint na překryv intervalů pro stejný product_id a tenant_id
ALTER TABLE booking
  ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING GIST (
    product_id WITH =,
    tenant_id WITH =,
    tstzrange(starts_at, ends_at, '[]') WITH &&
  );

-- Idempotentní index pro efektivní dotazy po active bookings v rozsahu:
CREATE INDEX IF NOT EXISTS idx_booking_product_tenant_status_range
  ON booking (product_id, tenant_id, status, starts_at, ends_at)
  WHERE status IN ('held', 'confirmed');

-- Idempotentní aktualizace stávajících záznamů (pro budoucí business logiku)
-- Zatím všechny do 'default', v praxi se bude naplňovat z contextu (order, customer, etc.)
UPDATE booking SET tenant_id = 'default' WHERE tenant_id = 'defaul' OR tenant_id = '';
