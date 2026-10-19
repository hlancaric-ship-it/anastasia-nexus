import { resolveDeployEnv } from "../deploy-env"

const START = ["node", "medusa", "start"]
const BUILD = ["node", "medusa", "build"]

describe("resolveDeployEnv", () => {
  it("lokální vývoj: nic nevynucuje", () => {
    expect(resolveDeployEnv({ NODE_ENV: "development" }, ["node", "medusa", "develop"])).toEqual({
      onCloud: false, cloudType: null, isLive: false, isDeployed: false, paymentsTestMode: false, isBuild: false,
    })
  })

  it("mimo Cloud rozhoduje NODE_ENV=production (staging lokálně není live)", () => {
    expect(resolveDeployEnv({ NODE_ENV: "production" }, START)).toMatchObject({ onCloud: false, isLive: true, isDeployed: true })
    expect(resolveDeployEnv({ NODE_ENV: "staging" }, START)).toMatchObject({ isLive: false, isDeployed: false })
  })

  it("Medusa Cloud: live jen v production, preview a long-lived ne, i když NODE_ENV=production", () => {
    const base = { NODE_ENV: "production", MEDUSA_CLOUD_ENVIRONMENT_HANDLE: "anastasia-x" }
    expect(resolveDeployEnv({ ...base, MEDUSA_CLOUD_ENVIRONMENT_TYPE: "production" }, START))
      .toMatchObject({ onCloud: true, cloudType: "production", isLive: true, isDeployed: true })
    expect(resolveDeployEnv({ ...base, MEDUSA_CLOUD_ENVIRONMENT_TYPE: "preview-instance" }, START))
      .toMatchObject({ onCloud: true, isLive: false, isDeployed: true })
    expect(resolveDeployEnv({ ...base, MEDUSA_CLOUD_ENVIRONMENT_TYPE: "long-lived" }, START))
      .toMatchObject({ onCloud: true, isLive: false, isDeployed: true })
  })

  it("Cloud bez NODE_ENV je pořád nasazené prostředí", () => {
    expect(resolveDeployEnv({ MEDUSA_CLOUD_ENVIRONMENT_TYPE: "long-lived" }, START)).toMatchObject({ onCloud: true, isDeployed: true, isLive: false })
  })

  it("PAYMENTS_TEST_MODE platí jen pro produkční cíl a vypíná live", () => {
    const prod = { MEDUSA_CLOUD_ENVIRONMENT_TYPE: "production", PAYMENTS_TEST_MODE: "1" }
    expect(resolveDeployEnv(prod, START)).toMatchObject({ isLive: false, isDeployed: true, paymentsTestMode: true })
    expect(resolveDeployEnv({ MEDUSA_CLOUD_ENVIRONMENT_TYPE: "preview-instance", PAYMENTS_TEST_MODE: "1" }, START))
      .toMatchObject({ paymentsTestMode: false })
    expect(resolveDeployEnv({ MEDUSA_CLOUD_ENVIRONMENT_TYPE: "production", PAYMENTS_TEST_MODE: "0" }, START))
      .toMatchObject({ isLive: true, paymentsTestMode: false })
  })

  it("rozpozná medusa build i s přepínači", () => {
    expect(resolveDeployEnv({}, BUILD).isBuild).toBe(true)
    expect(resolveDeployEnv({}, ["node", "medusa", "--verbose", "build"]).isBuild).toBe(true)
    expect(resolveDeployEnv({}, START).isBuild).toBe(false)
  })
})

describe("resolveDeployEnv – detekce Cloudu", () => {
  it("EXECUTION_CONTEXT=medusa-cloud stačí (stejně jako defineConfig)", () => {
    expect(resolveDeployEnv({ EXECUTION_CONTEXT: "medusa-cloud" }, START)).toMatchObject({ onCloud: true, isDeployed: true, isLive: false })
    expect(resolveDeployEnv({ EXECUTION_CONTEXT: "local" }, START)).toMatchObject({ onCloud: false, isDeployed: false })
  })
})
