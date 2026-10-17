import type {AuthenticatedMedusaRequest,MedusaResponse} from '@medusajs/framework/http'
import {resumeMembershipPayment} from '../../../../../lib/membership/billing'
import {actor,errorResponse,secure} from '../../http'
export async function GET(req:AuthenticatedMedusaRequest,res:MedusaResponse){secure(res);const id=actor(req);if(!id)return res.status(401).json({error:'UNAUTHORIZED'})
 try{return res.json(await resumeMembershipPayment(req.scope,req.params.id,id))}catch(e){return errorResponse(res,e)}
}
