import type {AuthenticatedMedusaRequest,MedusaResponse} from '@medusajs/framework/http'
import {prepareMembershipCheckout} from '../../../../lib/membership/checkout'
import {actor,errorResponse,secure} from '../http'
export async function POST(req:AuthenticatedMedusaRequest,res:MedusaResponse){secure(res);const id=actor(req);if(!id)return res.status(401).json({error:'UNAUTHORIZED'})
 try{const body=req.body as any;if(!body||Object.keys(body).some(k=>!['cart_id','version','amount_minor','auto_renew'].includes(k)))throw new Error('INVALID_MEMBERSHIP_CHECKOUT')
 const checkout=await prepareMembershipCheckout(req.scope,body.cart_id,id,{version:body.version,amount_minor:body.amount_minor,auto_renew:body.auto_renew})
 return res.json({checkout:{id:checkout.id,cart_id:checkout.contract.cart_id,status:checkout.status,terms:checkout.contract.terms,auto_renew:checkout.contract.consent.auto_renew}})}catch(e){return errorResponse(res,e)}
}
