import { generateJwtToken, Modules } from "@medusajs/framework/utils"

/** Synthetic customer, real JWT verification and native cart association. Never log tokens. */
export async function syntheticBuyer(container: any, options: any, email: string) {
  const customer = await container.resolve(Modules.CUSTOMER).createCustomers({ email, has_account: true })
  const token = generateJwtToken({ actor_id: customer.id, actor_type: "customer", auth_identity_id: `synthetic-${customer.id}`, app_metadata: { customer_id: customer.id, session_epoch: 0 } }, { secret: process.env.JWT_SECRET!, expiresIn: "1h" })
  return { customer, options: { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } } }
}

export async function associateCart(api: any, id: string, options: any) {
  const assigned = await api.post(`/store/carts/${id}/customer`, {}, options)
  expect(assigned.status).toBe(200)
}
