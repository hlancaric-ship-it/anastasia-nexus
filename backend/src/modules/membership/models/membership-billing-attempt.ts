import { model } from '@medusajs/framework/utils'
export default model.define('membership_billing_attempt', {
 id:model.id({prefix:'mba'}).primaryKey(), membership_id:model.text(), renewal_key:model.text(), cart_id:model.text().nullable(),
 stage:model.enum(['planned','cart_requested','cart_ready','payment_requested','payment_ready','completing','settled','needs_action','unknown','review']),
 collection_id:model.text().nullable(),session_id:model.text().nullable(),order_id:model.text().nullable(),snapshot:model.json(),
}).indexes([{on:['renewal_key'],unique:true},{on:['cart_id'],unique:true},{on:['membership_id','stage']}])
