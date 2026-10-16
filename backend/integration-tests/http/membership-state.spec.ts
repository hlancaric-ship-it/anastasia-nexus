import { Server } from 'node:net'
import { medusaIntegrationTestRunner } from '@medusajs/test-utils'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { MEMBERSHIP_MODULE } from '../../src/modules/membership'
import type MembershipModuleService from '../../src/modules/membership/service'
import type { Terms, Receipt } from '../../src/lib/membership/policy'
if(process.env.CI!=='true'||process.env.DB_USERNAME!=='membership_synthetic'||process.env.DB_HOST!=='localhost'||process.env.DB_TEMP_NAME!=='anastasia_membership_ci')throw new Error('Run only in isolated membership-state CI')
const listen=Server.prototype.listen
Server.prototype.listen=function(...args:any[]){if(typeof args[0]==='number'&&(args.length===1||typeof args[1]==='function'))args.splice(1,0,'127.0.0.1');return(listen as any).apply(this,args)} as any
jest.setTimeout(180_000)
const now='2026-10-01T12:00:00.000Z',due='2026-10-31T12:00:00.000Z'
const terms:Terms={customer_id:'cus_synthetic',product_id:'prod_synthetic',variant_id:'var_synthetic',version:'v1',period_days:30,amount_minor:5000,currency:'eur'}
const receipt:Receipt={order_id:'ord_synthetic',customer_id:terms.customer_id,product_id:terms.product_id,variant_id:terms.variant_id,currency:'eur',amount_minor:5000,captured_minor:5000,refunded_minor:0,paid_at:now,canceled:false,exclusive_member_order:true,checkout_key:'initial:ord_synthetic'}
const current={version:'v1',amount_minor:5000,currency:'eur'}
medusaIntegrationTestRunner({dbName:'anastasia_membership_ci',hooks:{beforeServerStart:async container=>{
 // Test-only module registration. Integrator owns the actual application configuration.
 const config=container.resolve(ContainerRegistrationKeys.CONFIG_MODULE) as any
 config.modules[MEMBERSHIP_MODULE]={resolve:'./src/modules/membership'}
}},testSuite:({getContainer,dbConnection})=>{
 afterAll(()=>{Server.prototype.listen=listen})
 const service=()=>getContainer().resolve<MembershipModuleService>(MEMBERSHIP_MODULE)
 it('atomically deduplicates activation and renewal with persistent receipt claims under concurrent calls',async()=>{
  const s=service(),created=await Promise.all([s.activate(terms,receipt,{version:'v1',auto_renew:true},now),s.activate(terms,receipt,{version:'v1',auto_renew:true},now)])
  expect(created.map(r=>r.replayed).sort()).toEqual([false,true])
  const id=created[0].state.id
  expect(created[1].state.id).toBe(id)
  expect(await dbConnection('membership').count('* as n').first()).toMatchObject({n:'1'})
  expect(await s.findForCustomer(id,'cus_other')).toBeNull()
  expect((await s.findForCustomer(id,terms.customer_id))?.period_end).toBe(due)
  const plans=await Promise.all([s.prepareRenewal(id,due,current),s.prepareRenewal(id,due,current)])
  expect(plans.map(r=>r.action).sort()).toEqual(['ENQUEUE_NATIVE_CHECKOUT','RECONCILE_NATIVE_CHECKOUT'])
  const key=plans[0].key!
  await s.markUnknown(id,key)
  expect((await s.prepareRenewal(id,due,current)).action).toBe('RECONCILE_NATIVE_CHECKOUT')
  await expect(s.markUnknown(id,'other-operation')).rejects.toThrow('STALE_EXECUTION')
  const paid={...receipt,order_id:'ord_renewal',paid_at:due,checkout_key:key}
  const applied=await Promise.all([s.applyReceipt(id,paid,due),s.applyReceipt(id,paid,due)])
  expect(applied.map(r=>r.replayed).sort()).toEqual([false,true])
  expect(applied[0].state.period_end).toBe('2026-11-30T12:00:00.000Z')
  expect(await dbConnection('membership_receipt').count('* as n').first()).toMatchObject({n:'2'})
  await s.stop(id)
  expect((await s.prepareRenewal(id,'2026-12-01T12:00:00.000Z',current)).action).toBe('NONE')
  const replay=await s.activate(terms,receipt,{version:'v1',auto_renew:true},due)
  expect(replay.replayed).toBe(true);expect(replay.state.renew).toBe(false)
 })
 it('does not save invalid payment or reuse another membership receipt; unknown outcomes survive reads',async()=>{
  const s=service()
  await expect(s.activate(terms,{...receipt,captured_minor:0},{version:'v1',auto_renew:true},now)).rejects.toThrow('PAYMENT_NOT_VERIFIED')
  expect(await dbConnection('membership').count('* as n').first()).toMatchObject({n:'0'})
  const first=await s.activate(terms,receipt,{version:'v1',auto_renew:true},now)
  const otherReceipt={...receipt,order_id:'ord_second',checkout_key:'initial:ord_second'}
  const other=await s.activate(terms,otherReceipt,{version:'v1',auto_renew:true},now)
  const pending=await s.prepareRenewal(other.state.id,due,current)
  await expect(s.applyReceipt(other.state.id,{...receipt,paid_at:due,checkout_key:pending.key!},due)).rejects.toThrow('ORDER_ALREADY_CLAIMED')
  expect((await s.findForCustomer(first.state.id,terms.customer_id))?.period_end).toBe(due)
  expect((await s.findForCustomer(other.state.id,terms.customer_id))?.status).toBe('renewing')
  await s.markUnknown(other.state.id,pending.key!)
  expect((await s.findForCustomer(other.state.id,terms.customer_id))?.status).toBe('unknown')
  await s.stop(other.state.id)
  expect((await s.prepareRenewal(other.state.id,due,current)).action).toBe('RECONCILE_NATIVE_CHECKOUT')
  // Soft deletion must not free the globally unique order claim for re-use.
  await s.softDeleteMembershipReceipts((await s.listMembershipReceipts({order_id:receipt.order_id})).map(r=>r.id))
  await expect(s.createMembershipReceipts({membership_id:other.state.id,order_id:receipt.order_id,checkout_key:'another-attempt'})).rejects.toThrow()
  await expect(s.activate(terms,receipt,{version:'v1',auto_renew:true},now)).rejects.toThrow()
  expect(await dbConnection('membership').count('* as n').first()).toMatchObject({n:'2'})
 })
}})
