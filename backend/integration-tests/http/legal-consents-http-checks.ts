import { ContainerRegistrationKeys,generateJwtToken,Modules } from "@medusajs/framework/utils"
import { capturePaymentWorkflow } from "@medusajs/medusa/core-flows"
/** Called by the integration owner only inside the isolated synthetic CI runner. */
export async function verifyLegalConsents({api,container,options,newCart,evidence}:any) {
 const legal=container.resolve("legal"),query=container.resolve(ContainerRegistrationKeys.QUERY)
 const record=(scenario:string)=>evidence.push({scenario:`X1_${scenario}`,status:"PASS"})
 const customer=await container.resolve(Modules.CUSTOMER).createCustomers({email:"legal-owner@example.test",has_account:true})
 const token=generateJwtToken({actor_id:customer.id,actor_type:"customer",auth_identity_id:`synthetic-${customer.id}`},{secret:process.env.JWT_SECRET!,expiresIn:"1h"})
 const auth={Authorization:`Bearer ${token}`},owned={...options,headers:{...options.headers,...auth}}
 const id=await newCart(50,false,undefined,auth)
 const rows=await legal.listLegalConsents({cart_id:id})
 if(rows.length) await legal.deleteLegalConsents(rows.map((r:any)=>r.id))
 await api.post(`/store/carts/${id}`,{metadata:{legal_consent:{terms_accepted:true,privacy_acknowledged:true,terms_version:process.env.LEGAL_TERMS_VERSION,privacy_version:process.env.LEGAL_PRIVACY_VERSION}}},owned)
 for(const endpoint of [`/store/carts/${id}/complete`,"/store/nexus-checkout"]) {
  const result=await api.post(endpoint,endpoint.endsWith("nexus-checkout")?{cart_id:id}:{},owned)
  expect(result.status).toBe(422); expect(JSON.stringify(result.data)).toContain("TERMS_NOT_ACCEPTED")
 }
 record("BOTH_COMPLETION_PATHS_REQUIRE_CONSENT")
 const acceptance={terms_accepted:true,privacy_acknowledged:true,terms_version:process.env.LEGAL_TERMS_VERSION,privacy_version:process.env.LEGAL_PRIVACY_VERSION}
 expect((await api.post(`/store/carts/${id}/consents`,acceptance,options)).status).toBe(404)
 expect((await api.post(`/store/carts/${id}/consents`,{...acceptance,terms_version:"obsolete"},owned)).status).toBe(422)
 expect((await api.post(`/store/carts/${id}/consents`,acceptance,owned)).status).toBe(200)
 const first=(await legal.listLegalConsents({cart_id:id}))[0]
 expect((await api.post(`/store/carts/${id}/consents`,acceptance,owned)).status).toBe(200)
 expect((await legal.listLegalConsents({cart_id:id}))[0].accepted_at).toEqual(first.accepted_at)
 record("CONSENT_OWNER_VERSION_REPLAY")
 const result=await api.post("/store/nexus-checkout",{cart_id:id},owned)
 expect(result.status).toBe(200)
 const orderId=result.data.order.id
 const {data:orders}=await query.graph({entity:"order",fields:["id","items.id","payment_collections.payments.id"],filters:{id:orderId}})
 const order=orders[0]
 await capturePaymentWorkflow(container).run({input:{payment_id:order.payment_collections[0].payments[0].id}})
 const body={order_id:orderId,items:[{item_id:order.items[0].id,quantity:1}]}
 expect((await api.post("/store/withdrawals",body,options)).status).toBe(401)
 const other=await container.resolve(Modules.CUSTOMER).createCustomers({email:"legal-foreign@example.test"})
 const otherToken=generateJwtToken({actor_id:other.id,actor_type:"customer",auth_identity_id:`synthetic-${other.id}`},{secret:process.env.JWT_SECRET!,expiresIn:"1h"})
 expect((await api.post("/store/withdrawals",body,{...options,headers:{...options.headers,Authorization:`Bearer ${otherToken}`}})).status).toBe(404)
 const receipt=await api.post("/store/withdrawals",body,owned)
 expect(receipt.status).toBe(201)
 const replay=await api.post("/store/withdrawals",body,owned)
 expect(replay.status).toBe(200); expect(replay.data.withdrawal.id).toBe(receipt.data.withdrawal.id)
 record("WITHDRAWAL_OWNER_AND_IDEMPOTENCY")
 const expiredId=await newCart(50,false,undefined,auth)
 const expiredResult=await api.post("/store/nexus-checkout",{cart_id:expiredId},owned)
 expect(expiredResult.status).toBe(200)
 const expiredOrder=expiredResult.data.order.id
 const {data:expiredRows}=await query.graph({entity:"order",fields:["items.id","payment_collections.payments.id"],filters:{id:expiredOrder}})
 const paymentId=expiredRows[0].payment_collections[0].payments[0].id
 await capturePaymentWorkflow(container).run({input:{payment_id:paymentId}})
 // Test-only fixture ageing in the disposable DB, never exposed through a production API.
 await container.resolve(ContainerRegistrationKeys.PG_CONNECTION)("payment").where({id:paymentId}).update({captured_at:new Date(Date.now()-15*86400000)})
 expect((await api.post("/store/withdrawals",{order_id:expiredOrder,items:[{item_id:expiredRows[0].items[0].id,quantity:1}]},owned)).status).toBe(422)
 record("WITHDRAWAL_EXPIRED")
 const newsletter={email:"legal-news@example.test",source:"footer",text_version:process.env.NEWSLETTER_CONSENT_VERSION,accepted:true}
 const subscribed=await api.post("/store/newsletter",newsletter,options)
 expect(subscribed.status).toBe(200);expect(subscribed.data.unsubscribe_token).toMatch(/^[A-Za-z0-9_-]{43}$/)
 const again=await api.post("/store/newsletter",newsletter,options)
 expect(again.data.unsubscribe_token).toBeUndefined()
 const previousVersion=process.env.NEWSLETTER_CONSENT_VERSION
 try {
  process.env.NEWSLETTER_CONSENT_VERSION=`${previousVersion}-revised`
  const revised=await api.post("/store/newsletter",{...newsletter,text_version:process.env.NEWSLETTER_CONSENT_VERSION},options)
  expect(revised.status).toBe(200)
  expect(revised.data.unsubscribe_token).toBeUndefined() // prior unsubscribe link remains valid
  expect((await legal.listNewsletterConsents({email:newsletter.email}))[0].text_version).toBe(process.env.NEWSLETTER_CONSENT_VERSION)
 }finally{process.env.NEWSLETTER_CONSENT_VERSION=previousVersion}
 const unsubscribe={token:subscribed.data.unsubscribe_token}
 expect((await api.post("/store/newsletter/unsubscribe",unsubscribe,options)).status).toBe(200)
 expect((await api.post("/store/newsletter/unsubscribe",unsubscribe,options)).status).toBe(200)
 expect((await legal.listNewsletterConsentEvents({consent_id:(await legal.listNewsletterConsents({email:newsletter.email}))[0].id})).length).toBe(3)
 record("NEWSLETTER_HISTORY_REPLAY_UNSUBSCRIBE")
}
