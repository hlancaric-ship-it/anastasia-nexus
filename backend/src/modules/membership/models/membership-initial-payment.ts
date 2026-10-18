import { model } from '@medusajs/framework/utils'
export default model.define('membership_initial_payment', {
 id:model.id({prefix:'mip'}).primaryKey(),checkout_id:model.text(),collection_id:model.text(),session_id:model.text().nullable(),
 status:model.enum(['requested','ready','unknown']),
}).indexes([{on:['checkout_id'],unique:true},{on:['session_id'],unique:true}])
