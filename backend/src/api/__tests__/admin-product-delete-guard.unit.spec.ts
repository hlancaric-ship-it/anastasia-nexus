import { guardProductBatchDelete, guardProductDelete, productDeletionBlockers } from '../admin-product-delete-guard'
const listEntitlements=jest.fn(), listBookings=jest.fn(), listBookingRequests=jest.fn()
const scope={resolve:(key:string)=>key==='entitlement'?{listEntitlements}:{listBookings,listBookingRequests}}
const NOW=new Date('2026-10-28T10:00:00Z')
function fixture(params:any={}, body:any={}) {
 const req:any={params,body,scope}
 const res:any={status:jest.fn().mockReturnThis(),json:jest.fn()}
 return {req,res,next:jest.fn()}
}
beforeEach(()=>{
 listEntitlements.mockReset().mockResolvedValue([]); listBookings.mockReset().mockResolvedValue([]); listBookingRequests.mockReset().mockResolvedValue([])
})
describe('product deletion guard',()=>{
 it('allows deleting a product nothing depends on',async()=>{
  const f=fixture({id:'prod_1'});await guardProductDelete(f.req,f.res,f.next)
  expect(f.next).toHaveBeenCalled();expect(listEntitlements).toHaveBeenCalledWith({product_id:'prod_1',status:'active'},expect.anything())
 })
 it('blocks a digital product with an active customer access',async()=>{
  listEntitlements.mockResolvedValue([{status:'active',expires_at:null}])
  const f=fixture({id:'prod_1'});await guardProductDelete(f.req,f.res,f.next)
  expect(f.res.status).toHaveBeenCalledWith(409);expect(f.next).not.toHaveBeenCalled()
  expect(f.res.json).toHaveBeenCalledWith(expect.objectContaining({code:'PRODUCT_IN_USE',blockers:['active_access']}))
 })
 it('ignores expired access and past bookings, blocks upcoming bookings and pending requests',async()=>{
  listEntitlements.mockResolvedValue([{status:'active',expires_at:'2026-10-01T00:00:00Z'}])
  listBookings.mockResolvedValue([{ends_at:'2026-10-20T10:00:00Z'}])
  expect(await productDeletionBlockers(scope,'prod_1',NOW)).toEqual([])
  listBookings.mockResolvedValue([{ends_at:'2026-10-29T10:00:00Z'}]);listBookingRequests.mockResolvedValue([{id:'bkrq_1'}])
  expect(await productDeletionBlockers(scope,'prod_1',NOW)).toEqual(['upcoming_booking','pending_booking_request'])
  expect(listBookings).toHaveBeenCalledWith({product_id:'prod_1',status:['held','confirmed']},expect.anything())
 })
 it('fails closed when the check cannot run',async()=>{
  listBookings.mockRejectedValue(new Error('db down'))
  const f=fixture({id:'prod_1'});await guardProductDelete(f.req,f.res,f.next)
  expect(f.res.status).toHaveBeenCalledWith(503);expect(f.next).not.toHaveBeenCalled()
 })
 it('checks every id of a batch delete and leaves other batch edits alone',async()=>{
  listEntitlements.mockImplementation(async(q:any)=>q.product_id==='prod_2'?[{status:'active'}]:[])
  const b=fixture({}, {delete:['prod_1','prod_2']});await guardProductBatchDelete(b.req,b.res,b.next)
  expect(b.res.status).toHaveBeenCalledWith(409);expect(b.res.json).toHaveBeenCalledWith(expect.objectContaining({product_id:'prod_2'}))
  const u=fixture({}, {update:[{id:'prod_2',title:'x'}]});await guardProductBatchDelete(u.req,u.res,u.next);expect(u.next).toHaveBeenCalled()
  for(const bad of ['prod_1',[{id:'x'}],['../x']]){const x=fixture({}, {delete:bad});await guardProductBatchDelete(x.req,x.res,x.next);expect(x.res.status).toHaveBeenCalledWith(400)}
 })
})
