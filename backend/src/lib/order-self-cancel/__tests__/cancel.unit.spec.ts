jest.mock("@medusajs/medusa/core-flows",()=>({cancelOrderWorkflow:jest.fn()}))
import { cancelOrderWorkflow } from "@medusajs/medusa/core-flows"
import { assertSelfCancelable,bookingCancellationHours } from "../policy"
import { cancelOwnOrder,withCancellationLock } from "../cancel"
const order=()=>({id:"o",customer_id:"c",status:"pending",fulfillments:[]})
const signals=()=>({entitlements:[],bookings:[],issuedVouchers:[]})
describe("self cancellation",()=>{
 afterEach(()=>{delete process.env.ORDER_SELF_CANCEL_BOOKING_HOURS;jest.clearAllMocks()})
 it("binds order lookup to the authenticated customer",()=>{
  expect(()=>assertSelfCancelable(order(),"other",signals())).toThrow("ORDER_NOT_FOUND")
  expect(()=>assertSelfCancelable(null,"c",signals())).toThrow("ORDER_NOT_FOUND")
 })
 it.each(["canceled","completed","archived"])("rejects status %s",status=>expect(()=>assertSelfCancelable({...order(),status},"c",signals())).toThrow("ORDER_CANCEL_NOT_AVAILABLE"))
 it("rejects any active fulfillment and previously shipped packages",()=>{
  for(const f of [{canceled_at:null},{canceled_at:new Date(),shipped_at:new Date()}])expect(()=>assertSelfCancelable({...order(),fulfillments:[f]},"c",signals())).toThrow("ORDER_ALREADY_FULFILLED")
 })
 it("never permits cancellation after a digital grant, including revoked grants",()=>{
  expect(()=>assertSelfCancelable(order(),"c",{...signals(),entitlements:[{status:"revoked"}]})).toThrow("DIGITAL_CONTENT_ALREADY_AVAILABLE")
 })
 it("does not refund an order whose issued voucher was consumed",()=>{
  expect(()=>assertSelfCancelable(order(),"c",{...signals(),issuedVouchers:[{initial_amount:10000,balance:9000}]})).toThrow("ISSUED_VOUCHER_ALREADY_USED")
  expect(()=>assertSelfCancelable(order(),"c",{...signals(),issuedVouchers:[{initial_amount:10000,balance:10000}]})).not.toThrow()
 })
 it("uses server deadline and fails closed for invalid configuration",()=>{
  expect(bookingCancellationHours()).toBe(24);expect(bookingCancellationHours("0")).toBe(0)
  for(const input of ["24junk","-1","1.5","721"])expect(()=>bookingCancellationHours(input)).toThrow("ORDER_CANCEL_NOT_CONFIGURED")
  const now=new Date("2026-01-01T00:00:00Z"),b={customer_id:"c",status:"confirmed",starts_at:new Date(+now+24*3600000)}
  expect(()=>assertSelfCancelable(order(),"c",{...signals(),bookings:[b]},now)).toThrow("BOOKING_CANCEL_TOO_LATE")
  expect(()=>assertSelfCancelable(order(),"c",{...signals(),bookings:[{...b,starts_at:new Date(+now+25*3600000)}]},now)).not.toThrow()
 })
 it("returns conflict immediately when another process owns the DB mutex",async()=>{
  const tx={raw:jest.fn(async()=>({rows:[{acquired:false}]}))},db={transaction:(job:any)=>job(tx)},job=jest.fn()
  await expect(withCancellationLock(db,"o",job)).rejects.toThrow("ORDER_CANCEL_IN_PROGRESS");expect(job).not.toHaveBeenCalled()
 })
 it("does not acquire a mutex or run workflows for foreign orders",async()=>{
  const db={transaction:jest.fn()},scope:any={resolve:(key:string)=>key==="query"?{graph:async()=>({data:[{...order(),customer_id:"other"}]})}:db}
  await expect(cancelOwnOrder(scope,"o","c")).rejects.toThrow("ORDER_NOT_FOUND")
  expect(db.transaction).not.toHaveBeenCalled();expect(cancelOrderWorkflow).not.toHaveBeenCalled()
 })
 it("delegates one allowed cancellation to native workflow with no caller-controlled amounts",async()=>{
  const run=jest.fn(async()=>({result:undefined}));(cancelOrderWorkflow as unknown as jest.Mock).mockReturnValue({run})
  const db={transaction:async(job:any)=>job({raw:async()=>({rows:[{acquired:true}]})})}
  const services:any={query:{graph:async()=>({data:[order()]})},__pg_connection__:db,entitlement:{listEntitlements:async()=>[]},booking:{listAndCountBookings:async()=>[[],0]},gift_voucher:{listAndCountGiftVouchers:async()=>[[],0]}}
  const scope:any={resolve:(key:string)=>services[key]}
  expect(await cancelOwnOrder(scope,"o","c")).toEqual({id:"o",status:"canceled"})
  expect(run).toHaveBeenCalledTimes(1);expect(run).toHaveBeenCalledWith({input:{order_id:"o"}})
 })
})
