-- Additive migration: legacy receipts remain untouched and are quarantined on replay.
-- Only a reference and envelope digest are retained; consumers reload authoritative Medusa state.
CREATE TABLE IF NOT EXISTS medusa_webhook_inbox (
    tenant_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    envelope_hash TEXT NOT NULL CHECK(length(envelope_hash) = 64),
    processing_state TEXT NOT NULL CHECK(processing_state IN ('RECEIVED', 'PROCESSING', 'PROCESSED', 'NEEDS_REVIEW')),
    received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (tenant_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_medusa_inbox_pending
    ON medusa_webhook_inbox(tenant_id, processing_state, received_at, event_id);
