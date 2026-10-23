import { saveRegistrationNewsletterConsent } from "../registration-newsletter"

describe("registration newsletter consent", () => {
  it("connects only normalized, versioned opt-in consent to the legal module", async () => {
    const subscribe = jest.fn(async () => ({ accepted: true }))
    const container = { resolve: jest.fn(() => ({ subscribe })) }
    await saveRegistrationNewsletterConsent(container, { email: " Anna@Example.sk ", newsletter_version: "news-v1" })
    expect(container.resolve).toHaveBeenCalledWith("legal")
    expect(subscribe).toHaveBeenCalledWith({ email: "anna@example.sk", source: "account-registration", text_version: "news-v1" })
  })

  it("ignores invalid or missing newsletter consent data", async () => {
    const subscribe = jest.fn()
    await saveRegistrationNewsletterConsent({ resolve: () => ({ subscribe }) }, { email: "invalid", newsletter_version: "news-v1" })
    await saveRegistrationNewsletterConsent({ resolve: () => ({ subscribe }) }, { email: "a@example.sk", newsletter_version: "x".repeat(101) })
    expect(subscribe).not.toHaveBeenCalled()
  })
})
