import type {AuthenticatedMedusaRequest,MedusaResponse} from '@medusajs/framework/http'
import {MEMBERSHIP_MODULE} from '../../../../../modules/membership'
import type MembershipModuleService from '../../../../../modules/membership/service'
import {actor,errorResponse,secure} from '../../http'
export async function POST(req:AuthenticatedMedusaRequest,res:MedusaResponse){secure(res);const id=actor(req);if(!id)return res.status(401).json({error:'UNAUTHORIZED'})
 try{const service=req.scope.resolve<MembershipModuleService>(MEMBERSHIP_MODULE);if(!await service.findForCustomer(req.params.id,id))throw new Error('MEMBERSHIP_NOT_FOUND')
 const state=await service.stop(req.params.id);return res.json({membership:{id:state.id,renew:state.renew,period_end:state.period_end,status:state.status},message:'Ďalšie obnovovanie je vypnuté. Už prebiehajúcu platbu môže byť potrebné ešte overiť.'})}catch(e){return errorResponse(res,e)}
}
