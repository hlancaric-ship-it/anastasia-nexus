-- Durable idempotency receipts for authenticated Medusa webhook deliveries.
CREATE TABLE IF NOT EXISTS medusa_webhook_receipts (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
