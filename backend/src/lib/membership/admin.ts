import { z } from 'zod'
import { assertMembership, type Membership } from './policy'
export const membershipConfig = z.object({ version:z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/),period_days:z.number().int().min(1).max(3650) }).strict()
export const membershipConfigInput=z.object({expected:membershipConfig.nullable(),configuration:membershipConfig}).strict()
export const membershipPage=z.object({tab:z.enum(['memberships','checkouts','products']).default('memberships'),offset:z.coerce.number().int().min(0).max(100000).default(0),limit:z.coerce.number().int().min(1).max(50).default(12),q:z.string().trim().max(100).optional()}).strict()
export const identifier=(value:unknown)=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(value)
export function publicMembership(row:any,now=new Date()){
 const state=row.snapshot as Membership
 assertMembership(state)
 if(state.id!==row.id||state.terms.customer_id!==row.customer_id||state.status!==row.status||new Date(row.period_end).toISOString()!==state.period_end)throw new Error('MEMBERSHIP_STATE_MISMATCH')
 return {id:state.id,customer_id:state.terms.customer_id,product_id:state.terms.product_id,status:state.status,period_end:state.period_end,period_elapsed:Date.parse(state.period_end)<=now.getTime(),renew:state.renew,last_order_id:state.last_order_id,period_days:state.terms.period_days,version:state.terms.version}
}
/** Only expose required operational facts, never the full consent/payment snapshot. */
export function publicCheckout(row:any){return {id:row.id,cart_id:row.cart_id,customer_id:row.customer_id,status:row.status,order_id:row.order_id??null,membership_id:row.membership_id??null}}
export function sameConfig(a:unknown,b:unknown){const x=membershipConfig.safeParse(a),y=membershipConfig.safeParse(b);return a===null&&b===null||x.success&&y.success&&x.data.version===y.data.version&&x.data.period_days===y.data.period_days}

export function membershipAccessStatus(member:ReturnType<typeof publicMembership>,right:any,now=new Date()){
 if(!right)return 'pending'
 if(right.customer_id!==member.customer_id||right.product_id!==member.product_id||right.order_id!==member.last_order_id||right.source!=='order')throw new Error('MEMBERSHIP_ACCESS_OWNER_MISMATCH')
 if(right.status==='revoked')return 'revoked'
 if(right.status!=='active'||!right.expires_at)return 'needs_review'
 const end=new Date(right.expires_at).getTime()
 if(!Number.isFinite(end)||end>Date.parse(member.period_end))return 'needs_review'
 return end<=now.getTime()?'expired':'active'
}
