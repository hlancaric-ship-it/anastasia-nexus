import type {AuthenticatedMedusaRequest,MedusaResponse} from '@medusajs/framework/http'
import {createMembershipInitialPayment} from '../../../../../../lib/membership/initial-payment'
import {actor,errorResponse,secure} from '../../../http'
export async function POST(req:AuthenticatedMedusaRequest,res:MedusaResponse){secure(res);const id=actor(req);if(!id)return res.status(401).json({error:'UNAUTHORIZED'})
 try{return res.json(await createMembershipInitialPayment(req.scope,req.params.id,id))}catch(e){return errorResponse(res,e)}
}
