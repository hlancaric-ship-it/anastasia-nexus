import { storeLink, consumeLink, claimAuthRate } from '../state'
import { sha256Hex } from '../policy'
describe('persistent magic link state',()=>{
 it('persists only hashes and bounds TTL in the database',async()=>{
  const db={raw:jest.fn(async(_sql: string, _bindings: unknown[] = [])=>({rows:[]}))};await storeLink(db,'a@example.test','synthetic-token')
  expect(db.raw.mock.calls[0][1]).toEqual([sha256Hex('a@example.test'),sha256Hex('synthetic-token'),900])
 })
 it('atomically consumes only a matching unexpired token',async()=>{
  const db={raw:jest.fn(async(_sql: string, _bindings: unknown[] = [])=>({rows:[{id:'synthetic'}]}))};expect(await consumeLink(db,'a@example.test','token')).toBe(true)
  expect(db.raw.mock.calls[0][0]).toContain('token_hash = ? and expires_at > now() returning id')
  db.raw.mockResolvedValue({rows:[]});expect(await consumeLink(db,'a@example.test','wrong')).toBe(false)
 })
 it('rejects invalid token length before database access',async()=>{
  const db={raw:jest.fn()};expect(await consumeLink(db,'a@example.test','x'.repeat(2049))).toBe(false);expect(db.raw).not.toHaveBeenCalled()
 })
 it('uses persistent capped counters and returns remaining time',async()=>{
  const db={raw:jest.fn(async(_sql: string, _bindings: unknown[] = [])=>({rows:[{attempts:4,retry_after:899}]}))}
  expect(await claimAuthRate(db,'email:a@example.test',3,900)).toEqual({allowed:false,retryAfter:899})
  expect(db.raw.mock.calls[0][1]).toEqual([sha256Hex('email:a@example.test'),900,4])
 })
})
