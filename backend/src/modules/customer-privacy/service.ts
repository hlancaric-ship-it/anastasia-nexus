import { randomUUID } from "node:crypto"
import { InjectTransactionManager,MedusaContext,MedusaService } from "@medusajs/framework/utils"
import type { Context } from "@medusajs/framework/types"
import CustomerErasure from "./models/customer-erasure"
import CustomerNote from "./models/customer-note"
import { LegalError,tokenHash } from "../legal/policy"
import { verifiedCustomerEmails } from "./identity"
import { anonymizeCustomer } from "./erase"
import { noteBody } from "./policy"
class CustomerPrivacyModuleService extends MedusaService({CustomerErasure,CustomerNote}) {
 protected db(context:Context){const db=(context.transactionManager as any)?.getTransactionContext?.();if(!db)throw new Error("PRIVACY_TRANSACTION_REQUIRED");return db}
 protected async lock(db:any,id:string){await db.raw("SET LOCAL lock_timeout = '5s'");await db.raw("SELECT pg_advisory_xact_lock(hashtext(?))",[`privacy:${id}`])}
 @InjectTransactionManager()
 async requestErasure(customerId:string,@MedusaContext() context:Context={}) {
  const db=this.db(context);await this.lock(db,customerId)
  const customer=await db("customer").where({id:customerId}).whereNull("deleted_at").first("id")
  if(!customer)throw new LegalError("CUSTOMER_NOT_FOUND",404)
  const old=await db("customer_erasure").where({customer_id:customerId}).whereNull("deleted_at").first()
  if(old)return old
  const [row]=await db("customer_erasure").insert({id:`erase_${randomUUID()}`,customer_id:customerId,status:"requested"}).returning("*")
  return row
 }
 @InjectTransactionManager()
 async prepareErasure(id:string,actor:string,@MedusaContext() context:Context={}) {
  const db=this.db(context)
  const row=await db("customer_erasure").where({id}).whereNull("deleted_at").forUpdate().first()
  if(!row)throw new LegalError("ERASURE_NOT_FOUND",404)
  if(row.status==="completed")return {row,emails:[],replayed:true}
  const customer=await db("customer").where({id:row.customer_id}).forUpdate().first()
  if(!customer)throw new LegalError("CUSTOMER_NOT_FOUND",404)
  const emails=await verifiedCustomerEmails(db,row.customer_id)
  const [next]=await db("customer_erasure").where({id}).update({status:"processing",email_hash:emails[0]?tokenHash(emails[0]):null,email_hashes:JSON.stringify(emails.map(tokenHash)),blocked_until:new Date(Date.now()+900000),confirmed_by:actor,updated_at:new Date()}).returning("*")
  return {row:next,emails,replayed:false}
 }
 @InjectTransactionManager()
 async completeErasure(id:string,@MedusaContext() context:Context={}) {
  const db=this.db(context),row=await db("customer_erasure").where({id}).whereNull("deleted_at").forUpdate().first()
  if(!row)throw new LegalError("ERASURE_NOT_FOUND",404)
  if(row.status==="completed")return {row,replayed:true}
  if(row.status!=="processing")throw new LegalError("ERASURE_NOT_PREPARED",409)
  await this.lock(db,row.customer_id)
  const customer=await db("customer").where({id:row.customer_id}).forUpdate().first()
  await anonymizeCustomer(db,customer)
  const [next]=await db("customer_erasure").where({id}).update({status:"completed",completed_at:new Date(),updated_at:new Date()}).returning("*")
  return {row:next,replayed:false}
 }
 @InjectTransactionManager()
 async writeNote(customerId:string,noteId:string|null,body:unknown,actor:string,remove=false,@MedusaContext() context:Context={}) {
  const db=this.db(context);await this.lock(db,customerId)
  const customer=await db("customer").where({id:customerId}).whereNull("deleted_at").first("id")
  if(!customer)throw new LegalError("CUSTOMER_NOT_FOUND",404)
  const erased=await db("customer_erasure").where({customer_id:customerId}).whereIn("status",["processing","completed"]).first("id")
  if(erased)throw new LegalError("CUSTOMER_ERASED",409)
  const old=noteId?await db("customer_note").where({id:noteId,customer_id:customerId}).whereNull("deleted_at").forUpdate().first():null
  if(noteId&&!old)throw new LegalError("NOTE_NOT_FOUND",404)
  const now=new Date()
  if(remove){await db("customer_note").where({id:noteId}).update({body:"",deleted_at:now,changed_by:actor,updated_at:now});return {id:noteId}}
  const data={body:noteBody(body),changed_by:actor,updated_at:now}
  const [row]=old?await db("customer_note").where({id:noteId}).update(data).returning("*"):await db("customer_note").insert({id:`cnote_${randomUUID()}`,customer_id:customerId,created_by:actor,...data}).returning("*")
  return row
 }
}
export default CustomerPrivacyModuleService
