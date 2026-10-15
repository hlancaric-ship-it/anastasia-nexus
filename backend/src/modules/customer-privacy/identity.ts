import { normalizeEmail } from "../auth-magic-link/policy"
/** Profile email is editable. Only a successfully linked magic-link identity proves email ownership. */
export async function verifiedCustomerEmails(db:any,customerId:string):Promise<string[]> {
 const identities=await db("provider_identity as p").join("auth_identity as a","a.id","p.auth_identity_id")
  .where({"p.provider":"magic-link"}).whereRaw("a.app_metadata->>'customer_id' = ?",[customerId])
  .whereNull("p.deleted_at").whereNull("a.deleted_at").select("p.entity_id")
 return [...new Set(identities.map((row:any)=>normalizeEmail(row.entity_id)).filter((v:any):v is string=>!!v))] as string[]
}
