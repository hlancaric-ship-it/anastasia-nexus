import { ContainerRegistrationKeys,generateJwtToken,Modules } from "@medusajs/framework/utils"
import { createProductsWorkflow,capturePaymentWorkflow,createOrderFulfillmentWorkflow,createOrderShipmentWorkflow } from "@medusajs/medusa/core-flows"
import { mondayOf,weekDates } from "../../src/modules/booking/availability"
import { DEFAULT_SETTINGS } from "../../src/modules/gift-voucher/policy"
/** Own products isolate booking/digital flags from every other HTTP group. CI only. */
export async function verifyOrderSelfCancel({api,container,options,channel,region,profile,evidence}:any) {
 const customers=await container.resolve(Modules.CUSTOMER).createCustomers([{email:"cancel-owner@example.test"},{email:"cancel-other@example.test"}])
 const opts=customers.map((c:any)=>({...options,headers:{...options.headers,Authorization:`Bearer ${generateJwtToken({actor_id:c.id,actor_type:"customer",auth_identity_id:`synthetic-${c.id}`},{secret:process.env.JWT_SECRET!,expiresIn:"1h"})}`}}))
 const {result:products}=await createProductsWorkflow(container).run({input:{products:["plain","booking","digital"].map(kind=>({title:`Self cancel ${kind}`,handle:`self-cancel-${kind}`,status:"published",shipping_profile_id:profile.id,sales_channels:[{id:channel.id}],metadata:kind==="booking"?{booking:{durationMinutes:60,bufferMinutes:15,stepMinutes:30}}:kind==="digital"?{entitlement:true}:{},options:[{title:"Default",values:["Default"]}],variants:[{title:"Default",sku:`SELF-CANCEL-${kind}`,manage_inventory:false,options:{Default:"Default"},prices:[{amount:50,currency_code:"eur"}]}]}))}})
 const query=container.resolve(ContainerRegistrationKeys.QUERY),vouchers=container.resolve("gift_voucher"),bookings=container.resolve("booking")
 const ok=async(promise:Promise<any>)=>{const r=await promise;expect(r.status).toBeLessThan(300);return r.data}
 const record=(name:string)=>evidence.push({scenario:`X3_${name}`,status:"PASS"})
 const wait=async(check:()=>Promise<boolean>)=>{for(let i=0;i<100;i++){if(await check())return;await new Promise(r=>setTimeout(r,100))}throw new Error("SELF_CANCEL_SYNC_TIMEOUT")}
 const cart=async(kind="plain",bookingId?:string,voucherCode?:string)=>{
  const product=products.find((p:any)=>p.handle===`self-cancel-${kind}`)!
  const created=await ok(api.post("/store/carts",{region_id:region.id,email:customers[0].email,shipping_address:{first_name:"Synthetic",last_name:"Cancel",address_1:"Synthetic 1",city:"Bratislava",postal_code:"81101",country_code:"sk"}},opts[0]))
  const id=created.cart.id
  await ok(api.post(`/store/carts/${id}/customer`,{},opts[0]))
  await ok(api.post(`/store/carts/${id}/line-items`,{variant_id:product.variants[0].id,quantity:1},opts[0]))
  if(bookingId)await ok(api.post(`/store/bookings/${bookingId}/cart`,{cart_id:id},opts[0]))
  if(voucherCode)await ok(api.post("/store/gift-vouchers/apply",{cart_id:id,code:voucherCode},opts[0]))
  await ok(api.post("/store/nexus-cart",{cart_id:id},opts[0]))
  const shipping=await ok(api.get(`/store/shipping-options?cart_id=${id}`,opts[0])),option=shipping.shipping_options.find((o:any)=>o.shipping_profile_id===profile.id)||shipping.shipping_options[0]
  await ok(api.post(`/store/carts/${id}/shipping-methods`,{option_id:option.id},opts[0]))
  const collection=await ok(api.post("/store/payment-collections",{cart_id:id},opts[0]))
  await ok(api.post(`/store/payment-collections/${collection.payment_collection.id}/payment-sessions`,{provider_id:"pp_system_default"},opts[0]))
  await ok(api.post(`/store/carts/${id}/consents`,{terms_accepted:true,privacy_acknowledged:true,terms_version:process.env.LEGAL_TERMS_VERSION,privacy_version:process.env.LEGAL_PRIVACY_VERSION},opts[0]))
  const completed=await ok(api.post("/store/nexus-checkout",{cart_id:id},opts[0]))
  return completed.order.id
 }
 const details=async(id:string)=>(await query.graph({entity:"order",fields:["id","status","items.id","items.quantity","payment_collections.payments.id"],filters:{id}})).data[0]
 const id=await cart(),path=`/store/orders/${id}/cancel`
 expect((await api.post(path,{},options)).status).toBe(401)
 expect((await api.post(path,{},opts[1])).status).toBe(404)
 const race=await Promise.all([api.post(path,{},opts[0]),api.post(path,{},opts[0])])
 expect(race.map(r=>r.status).sort()).toEqual([200,409])
 expect((await details(id)).status).toBe("canceled")
 expect((await api.post(path,{},opts[0])).status).toBe(409)
 record("OWNER_AUTH_AND_CONCURRENT_CANCEL")
 const shipped=await cart(),shippedOrder=await details(shipped)
 const {result:fulfillment}=await createOrderFulfillmentWorkflow(container).run({input:{order_id:shipped,items:[{id:shippedOrder.items[0].id,quantity:1}]}})
 await createOrderShipmentWorkflow(container).run({input:{order_id:shipped,fulfillment_id:fulfillment.id,items:[{id:shippedOrder.items[0].id,quantity:1}]}})
 expect((await api.post(`/store/orders/${shipped}/cancel`,{},opts[0])).status).toBe(409)
 record("SHIPPED_ORDER_DENIED")
 const digital=await cart("digital"),digitalOrder=await details(digital)
 await capturePaymentWorkflow(container).run({input:{payment_id:digitalOrder.payment_collections[0].payments[0].id}})
 await wait(async()=>(await container.resolve("entitlement").listEntitlements({order_id:digital})).length>0)
 expect((await api.post(`/store/orders/${digital}/cancel`,{},opts[0])).status).toBe(409)
 record("DIGITAL_ACCESS_DENIED")
 const date=new Date(Date.now()+45*86400000).toISOString().slice(0,10),week=mondayOf(date)
 await bookings.replaceWeekAvailability({week_start:week,days:Object.fromEntries(weekDates(week).map(d=>[d,[{start_time:"09:00",end_time:"18:00"}]]))})
 const bookingProduct=products.find((p:any)=>p.handle==="self-cancel-booking")!
 const slots=await ok(api.get(`/store/booking-slots?product_id=${bookingProduct.id}&from=${date}&to=${date}`,opts[0]))
 const hold=await ok(api.post("/store/bookings",{product_id:bookingProduct.id,starts_at:slots.slots[0].start},opts[0]))
 const booked=await cart("booking",hold.booking.id)
 await wait(async()=>(await bookings.retrieveBooking(hold.booking.id)).order_id===booked)
 expect((await api.post(`/store/orders/${booked}/cancel`,{},opts[0])).status).toBe(200)
 await wait(async()=>(await bookings.retrieveBooking(hold.booking.id)).status==="canceled")
 const available=await ok(api.get(`/store/booking-slots?product_id=${bookingProduct.id}&from=${date}&to=${date}`,opts[0]))
 expect(available.slots.some((s:any)=>s.start===slots.slots[0].start)).toBe(true)
 record("BOOKING_TERM_RELEASED")
 const issuedOrder=await cart()
 const alreadyIssued=(await vouchers.issueVoucher({issue_key:"self-cancel-already-issued",amount_minor:5000,order_id:issuedOrder,variant_id:products[0].variants[0].id,settings:{...DEFAULT_SETTINGS,delivery_method:"buyer_pdf"},recipient:null,purchaser_email:customers[0].email})).voucher
 expect((await api.post(`/store/orders/${issuedOrder}/cancel`,{},opts[0])).status).toBe(409)
 expect((await details(issuedOrder)).status).toBe("pending")
 expect((await vouchers.getVoucher(alreadyIssued.id)).balance).toBe(5000)
 record("ISSUED_VOUCHER_MANUAL_REVIEW")
 const issued=await vouchers.issueVoucher({issue_key:"self-cancel-credit",amount_minor:2000,order_id:"synthetic-origin-self-cancel",variant_id:products[0].variants[0].id,settings:{...DEFAULT_SETTINGS,delivery_method:"buyer_pdf"},recipient:null,purchaser_email:customers[0].email})
 const credited=await cart("plain",undefined,issued.voucher.code)
 await wait(async()=>(await vouchers.getVoucher(issued.voucher.id)).balance<2000)
 expect((await api.post(`/store/orders/${credited}/cancel`,{},opts[0])).status).toBe(200)
 await wait(async()=>(await vouchers.getVoucher(issued.voucher.id)).balance===2000)
 record("VOUCHER_CREDIT_RESTORED")
}
