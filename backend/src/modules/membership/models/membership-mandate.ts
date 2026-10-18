import { model } from '@medusajs/framework/utils'
export default model.define('membership_mandate', {
 id:model.id({prefix:'mmd'}).primaryKey(), membership_id:model.text(), customer_id:model.text(), checkout_id:model.text(),
 provider_id:model.text(), account_holder_id:model.text(), provider_customer_id:model.text(), payment_method_id:model.text(), payment_id:model.text(),
}).indexes([{on:['membership_id'],unique:true},{on:['customer_id']}])
