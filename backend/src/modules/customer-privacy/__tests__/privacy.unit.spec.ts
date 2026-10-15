import { verifiedCustomerEmails } from "../identity"
import { confirmErasure,erasedEmail,noteBody,safeVoucher } from "../policy"
import { denyErasedCustomer } from "../../../api/customer-privacy-middlewares"
import { POST as execute } from "../../../api/admin/customer-erasures/[id]/execute/route"
jest.mock("../../../lib/observability/audit",()=>({auditAdminChange:jest.fn(async()=>"audit")}))
const res=()=>({setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn()})
const chain=(row:any)=>{const q:any={where:jest.fn(()=>q),whereNull:jest.fn(()=>q),whereIn:jest.fn(()=>q),first:jest.fn(async()=>row)};return q}
describe("customer privacy",()=>{
 it("requires both explicit confirmation and the exact customer",()=>{
  for(const input of [{},{confirm:"true",customer_id:"a"},{confirm:true,customer_id:"b"}])expect(()=>confirmErasure(input,"a")).toThrow()
  expect(()=>confirmErasure({confirm:true,customer_id:"a"},"a")).not.toThrow()
 })
 it("derives email-linked authority only from persisted customer-bound magic-link identities",async()=>{
  const q:any={join:jest.fn(()=>q),where:jest.fn(()=>q),whereRaw:jest.fn(()=>q),whereNull:jest.fn(()=>q),select:jest.fn(async()=>[{entity_id:"Owner@EXAMPLE.TEST"},{entity_id:"owner@example.test"},{entity_id:"invalid"}])}
  expect(await verifiedCustomerEmails(()=>q,"customer_a")).toEqual(["owner@example.test"])
  expect(q.where).toHaveBeenCalledWith({"p.provider":"magic-link"})
  expect(q.whereRaw).toHaveBeenCalledWith("a.app_metadata->>'customer_id' = ?",["customer_a"])
 })
 it("uses stable, non-personal replacement contacts",()=>{
  expect(erasedEmail("a")).toEqual(erasedEmail("a"));expect(erasedEmail("a")).not.toEqual(erasedEmail("b"))
  expect(erasedEmail("a")).toMatch(/^erased-[a-f0-9]{32}@example.invalid$/)
 })
 it("never exposes another recipient's voucher code or personal message",()=>{
  const voucher={id:"v",recipient_email:"other@example.test",recipient_name:"Other",message:"private",code:"bearer-code",balance:5000}
  expect(JSON.stringify(safeVoucher(voucher,"owner@example.test"))).not.toMatch(/bearer-code|private|Other|other@example/)
  expect((safeVoucher(voucher,"other@example.test") as any).code).toBeUndefined()
 })
 it("validates bounded plain text notes",()=>{
  expect(noteBody("  text  ")).toBe("text")
  for(const input of [null," ","x".repeat(5001)])expect(()=>noteBody(input)).toThrow()
 })
 it.each(["processing","completed"])("rejects old bearer/session actors when %s",async()=>{
  const q=chain({id:"erasure"}), req:any={scope:{resolve:()=>()=>q},auth_context:{actor_type:"customer",actor_id:"a"},session:{auth_context:{actor_type:"customer",actor_id:"a"}}},response=res(),next=jest.fn()
  await denyErasedCustomer(req,response,next)
  expect(response.status).toHaveBeenCalledWith(401);expect(next).not.toHaveBeenCalled();expect(req.session.auth_context).toBeUndefined()
  expect(q.where).toHaveBeenCalledWith({customer_id:"a"})
 })
 it("does not grant access during a tombstone store failure",async()=>{
  const req:any={scope:{resolve:()=>{throw new Error("DB unavailable")}},auth_context:{actor_type:"customer",actor_id:"a"}},response=res(),next=jest.fn()
  await denyErasedCustomer(req,response,next);expect(response.status).toHaveBeenCalledWith(503);expect(next).not.toHaveBeenCalled()
 })
 it("leaves an unerased customer usable",async()=>{
  const req:any={scope:{resolve:()=>()=>chain(null)},auth_context:{actor_type:"customer",actor_id:"a"}},response=res(),next=jest.fn()
  await denyErasedCustomer(req,response,next);expect(next).toHaveBeenCalledTimes(1)
 })
 it("requires confirmation before any destructive preparation",async()=>{
  const service={listCustomerErasures:async()=>[{id:"e",customer_id:"c"}],prepareErasure:jest.fn(),completeErasure:jest.fn()},req:any={params:{id:"e"},body:{confirm:false,customer_id:"c"},auth_context:{actor_type:"user",actor_id:"admin"},scope:{resolve:()=>service}},response=res()
  await execute(req,response as any);expect(response.status).toHaveBeenCalledWith(422);expect(service.prepareErasure).not.toHaveBeenCalled()
 })
 it("does not claim completion if magic-link invalidation fails",async()=>{
  const service={listCustomerErasures:async()=>[{id:"e",customer_id:"c"}],prepareErasure:async()=>({row:{},emails:["synthetic@example.test"],replayed:false}),completeErasure:jest.fn()}
  const req:any={params:{id:"e"},body:{confirm:true,customer_id:"c"},auth_context:{actor_type:"user",actor_id:"admin"},scope:{resolve:(k:string)=>k==="auth"?{getAuthIdentityProviderService:()=>({getState:async()=>{throw new Error("cache unavailable")}})}:k==="logger"?{error:jest.fn()}:service}},response=res()
  await execute(req,response as any);expect(response.status).toHaveBeenCalledWith(503);expect(service.completeErasure).not.toHaveBeenCalled()
 })
})
