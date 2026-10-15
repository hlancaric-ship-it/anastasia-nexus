jest.mock("@medusajs/framework/utils",()=>({
 ...jest.requireActual("@medusajs/framework/utils"),
 InjectTransactionManager:()=>()=>{},MedusaContext:()=>()=>{},
}))
import LegalModuleService from "../service"
function fixture() {
 const state:any={old:{id:"n",email:"synthetic@example.test",status:"subscribed",text_version:"v1",token_hash:"persisted-token-hash"},events:[]}
 const db=(table:string)=>{
  const q:any={where:()=>q,whereNull:()=>q,first:async()=>({...state.old}),update:async(data:any)=>Object.assign(state.old,data),insert:async(data:any)=>{if(table==="newsletter_consent_event")state.events.push(data)}}
  return q
 }
 const service=Object.create(LegalModuleService.prototype) as any
 service.db=()=>db;service.lock=async()=>{}
 return {state,service}
}
describe("newsletter version evidence",()=>{
 it("makes a same-version retry a no-op",async()=>{
  const {state,service}=fixture()
  expect(await service.subscribe({email:state.old.email,source:"footer",text_version:"v1"})).toEqual({accepted:true})
  expect(state.events).toHaveLength(0);expect(state.old.token_hash).toBe("persisted-token-hash")
 })
 it("records renewed consent without invalidating an existing unsubscribe link",async()=>{
  const {state,service}=fixture()
  const result=await service.subscribe({email:state.old.email,source:"account",text_version:"v2"})
  expect(result).toEqual({accepted:true});expect(state.old.text_version).toBe("v2")
  expect(state.old.token_hash).toBe("persisted-token-hash")
  expect(state.events).toHaveLength(1);expect(state.events[0]).toMatchObject({consent_id:"n",text_version:"v2",status:"subscribed"})
 })
})
