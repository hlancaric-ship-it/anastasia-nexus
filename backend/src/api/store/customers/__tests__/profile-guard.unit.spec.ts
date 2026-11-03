import { guardCustomerProfile, sanitizeProfileBody } from '../profile-guard'
function run(body:any){
 const req:any={body},res:any={status:jest.fn().mockReturnThis(),json:jest.fn()},next=jest.fn()
 guardCustomerProfile(req,res,next);return {req,res,next}
}
describe('customer profile update keeps only own profile fields',()=>{
 it('drops ambassador and other privileged metadata (self-promotion attempt)',()=>{
  const f=run({first_name:'Eva',metadata:{ambassador:{code:'HACK',commission_percent:100},legacy_customer_migration:true,city:'Košice'}})
  expect(f.next).toHaveBeenCalledTimes(1);expect(f.req.body.metadata).toEqual({city:'Košice'})
 })
 it('accepts and normalizes company data',()=>{
  const body:any={company_name:'  Firma s.r.o. ',metadata:{company_ico:'12 345 678',company_ic_dph:'sk2020123456',company_street:' Hlavná 1 ',company_city:'Košice',company_postal_code:'04001'}}
  expect(sanitizeProfileBody(body)).toEqual({ok:true})
  expect(body.company_name).toBe('Firma s.r.o.')
  expect(body.metadata).toEqual({company_ico:'12345678',company_ic_dph:'SK2020123456',company_street:'Hlavná 1',company_city:'Košice',company_postal_code:'04001'})
 })
 it('rejects an invalid company id with 400',()=>{
  const f=run({metadata:{company_ico:'abc'}})
  expect(f.res.status).toHaveBeenCalledWith(400);expect(f.res.json).toHaveBeenCalledWith(expect.objectContaining({code:'INVALID_COMPANY_ID'}));expect(f.next).not.toHaveBeenCalled()
 })
 it('rejects non-string values and allows clearing a field',()=>{
  expect(run({metadata:{city:{x:1}}}).res.status).toHaveBeenCalledWith(400)
  const f=run({metadata:{company_dic:'',street:null}});expect(f.req.body.metadata).toEqual({company_dic:'',street:''})
 })
 it('leaves metadata untouched when the request does not send it',()=>{
  const f=run({phone:'+421900000000'});expect(f.req.body).toEqual({phone:'+421900000000'});expect(f.next).toHaveBeenCalled()
 })
})
