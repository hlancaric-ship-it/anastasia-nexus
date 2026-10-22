import { randomBytes, randomUUID } from "node:crypto"
import { InjectTransactionManager, MedusaContext, MedusaService } from "@medusajs/framework/utils"
import type { Context } from "@medusajs/framework/types"
import NewsletterConsentEvent from "./models/newsletter-consent-event"
import LegalConsent from "./models/legal-consent"
import NewsletterConsent from "./models/newsletter-consent"
import LegalWithdrawal from "./models/legal-withdrawal"
import LegalContractWithdrawal from "./models/legal-contract-withdrawal"
import { assertContractWithdrawalTransition, assertTransition, LegalError, tokenHash } from "./policy"
class LegalModuleService extends MedusaService({ NewsletterConsentEvent, LegalConsent, NewsletterConsent, LegalWithdrawal, LegalContractWithdrawal }) {
  protected db(context: Context) {
    const db = (context.transactionManager as any)?.getTransactionContext?.()
    if (!db) throw new Error("LEGAL_TRANSACTION_REQUIRED")
    return db
  }
  protected async lock(db: any, key: string) {
    await db.raw("SET LOCAL lock_timeout = '5s'")
    await db.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [`legal:${key}`])
  }
  @InjectTransactionManager()
  async accept(input: { cart_id: string; customer_id: string | null; terms_version: string; privacy_version: string }, @MedusaContext() context: Context = {}) {
    const db = this.db(context); await this.lock(db, input.cart_id)
    const old = await db("legal_consent").where({cart_id: input.cart_id}).whereNull("deleted_at").first()
    if (old && old.customer_id === input.customer_id && old.terms_version === input.terms_version && old.privacy_version === input.privacy_version) return old
    if (old?.order_id) throw new LegalError("CART_COMPLETED",409)
    const data = {...input, accepted_at: new Date(), updated_at: new Date()}
    const [row] = old ? await db("legal_consent").where({id:old.id}).update(data).returning("*") : await db("legal_consent").insert({id:`lgl_${randomUUID()}`, ...data}).returning("*")
    return row
  }
  @InjectTransactionManager()
  async subscribe(input: { email: string; source: string; text_version: string }, @MedusaContext() context: Context = {}) {
    const db = this.db(context); await this.lock(db, `newsletter:${tokenHash(input.email)}`)
    const old = await db("newsletter_consent").where({email:input.email}).whereNull("deleted_at").first()
    if (old?.status === "subscribed" && old.text_version === input.text_version) return { accepted: true }
    const token = old?.status === "subscribed" ? null : randomBytes(32).toString("base64url")
    const data = {...input,status:"subscribed",token_hash:token ? tokenHash(token) : old.token_hash,consented_at:new Date(),unsubscribed_at:null,updated_at:new Date()}
    const id = old?.id ?? `lgl_${randomUUID()}`
    if (old) await db("newsletter_consent").where({id}).update(data)
    else await db("newsletter_consent").insert({id, ...data})
    await db("newsletter_consent_event").insert({id:`nce_${randomUUID()}`,consent_id:id,status:data.status,source:data.source,text_version:data.text_version,occurred_at:data.consented_at})
    return { accepted: true, ...(token ? {unsubscribe_token: token} : {}) }
  }
  @InjectTransactionManager()
  async unsubscribe(token: string, @MedusaContext() context: Context = {}) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new LegalError("INVALID_UNSUBSCRIBE_TOKEN",404)
    const db = this.db(context)
    const row = await db("newsletter_consent").where({token_hash:tokenHash(token)}).whereNull("deleted_at").forUpdate().first()
    if (!row) throw new LegalError("INVALID_UNSUBSCRIBE_TOKEN",404)
    if (row.status !== "unsubscribed") {
      await db("newsletter_consent").where({id:row.id}).update({status:"unsubscribed",unsubscribed_at:new Date(),updated_at:new Date()})
      await db("newsletter_consent_event").insert({id:`nce_${randomUUID()}`,consent_id:row.id,status:"unsubscribed",source:row.source,text_version:row.text_version,occurred_at:new Date()})
    }
    return { unsubscribed:true }
  }
  /**
   * Odhlásenie podpísaným odkazom z kampane: v DB je uložený len `token_hash`, kampaň preto
   * podpisuje `consent_id` (HMAC) a odhlásenie ide cez ten istý zápis stavu a eventu.
   */
  @InjectTransactionManager()
  async unsubscribeConsent(consentId: string, @MedusaContext() context: Context = {}) {
    if (typeof consentId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(consentId)) throw new LegalError("INVALID_UNSUBSCRIBE_LINK", 404)
    const db = this.db(context)
    const row = await db("newsletter_consent").where({id:consentId}).whereNull("deleted_at").forUpdate().first()
    if (!row) throw new LegalError("INVALID_UNSUBSCRIBE_LINK", 404)
    if (row.status !== "unsubscribed") {
      await db("newsletter_consent").where({id:row.id}).update({status:"unsubscribed",unsubscribed_at:new Date(),updated_at:new Date()})
      await db("newsletter_consent_event").insert({id:`nce_${randomUUID()}`,consent_id:row.id,status:"unsubscribed",source:row.source,text_version:row.text_version,occurred_at:new Date()})
    }
    return { unsubscribed: true }
  }
  @InjectTransactionManager()
  async requestWithdrawal(input: {order_id:string;customer_id:string;items:any;reason:string|null}, @MedusaContext() context: Context = {}) {
    const db=this.db(context); await this.lock(db, `withdrawal:${input.order_id}`)
    const old=await db("legal_withdrawal").where({order_id:input.order_id}).whereNull("deleted_at").first()
    if(old) {
      if(old.customer_id!==input.customer_id) throw new LegalError("ORDER_NOT_FOUND",404)
      if(JSON.stringify(old.items)!==JSON.stringify(input.items)) throw new LegalError("WITHDRAWAL_ALREADY_EXISTS",409)
      return {row:old,replayed:true}
    }
    const [row]=await db("legal_withdrawal").insert({id:`lgl_${randomUUID()}`,...input,items:JSON.stringify(input.items),status:"received"}).returning("*")
    return {row,replayed:false}
  }
  @InjectTransactionManager()
  async transition(id:string,status:unknown,actor:string,@MedusaContext() context:Context={}) {
    const db=this.db(context)
    const old=await db("legal_withdrawal").where({id}).whereNull("deleted_at").forUpdate().first()
    if(!old) throw new LegalError("WITHDRAWAL_NOT_FOUND",404)
    assertTransition(old.status,status)
    if(old.status===status) return {row:old,before:old.status,replayed:true}
    const [row]=await db("legal_withdrawal").where({id}).update({status,changed_by:actor,updated_at:new Date()}).returning("*")
    return {row,before:old.status,replayed:false}
  }
  /** Online odstúpenie od zmluvy (časť C): rovnaké oznámenie nevytvorí druhý záznam. */
  @InjectTransactionManager()
  async requestContractWithdrawal(input: {order_number:string;email:string;items:string[];order_date:string|null;customer_id:string|null;name:string|null;reason:string|null;fingerprint:string}, @MedusaContext() context:Context={}) {
    const db=this.db(context); await this.lock(db, `contract-withdrawal:${input.fingerprint}`)
    const old=await db("legal_contract_withdrawal").where({fingerprint:input.fingerprint}).whereNull("deleted_at").first()
    if(old) return {row:old,replayed:true}
    const [row]=await db("legal_contract_withdrawal").insert({id:`lcw_${randomUUID()}`,...input,items:JSON.stringify(input.items),status:"received",source:"web",received_at:new Date()}).returning("*")
    return {row,replayed:false}
  }
  @InjectTransactionManager()
  async transitionContractWithdrawal(id:string,status:unknown,actor:string,@MedusaContext() context:Context={}) {
    const db=this.db(context)
    const old=await db("legal_contract_withdrawal").where({id}).whereNull("deleted_at").forUpdate().first()
    if(!old) throw new LegalError("CONTRACT_WITHDRAWAL_NOT_FOUND",404)
    assertContractWithdrawalTransition(old.status,status)
    if(old.status===status) return {row:old,before:old.status,replayed:true}
    const [row]=await db("legal_contract_withdrawal").where({id}).update({status,changed_by:actor,updated_at:new Date()}).returning("*")
    return {row,before:old.status,replayed:false}
  }
}
export default LegalModuleService
