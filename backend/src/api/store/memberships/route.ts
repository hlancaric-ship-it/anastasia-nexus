import type {AuthenticatedMedusaRequest,MedusaResponse} from '@medusajs/framework/http'
import {MEMBERSHIP_MODULE} from '../../../modules/membership'
import type MembershipModuleService from '../../../modules/membership/service'
import {actor,errorResponse,secure} from './http'
export async function GET(req:AuthenticatedMedusaRequest,res:MedusaResponse){secure(res);const id=actor(req);if(!id)return res.status(401).json({error:'UNAUTHORIZED'})
 try{const offset=Number(req.query.offset??0);if(!Number.isSafeInteger(offset)||offset<0||offset>100000)throw new Error('INVALID_OFFSET')
 const [rows,count]=await req.scope.resolve<MembershipModuleService>(MEMBERSHIP_MODULE).listAndCountMemberships({customer_id:id},{take:20,skip:offset,order:{created_at:'DESC'}})
 return res.json({memberships:rows.map(r=>({id:r.id,status:r.status,period_end:r.period_end,renew:(r.snapshot as any).renew,product_id:(r.snapshot as any).terms.product_id,variant_id:(r.snapshot as any).terms.variant_id})),count,offset,limit:20})}catch(e){return errorResponse(res,e)}
}
