import { getSessionEpoch, incrementSessionEpoch } from "../session-epoch"

describe("account session epochs", () => {
  it("defaults accounts without a row to epoch zero", async () => {
    const db = { raw: jest.fn(async (_sql: string, _bindings?: unknown[]) => ({ rows: [] as any[] })) }
    await expect(getSessionEpoch(db, "customer", "cus_synthetic")).resolves.toBe(0)
    expect(db.raw.mock.calls[0][1]).toEqual(["customer", "cus_synthetic"])
  })

  it("reads numeric epochs and rejects corrupt values", async () => {
    const db = { raw: jest.fn(async (_sql: string, _bindings?: unknown[]) => ({ rows: [{ epoch: "4" }] as any[] })) }
    await expect(getSessionEpoch(db, "user", "usr_synthetic")).resolves.toBe(4)
    db.raw.mockResolvedValue({ rows: [{ epoch: "-1" }] })
    await expect(getSessionEpoch(db, "user", "usr_synthetic")).rejects.toThrow("AUTH_SESSION_EPOCH_INVALID")
  })

  it("uses one atomic upsert to increment an account epoch", async () => {
    const db = { raw: jest.fn(async (_sql: string, _bindings?: unknown[]) => ({ rows: [{ epoch: 3 }] as any[] })) }
    await expect(incrementSessionEpoch(db, "customer", "cus_synthetic")).resolves.toBe(3)
    expect(db.raw.mock.calls[0][0]).toContain("on conflict (actor_type, actor_id) do update")
    expect(db.raw.mock.calls[0][0]).toContain("auth_session_epoch.epoch + 1")
    expect(db.raw.mock.calls[0][1]).toEqual([expect.stringMatching(/^ase_[a-f0-9]{32}$/), "customer", "cus_synthetic"])
  })
})
