import { model } from '@medusajs/framework/utils'
export default model.define('membership_checkout', {
 id:model.id({prefix:'mck'}).primaryKey(), cart_id:model.text(), customer_id:model.text(),
 status:model.enum(['prepared','settled']), order_id:model.text().nullable(), membership_id:model.text().nullable(),
 snapshot:model.json(),
}).indexes([{on:['cart_id'],unique:true},{on:['order_id'],unique:true},{on:['customer_id','status']}])
