import { POST as accept } from "../../../api/store/carts/[id]/consents/route"
import { POST as withdrawal } from "../../../api/store/withdrawals/route"
import { POST as transition } from "../../../api/admin/withdrawals/[id]/route"
import { GET as newsletter } from "../../../api/admin/newsletter/route"
jest.mock("../../../lib/observability/audit",()=>({auditAdminChange:jest.fn(async()=>"audit")}))
import { auditAdminChange } from "../../../lib/observability/audit"
const response=()=>({setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn(),send:jest.fn()})
function request(service:any,order:any={},body:any={}) {
 const notification={listNotifications:jest.fn(async()=>[{id:"sent"}]),createNotifications:jest.fn()}
 const req:any={params:{id:"cart"},body,query:{},auth_context:{actor_id:"owner",actor_type:"customer"},scope:{resolve:(key:string)=>key==="query"?{graph:async()=>({data:[order]})}:key==="notification"?notification:key==="logger"?{error:jest.fn()}:service}}
 return {req,notification}
}
describe("legal routes",()=>{
 beforeEach(()=>{process.env.LEGAL_TERMS_VERSION="v1";process.env.LEGAL_PRIVACY_VERSION="p1";jest.clearAllMocks()})
 afterEach(()=>{delete process.env.LEGAL_TERMS_VERSION;delete process.env.LEGAL_PRIVACY_VERSION})
 it("cannot accept for another customer's cart",async()=>{
  const service={accept:jest.fn()}, {req}=request(service,{id:"cart",customer_id:"other"},{terms_accepted:true,privacy_acknowledged:true,terms_version:"v1",privacy_version:"p1"}),res=response()
  await accept(req,res as any)
  expect(res.status).toHaveBeenCalledWith(404);expect(service.accept).not.toHaveBeenCalled()
 })
 it("accepts a native guest cart by its opaque ID and rejects a foreign authenticated actor",async()=>{
  const service={accept:jest.fn(async(input:any)=>({...input,accepted_at:new Date()}))}
  const {req}=request(service,{id:"cart",customer_id:"guest",customer:{has_account:false}},{terms_accepted:true,privacy_acknowledged:true,terms_version:"v1",privacy_version:"p1"})
  req.auth_context=undefined;const guestResponse=response();await accept(req,guestResponse as any)
  expect(guestResponse.status).toHaveBeenCalledWith(200)
  expect(service.accept).toHaveBeenCalledWith(expect.objectContaining({customer_id:"guest"}))
  req.auth_context={actor_type:"customer",actor_id:"foreign"};service.accept.mockClear();const denied=response();await accept(req,denied as any)
  expect(denied.status).toHaveBeenCalledWith(404);expect(service.accept).not.toHaveBeenCalled()
 })
 it("requires authentication for a registered customer's cart",async()=>{
  const service={accept:jest.fn()}, {req}=request(service,{id:"cart",customer_id:"registered",customer:{has_account:true}},{terms_accepted:true,privacy_acknowledged:true,terms_version:"v1",privacy_version:"p1"})
  req.auth_context=undefined;const denied=response();await accept(req,denied as any)
  expect(denied.status).toHaveBeenCalledWith(404);expect(service.accept).not.toHaveBeenCalled()
 })
 it("returns the original withdrawal receipt after the window without creating a refund",async()=>{
  const row={id:"w",order_id:"o",customer_id:"owner",items:[{item_id:"i",quantity:1}],status:"received"}
  const service={listLegalWithdrawals:async()=>[row],requestWithdrawal:jest.fn(async()=>({row,replayed:true}))}
  const {req,notification}=request(service,{id:"o",customer_id:"owner",items:[{id:"i",quantity:1}]},{order_id:"o",items:[{item_id:"i",quantity:1}]})
  const res=response();await withdrawal(req,res as any)
  expect(res.status).toHaveBeenCalledWith(200);expect(notification.createNotifications).not.toHaveBeenCalled()
 })
 it("denies a forged order response whose customer is foreign",async()=>{
  const service={requestWithdrawal:jest.fn()}, {req}=request(service,{id:"o",customer_id:"foreign"},{order_id:"o"}),res=response()
  await withdrawal(req,res as any);expect(res.status).toHaveBeenCalledWith(404);expect(service.requestWithdrawal).not.toHaveBeenCalled()
 })
 it("does not audit repeated admin transitions or any free text",async()=>{
  const service={transition:async()=>({row:{id:"w",status:"accepted",reason:"private"},before:"received",replayed:false})}
  const {req}=request(service,{}, {status:"accepted"});req.auth_context={actor_type:"user",actor_id:"admin"}
  await transition(req,response() as any)
  expect(auditAdminChange).toHaveBeenCalledWith(req,"withdrawal.status","legal_withdrawal","w",{status:"received"},{status:"accepted"})
  ;(auditAdminChange as jest.Mock).mockClear();service.transition=async()=>({row:{id:"w",status:"accepted",reason:"private"},before:"accepted",replayed:true})
  await transition(req,response() as any);expect(auditAdminChange).not.toHaveBeenCalled()
 })
 it("never exports unsubscribe hashes",async()=>{
  const {req}=request({listAndCountNewsletterConsents:async()=>[[{id:"n",email:"synthetic@example.test",token_hash:"private"}],1]})
  req.auth_context={actor_type:"user",actor_id:"admin"};const res=response();await newsletter(req,res as any)
  expect(JSON.stringify(res.json.mock.calls)).not.toContain("private")
 })
})
