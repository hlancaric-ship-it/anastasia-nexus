import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { D1ExecutionIntentStore } from "../../connectors/d1/D1ExecutionIntentStore.js";
import { canTransitionIntent, type ExecutionIntentState } from "../../core/canonical/outcomes/ExecutionIntent.js";

const T0 = "2026-10-15T12:00:00.000Z";
const T1 = "2026-10-15T12:01:00.000Z";
const T2 = "2026-10-15T12:02:00.000Z";

async function fixture(state: ExecutionIntentState) {
  const id = `intent-claim-${crypto.randomUUID()}`;
  const context = { tenantId: `tenant-${id}`, platform: "medusa" as const };
  const store = new D1ExecutionIntentStore(env.DB);
  await store.plan(context, { id, decisionId: `decision-${id}`, domain: "invoice", connectorType: "synthetic", operation: "ISSUE_DOCUMENT", targetRef: `order-${id}`, payload: {}, expectedState: { issued: true }, idempotencyKey: id, plannedAt: T0 });
  // Seed each valid persisted state independently of application transition code.
  await env.DB.prepare("UPDATE execution_intents SET state = ?, confirmation_quality = ? WHERE id = ? AND tenant_id = ?")
    .bind(state, state === "EXECUTED" ? "SYSTEM_CONFIRMED" : null, id, context.tenantId).run();
  return { id, context, store };
}

describe("durable execution claim uses the canonical state machine", () => {
  it.each<ExecutionIntentState>(["PLANNED", "APPROVED", "EXECUTING", "EXECUTED", "FAILED", "UNKNOWN", "SUPERSEDED", "ABANDONED"])("claim from %s", async (state) => {
    const { id, context, store } = await fixture(state);
    const before = await store.findById(context.tenantId, id);
    const claimed = await store.claimForExecution(context, id, T1);
    if (canTransitionIntent(state, "EXECUTING")) {
      expect(claimed.outcome).toBe("CLAIMED");
      const after = await store.findById(context.tenantId, id);
      expect(after?.state).toBe("EXECUTING");
      expect(after?.attempt).toBe(state === "FAILED" ? 2 : 1);
    } else {
      expect(claimed).toEqual(state === "EXECUTING" ? { outcome: "ALREADY_EXECUTING" } : { outcome: "WRONG_STATE", currentState: state });
      expect(await store.findById(context.tenantId, id)).toEqual(before);
    }
  });

  it("uncertain remote success must reconcile before a known failed attempt can retry", async () => {
    const { id, context, store } = await fixture("UNKNOWN");
    const claims = await Promise.all([store.claimForExecution(context, id, T1), store.claimForExecution(context, id, T1)]);
    expect(claims.every((claim) => claim.outcome === "WRONG_STATE")).toBe(true);
    expect(await store.findRequiringReconciliation(context.tenantId, 10)).toHaveLength(1);
    await store.recordOutcome(context, { intentId: id, nextState: "FAILED", failureReason: "Synthetic reconciliation proved no write", recordedAt: T1 });
    const retries = await Promise.all([store.claimForExecution(context, id, T2), store.claimForExecution(context, id, T2)]);
    expect(retries.filter((claim) => claim.outcome === "CLAIMED")).toHaveLength(1);
    expect((await store.findById(context.tenantId, id))?.attempt).toBe(2);
  });

  it("a foreign tenant cannot claim or discover the pending operation", async () => {
    const { id, context, store } = await fixture("PLANNED");
    expect(await store.claimForExecution({ ...context, tenantId: "synthetic-foreign" }, id, T1)).toEqual({ outcome: "NOT_FOUND" });
    expect((await store.findById(context.tenantId, id))?.state).toBe("PLANNED");
  });
});
