import { model } from '@medusajs/framework/utils'
/** Keep the unique order claim even after soft deletion: a payment cannot buy two memberships. */
export default model.define('membership_receipt', {
  id: model.id({prefix:'mrc'}).primaryKey(),
  membership_id: model.text(),
  order_id: model.text(),
  checkout_key: model.text(),
}).indexes([{on:['order_id'],unique:true},{on:['membership_id','checkout_key'],unique:true}])
