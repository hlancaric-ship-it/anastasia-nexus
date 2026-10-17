import type {AuthenticatedMedusaRequest,MedusaResponse} from '@medusajs/framework/http'
import {membershipOffer} from '../../../../lib/membership/checkout'
import {actor,errorResponse,secure} from '../http'
export async function GET(req:AuthenticatedMedusaRequest,res:MedusaResponse){secure(res);const id=actor(req);if(!id)return res.status(401).json({error:'UNAUTHORIZED'})
 try{return res.json({offer:await membershipOffer(req.scope,String(req.query.cart_id??''),id)})}catch(e){return errorResponse(res,e)}
}
