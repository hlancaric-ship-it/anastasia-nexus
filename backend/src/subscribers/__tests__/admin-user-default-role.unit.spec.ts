/** @jest-environment node */
import handler, { config } from "../admin-user-default-role"

function containerWith(user: any, count: number) {
  const users = {
    retrieveUser: jest.fn(async () => user),
    listAndCountUsers: jest.fn(async () => [[], count]),
    updateUsers: jest.fn(async () => ({})),
  }
  return { users, container: { resolve: (key: string) => (key === "user" ? users : { error: jest.fn() }) } as any }
}

describe("predvolená rola nového administrátora", () => {
  it("počúva na user.created", () => expect(config.event).toBe("user.created"))

  it("pozvaný administrátor bez roly dostane rolu asistenta", async () => {
    const { users, container } = containerWith({ id: "user_2", metadata: { note: "x" } }, 2)
    await handler({ event: { data: { id: "user_2" } }, container } as any)
    expect(users.updateUsers).toHaveBeenCalledWith({ id: "user_2", metadata: { note: "x", anastasia_role: "assistant" } })
  })

  it("prvý administrátor systému ostane vlastníkom", async () => {
    const { users, container } = containerWith({ id: "user_1", metadata: null }, 1)
    await handler({ event: { data: { id: "user_1" } }, container } as any)
    expect(users.updateUsers).not.toHaveBeenCalled()
  })

  it("výslovne nastavenú rolu neprepíše", async () => {
    const { users, container } = containerWith({ id: "user_3", metadata: { anastasia_role: "owner" } }, 3)
    await handler({ event: { data: { id: "user_3" } }, container } as any)
    expect(users.updateUsers).not.toHaveBeenCalled()
  })
})
