import { limitMagicLink } from '../auth-magic-link-middlewares'
function fixture(rows: any[] = [{attempts:1,retry_after:900},{attempts:1,retry_after:900}]) {
 const db={raw:jest.fn(async()=>({rows:[rows.shift()]}))}
 const req={scope:{resolve:()=>db},ip:'synthetic-client',path:'/auth/customer/magic-link',params:{actor_type:'customer',auth_provider:'magic-link'},body:{email:'a@example.test'}}
 const res={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn()}
 return {db,req,res,next:jest.fn()}
}
describe('magic link abuse control',()=>{
 it('admits a request only after shared client and recipient counters succeed',async()=>{
  const f=fixture();await limitMagicLink(f.req,f.res,f.next)
  expect(f.next).toHaveBeenCalledTimes(1);expect(f.db.raw).toHaveBeenCalledTimes(2)
 })
 it('returns 429 and Retry-After without invoking auth or disclosing email',async()=>{
  const f=fixture([{attempts:1,retry_after:900},{attempts:4,retry_after:720}]);await limitMagicLink(f.req,f.res,f.next)
  expect(f.res.status).toHaveBeenCalledWith(429);expect(f.res.setHeader).toHaveBeenCalledWith('Retry-After','720');expect(f.next).not.toHaveBeenCalled()
  expect(JSON.stringify(f.res.json.mock.calls)).not.toContain('a@example.test')
 })
 it('limits confirmation traffic by client without consuming issuance quota',async()=>{
  const f=fixture();Object.assign(f.req.body,{token:'synthetic'});await limitMagicLink(f.req,f.res,f.next)
  expect(f.db.raw).toHaveBeenCalledTimes(1);expect(f.next).toHaveBeenCalled()
 })
 it('rejects another actor path before any issuance or persistence',async()=>{
  const f=fixture();f.req.path='/auth/user/magic-link';f.req.params.actor_type='user';await limitMagicLink(f.req,f.res,f.next)
  expect(f.res.status).toHaveBeenCalledWith(404);expect(f.next).not.toHaveBeenCalled();expect(f.db.raw).not.toHaveBeenCalled()
 })
 it('handles decoded provider paths without interfering with other auth providers',async()=>{
  const f=fixture();f.req.path='/auth/customer/%6dagic-link';await limitMagicLink(f.req,f.res,f.next)
  expect(f.db.raw).toHaveBeenCalledTimes(2)
  const other=fixture();other.req.params.auth_provider='google';await limitMagicLink(other.req,other.res,other.next)
  expect(other.next).toHaveBeenCalled();expect(other.db.raw).not.toHaveBeenCalled()
 })
 it('fails closed when persistence is unavailable',async()=>{
  const f=fixture();f.db.raw.mockRejectedValue(new Error('synthetic database failure'));await limitMagicLink(f.req,f.res,f.next)
  expect(f.res.status).toHaveBeenCalledWith(503);expect(f.next).not.toHaveBeenCalled()
 })
})
