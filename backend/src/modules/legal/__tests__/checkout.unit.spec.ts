import { assertCartConsent } from "../../../lib/legal/checkout"
import { requireCheckoutConsent } from "../../../api/legal-middlewares"
const saved={terms_version:"v1",privacy_version:"p1",customer_id:null,accepted_at:new Date()}
describe("checkout consent authority",()=>{
 beforeEach(()=>{process.env.LEGAL_TERMS_VERSION="v1";process.env.LEGAL_PRIVACY_VERSION="p1"})
 afterEach(()=>{delete process.env.LEGAL_TERMS_VERSION;delete process.env.LEGAL_PRIVACY_VERSION})
 it("rejects fabricated cart metadata",async()=>{
  const scope:any={resolve:()=>({listLegalConsents:async()=>[]})}
  await expect(assertCartConsent(scope,{id:"cart",metadata:{legal_consent:saved}} as any)).rejects.toThrow("TERMS_NOT_ACCEPTED")
 })
 it("accepts persisted current consent, rejects changed customer or version",async()=>{
  const scope:any={resolve:()=>({listLegalConsents:async()=>[saved]})}
  await expect(assertCartConsent(scope,{id:"cart"})).resolves.toBeUndefined()
  await expect(assertCartConsent(scope,{id:"cart",customer_id:"other"})).rejects.toThrow()
  process.env.LEGAL_TERMS_VERSION="v2"
  await expect(assertCartConsent(scope,{id:"cart"})).rejects.toThrow()
 })
 it("returns 422 before both checkout endpoints touch pricing or payment",async()=>{
  for(const req of [{params:{id:"cart"},body:{}},{params:{},body:{cart_id:"cart"}}]) {
   const scope:any={resolve:(key:string)=>key==="query"?{graph:async()=>({data:[{id:"cart",customer_id:null}]})}:{listLegalConsents:async()=>[]}}
   const res:any={status:jest.fn().mockReturnThis(),json:jest.fn()};const next=jest.fn()
   await requireCheckoutConsent({...req,scope},res,next)
   expect(res.status).toHaveBeenCalledWith(422);expect(res.json).toHaveBeenCalledWith(expect.objectContaining({error:"TERMS_NOT_ACCEPTED"}));expect(next).not.toHaveBeenCalled()
  }
 })
})
