/** X1: každý syntetický košík musí mít před completion uložený souhlas s VOP a GDPR (guard se v testech nevypíná). */
export async function acceptCheckoutConsent(api: any, cartId: string, options: any) {
  const response = await api.post(`/store/carts/${cartId}/consents`, {
    terms_accepted: true,
    privacy_acknowledged: true,
    terms_version: process.env.LEGAL_TERMS_VERSION,
    privacy_version: process.env.LEGAL_PRIVACY_VERSION,
  }, options)
  if (response.status >= 300) throw new Error(`Synthetic consent failed: ${response.status} ${JSON.stringify(response.data)}`)
}
