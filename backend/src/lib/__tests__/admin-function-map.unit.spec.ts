import { execFileSync } from "node:child_process"
import { resolve } from "node:path"

describe("Admin function map source coverage", () => {
  it("covers current custom and pinned native APIs with real sources and acceptance criteria", () => {
    const output = execFileSync("python3", [resolve(__dirname, "../../../scripts/check-admin-function-map.py")], {
      encoding: "utf8",
      timeout: 30_000,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
    })
    expect(output).toContain("PASS:")
  })
})
