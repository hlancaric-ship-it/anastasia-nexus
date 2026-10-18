import { ownOrderOnly, orderSelfCancelMiddlewares } from '../order-self-cancel-middlewares'
function fixture(actor: string | undefined, owner: string | null) {
 const query={graph:jest.fn(async()=>({data:owner===undefined?[]:[{id:'order_1',customer_id:owner}]}))}
 const req:any={scope:{resolve:()=>query},params:{id:'order_1'},originalUrl:'/store/orders/order_1',auth_context:actor?{actor_type:'customer',actor_id:actor}:undefined}
 const res:any={status:jest.fn().mockReturnThis(),json:jest.fn()}
 return {query,req,res,next:jest.fn()}
}
describe('order detail privacy',()=>{
 it('lets the owner read her order',async()=>{
  const f=fixture('cus_a','cus_a');await ownOrderOnly(f.req,f.res,f.next)
  expect(f.next).toHaveBeenCalledWith();expect(f.res.status).not.toHaveBeenCalled()
 })
 it('hides another customer order and guest orders as 404',async()=>{
  for(const owner of ['cus_b',null]){
   const f=fixture('cus_a',owner);await ownOrderOnly(f.req,f.res,f.next)
   expect(f.res.status).toHaveBeenCalledWith(404);expect(f.next).not.toHaveBeenCalled()
  }
 })
 it('never queries without an authenticated customer',async()=>{
  const f=fixture(undefined,'cus_a');await ownOrderOnly(f.req,f.res,f.next)
  expect(f.res.status).toHaveBeenCalledWith(404);expect(f.query.graph).not.toHaveBeenCalled()
 })
 it('passes lookup errors to the error handler',async()=>{
  const f=fixture('cus_a','cus_a');f.query.graph.mockRejectedValueOnce(new Error('db'));await ownOrderOnly(f.req,f.res,f.next)
  expect(f.next).toHaveBeenCalledWith(expect.any(Error))
 })
 it('guards GET detail with customer authentication',()=>{
  const route=orderSelfCancelMiddlewares.find(r=>r.matcher==='/store/orders/:id')
  expect(route?.method).toEqual(['GET']);expect(route?.middlewares).toHaveLength(2)
 })
})
