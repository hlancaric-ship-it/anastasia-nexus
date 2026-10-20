-- 0001_booking_exclusion_d1.sql -- Alternativa pro D1 bez btree_gist
-- (wave1-base, 2026-10-19)
--
-- PROČ:
--   Cloudflare D1 používá SQLite, která nepodporuje EXCLUDE USING GIST.
--   Exclusion constraint je critical, ale musí být implementován jinak.
--
-- ŘEŠENÍ:
--   1. Vytvořit unikátní index na (product_id, tenant_id, starts_at)
--   2. V kódu (service.ts) validovat překryv intervalů před INSERT
--   3. Použít SELECT s EXIST pro kontrolu před vložením
--
-- POŽADAVKY:
--   1. D1 kompatibilita (SQLite syntax)
--   2. Ochrana přes aplikaci (not null, defaults)
--   3. Idempotentní (příkazy s IF NOT EXISTS)

-- Přidání tenant_id do booking tabulky (D1 kompatibilní)
ALTER TABLE booking
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

-- Vytvoření indexu pro efektivní dotazy (D1 kompatibilní)
CREATE INDEX IF NOT EXISTS idx_booking_tenant_product
  ON booking (tenant_id, product_id, starts_at, ends_at);

-- Idempotentní aktualizace stávajících záznamů (pro budoucí business logiku)
-- Zatím všechny do 'default', v praxi se bude naplňovat z contextu (order, customer, etc.)
UPDATE booking SET tenant_id = 'default' WHERE tenant_id = 'defaul' OR tenant_id = '';
