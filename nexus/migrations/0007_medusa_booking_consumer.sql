-- Inbox-to-operation link only; business order/booking state remains in Medusa.
ALTER TABLE medusa_webhook_inbox ADD COLUMN operation_id TEXT;
ALTER TABLE medusa_webhook_inbox ADD COLUMN processing_updated_at TEXT;
CREATE INDEX idx_medusa_inbox_operation ON medusa_webhook_inbox(tenant_id, operation_id);
