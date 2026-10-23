import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const EMAIL = process.env.ANASTASIA_ADMIN_INVITE_EMAIL?.trim()
const FIRST = process.env.ANASTASIA_ADMIN_INVITE_FIRST_NAME?.trim()
const LAST = process.env.ANASTASIA_ADMIN_INVITE_LAST_NAME?.trim()
const AVATAR = "/assets/lucia.webp"

function assertTestTunnel() {
  const value = process.env.DATABASE_URL
  if (process.env.ANASTASIA_IMPORT_TEST_SERVER !== "1" || !value) throw new Error("TEST_DATABASE_GUARD")
  const parsed = new URL(value)
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== "15432") throw new Error("TEST_TUNNEL_REQUIRED")
}

export default async function prepareLucia({ container }: { container: MedusaContainer }) {
  assertTestTunnel()
  if (!EMAIL || !FIRST || !LAST) throw new Error("ADMIN_INVITE_IDENTITY_REQUIRED")
  const users = container.resolve(Modules.USER) as any
  const existing = await users.listUsers({ email: EMAIL }, { take: 5 })
  if (existing?.length) {
    const user = existing[0]
    const metadata = { ...(user.metadata ?? {}), anastasia_role: "owner", avatar_url: AVATAR }
    await users.updateUsers(user.id, { first_name: FIRST, last_name: LAST, metadata })
    container.resolve(ContainerRegistrationKeys.LOGGER).info("[lucia-invite] existing admin profile updated; no invitation created")
    return
  }

  const pending = await users.listInvites({ email: EMAIL }, { take: 5 })
  const active = (pending ?? []).find((invite: any) => !invite.accepted && invite.token)
  if (active) {
    container.resolve(ContainerRegistrationKeys.LOGGER).info("[lucia-invite] active invitation already exists; no email sent")
    return
  }
  await users.createInvites({ email: EMAIL })
  const saved = await users.listInvites({ email: EMAIL }, { take: 5 })
  if (!(saved ?? []).some((invite: any) => !invite.accepted && invite.token)) throw new Error("LUCIA_INVITE_READBACK_FAILED")
  container.resolve(ContainerRegistrationKeys.LOGGER).info("[lucia-invite] pending invitation read back from the Users list; no email sent")
}
