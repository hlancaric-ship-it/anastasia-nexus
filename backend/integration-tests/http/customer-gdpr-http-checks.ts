import { ContainerRegistrationKeys,generateJwtToken,Modules } from "@medusajs/framework/utils"
import { DEFAULT_SETTINGS } from "../../src/modules/gift-voucher/policy"
import { stateKey, sha256Hex } from "../../src/modules/auth-magic-link/policy"
/** Synthetic only. The integrator invokes this inside the serial CI Medusa/PG runner. */
export async function verifyCustomerGdpr({api,container,options,newCart,evidence}:any) {
 const customers=await container.resolve(Modules.CUSTOMER).createCustomers([{email:"privacy-owner@example.test",first_name:"Synthetic",last_name:"Privacy",phone:"synthetic-phone"},{email:"privacy-other@example.test",first_name:"Other"}])
 const jwt=(id:string,type="customer")=>generateJwtToken({actor_id:id,actor_type:type,auth_identity_id:`synthetic-${id}`,app_metadata:{[`${type}_id`]:id,session_epoch:0}},{secret:process.env.JWT_SECRET!,expiresIn:"1h"})
 const opts=customers.map((c:any)=>({...options,headers:{...options.headers,Authorization:`Bearer ${jwt(c.id)}`}}))
 const [user]=await container.resolve(Modules.USER).createUsers([{email:"privacy-admin@example.test"}])
 const admin={...options,headers:{Authorization:`Bearer ${jwt(user.id,"user")}`}}
 const owner=customers[0],other=customers[1],query=container.resolve(ContainerRegistrationKeys.QUERY),db=container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
 // Persist real synthetic identities: profile.email alone is not a verified data-subject link.
 for(const customer of customers) {
  await db("auth_identity").insert({id:`synthetic-${customer.id}`,app_metadata:JSON.stringify({customer_id:customer.id})})
  await db("provider_identity").insert({id:`synthetic-provider-${customer.id}`,auth_identity_id:`synthetic-${customer.id}`,provider:"magic-link",entity_id:customer.email})
 }
 const record=(name:string)=>evidence.push({scenario:`X2_${name}`,status:"PASS"})
 const cart=await newCart(50,false,undefined,{Authorization:`Bearer ${jwt(owner.id)}`})
 const complete=await api.post("/store/nexus-checkout",{cart_id:cart},opts[0]);expect(complete.status).toBe(200)
 const orderId=complete.data.order.id
 const readOrder=async()=> (await query.graph({entity:"order",fields:["id","total","subtotal","tax_total","shipping_total","discount_total"],filters:{id:orderId}})).data[0]
 const before=await readOrder()
 const note=await api.post(`/admin/customers/${owner.id}/notes`,{body:"synthetic private admin note"},admin)
 expect(note.status).toBe(201)
 expect((await api.post(`/admin/customers/${other.id}/notes/${note.data.note.id}`,{body:"forged"},admin)).status).toBe(404)
 expect((await api.get(`/admin/customers/${owner.id}/notes`,opts[0])).status).toBe(401)
 record("NOTES_ADMIN_ONLY_AND_CUSTOMER_BOUND")
 const conversation=await container.resolve("chat").createChatConversations({customer_id:owner.id,status:"open",subject:"synthetic private subject"})
 await container.resolve("chat").createChatMessages({conversation_id:conversation.id,customer_id:owner.id,author_type:"customer",author_id:owner.id,body:"synthetic private chat"})
 const foreignConversation=await container.resolve("chat").createChatConversations({customer_id:other.id,status:"open",subject:"foreign marker"})
 const unverifiedEmail="privacy-unverified-profile@example.test"
 // A profile changed by an admin/import is not an email ownership proof.
 await db("customer").where({id:owner.id}).update({email:unverifiedEmail})
 await container.resolve("legal").subscribe({email:unverifiedEmail,source:"foreign-consent-marker",text_version:process.env.NEWSLETTER_CONSENT_VERSION})
 const foreignVoucher=(await container.resolve("gift_voucher").issueVoucher({issue_key:"privacy-foreign-voucher",amount_minor:1000,order_id:"synthetic-foreign-privacy-order",variant_id:"synthetic-foreign-privacy-variant",settings:{...DEFAULT_SETTINGS,delivery_method:"buyer_pdf"},recipient:{name:"Other recipient",email:unverifiedEmail,message:"foreign-gift-marker"},purchaser_email:"foreign-purchaser@example.test"})).voucher
 const exported=await api.get("/store/customers/me/export",opts[0])
 expect(exported.status).toBe(200);expect(exported.headers["cache-control"]).toBe("no-store")
 expect(exported.data.customer.id).toBe(owner.id);expect(exported.data.orders.some((o:any)=>o.id===orderId)).toBe(true)
 expect(JSON.stringify(exported.data)).toContain("synthetic private chat")
 expect(JSON.stringify(exported.data)).not.toMatch(/synthetic private admin note|foreign marker|foreign-consent-marker|foreign-gift-marker|token_hash/)
 expect((await api.get(`/store/customers/me/export?customer_id=${other.id}`,opts[0])).status).toBe(404)
 record("EXPORT_ISOLATION_AND_PRIVATE_NOTES")
 // Complete three allowed attempts; the fourth is rejected by shared database rate state.
 expect((await api.get("/store/customers/me/export",opts[0])).status).toBe(200)
 expect((await api.get("/store/customers/me/export",opts[0])).status).toBe(429)
 record("EXPORT_RATE_LIMIT")
 const request=await api.post("/store/customers/me/erasure-request",{},opts[0]);expect(request.status).toBe(202)
 expect((await api.post("/store/customers/me/erasure-request",{},opts[0])).data.request.id).toBe(request.data.request.id)
 const path=`/admin/customer-erasures/${request.data.request.id}/execute`
 expect((await api.post(path,{confirm:false,customer_id:owner.id},admin)).status).toBe(422)
 expect((await api.post(path,{confirm:true,customer_id:owner.id},opts[0])).status).toBe(401)
 const auth=container.resolve(Modules.AUTH).getAuthIdentityProviderService("magic-link")
 await auth.setState(stateKey(owner.email),{email:owner.email,tokenHash:"synthetic-only"},900)
 await db("auth_link_state").insert({id:sha256Hex(owner.email),token_hash:sha256Hex("synthetic-pending"),expires_at:new Date(Date.now()+900000)})
 const erased=await api.post(path,{confirm:true,customer_id:owner.id},admin)
 expect(erased.status).toBe(200);expect(erased.data.request.status).toBe("completed")
 expect(await auth.getState(stateKey(owner.email))).toBeFalsy()
 expect(await db("auth_link_state").where({id:sha256Hex(owner.email)}).first()).toBeFalsy()
 const replay=await api.post(path,{confirm:true,customer_id:owner.id},admin)
 expect(replay.status).toBe(200);expect(replay.data.replayed).toBe(true)
 expect(await readOrder()).toEqual(before)
 const updated=(await db("customer").where({id:owner.id}).first())
 expect(updated.email).toMatch(/@example.invalid$/);expect(updated.first_name).toBeNull();expect(updated.phone).toBeNull()
 expect((await db("chat_message").where({customer_id:owner.id}).first()).body).not.toContain("synthetic private chat")
 expect((await db("chat_conversation").where({id:foreignConversation.id}).first()).subject).toBe("foreign marker")
 for(const endpoint of ["/store/customers/me","/store/entitlements","/store/customers/me/export"])expect((await api.get(endpoint,opts[0])).status).toBe(401)
 expect((await api.post("/auth/token/refresh",{},opts[0])).status).toBe(401)
 expect((await api.get("/store/customers/me/export",opts[1])).status).toBe(200)
 expect((await db("newsletter_consent").where({email:unverifiedEmail}).first()).status).toBe("subscribed")
 expect((await db("gift_voucher").where({id:foreignVoucher.id}).first()).recipient_email).toBe(unverifiedEmail)
 record("ERASURE_REPLAY_REVOKES_AUTH_PRESERVES_TOTALS_AND_OTHER_CUSTOMER")
}
