jest.mock('../checkout',()=>({settleMembershipCheckout:jest.fn()}))
jest.mock('../access',()=>({reconcileMembershipAccess:jest.fn()}))
jest.mock('../../observability/events',()=>({recordEvent:jest.fn(async()=>undefined)}))
import job from '../../../jobs/membership-access-reconcile'
import {settleMembershipCheckout} from '../checkout'
it('recovers over one page while successful settlements leave the pending set; a failed row remains retryable',async()=>{
 const pending=new Map(Array.from({length:101},(_,i)=>[`mck_${String(i).padStart(3,'0')}`,{id:`mck_${String(i).padStart(3,'0')}`,customer_id:'cus_a'}]))
 const service={listMembershipCheckouts:jest.fn(async(filter:any)=>Array.from(pending.values()).filter(r=>!filter.id||r.id>filter.id.$gt).slice(0,50)),listMemberships:jest.fn(async()=>[])}
 const container:any={hasRegistration:()=>true,resolve:()=>service}
 let fail=true
 jest.mocked(settleMembershipCheckout).mockImplementation(async(_scope:any,id:string)=>{if(id==='mck_003'&&fail)throw new Error('temporary native read failure');pending.delete(id);return {status:'PENDING'} as any})
 await job(container)
 expect(settleMembershipCheckout).toHaveBeenCalledTimes(101)
 expect([...pending.keys()]).toEqual(['mck_003'])
 expect(new Set(jest.mocked(settleMembershipCheckout).mock.calls.map(c=>c[1])).size).toBe(101)
 fail=false
 await job(container)
 expect(pending.size).toBe(0)
 expect(settleMembershipCheckout).toHaveBeenCalledTimes(102)
})
