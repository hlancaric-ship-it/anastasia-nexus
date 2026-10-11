# Selectable accounting adapters (foundation)

NEXUS tenants select either `pohoda` or `money-s3` in their persisted configuration. The core calls `AccountingRegistry.execute(settings, command)`; no vendor-specific payload is exposed to domain code.

This PR delivers **typed adapter boundaries and routing tests only**. The transport objects are intentionally injected; there is no fake "live" integration. Before production: implement and test POHODA XML and Money S3 transport against licensed test installations, configure per-tenant credentials in a secrets store, add durable idempotency/outbox and retry reconciliation, validate accounting amounts/tax handling, implement UI settings + persisted tenant configuration, and verify vendor acknowledgements. Never mark an invoice booked solely on a transport-level response.

The legacy `connectors/omega` tree remains present for compatibility in this first change; it is **not wired** into the new registry. Remove it only after checking imports and migration dependencies. The previous Omega CI tmpfs patch is not included.
