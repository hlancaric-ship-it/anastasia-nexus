import type {AuthenticatedMedusaRequest,MedusaResponse} from '@medusajs/framework/http'
import {settleMembershipCheckout} from '../../../../../../lib/membership/checkout'
import {actor,errorResponse,secure} from '../../../http'
export async function POST(req:AuthenticatedMedusaRequest,res:MedusaResponse){secure(res);const id=actor(req);if(!id)return res.status(401).json({error:'UNAUTHORIZED'})
 try{return res.json(await settleMembershipCheckout(req.scope,req.params.id,id))}catch(e){return errorResponse(res,e)}
}
