import { model } from '@medusajs/framework/utils'
export default model.define('membership', {
  id: model.id({prefix:'mbr'}).primaryKey(),
  customer_id: model.text(),
  first_order_id: model.text(),
  status: model.enum(['active','renewing','unknown','needs_review']),
  period_end: model.dateTime(),
  snapshot: model.json(),
}).indexes([
  {on:['first_order_id'],unique:true},
  {on:['customer_id','period_end']},
  {on:['status','period_end']},
])
