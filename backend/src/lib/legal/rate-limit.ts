import { createHash } from "node:crypto"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
/** Atomic, shared across processes; only a pseudonymous subject hash is persisted. */
export async function claimLegalRate(db:any,key:string,limit:number,seconds:number) {
 const subject=createHash("sha256").update(key).digest("hex")
 const {rows}=await db.raw(`insert into legal_rate_limit (subject, attempts, expires_at) values (?,1,now()+ (? * interval '1 second'))
 on conflict (subject) do update set attempts=case when legal_rate_limit.expires_at<=now() then 1 else least(legal_rate_limit.attempts+1,?) end,
 expires_at=case when legal_rate_limit.expires_at<=now() then now()+(? * interval '1 second') else legal_rate_limit.expires_at end
 returning attempts, greatest(1,ceil(extract(epoch from (expires_at-now()))))::integer as retry_after`,[subject,seconds,limit+1,seconds])
 if(rows.length!==1) throw new Error("LEGAL_RATE_UNAVAILABLE")
 return {allowed:rows[0].attempts<=limit,retryAfter:rows[0].retry_after}
}
export function legalRate(bucket:string,limit=20,seconds=60,customer=false) {
 return async(req:any,res:any,next:any)=>{
  res.setHeader("Cache-Control","no-store")
  try {
   const id=customer?req.auth_context?.actor_id:req.ip || req.socket?.remoteAddress || "unknown-peer"
   if(!id) return res.status(401).json({error:"UNAUTHORIZED"})
   const result=await claimLegalRate(req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION),`${bucket}:${id}`,limit,seconds)
   if(result.allowed) return next()
   res.setHeader("Retry-After",String(result.retryAfter))
   return res.status(429).json({error:"RATE_LIMITED",message:"Príliš veľa požiadaviek. Skúste to neskôr."})
  }catch{return res.status(503).json({error:"LEGAL_UNAVAILABLE",message:"Služba je dočasne nedostupná."})}
 }
}
