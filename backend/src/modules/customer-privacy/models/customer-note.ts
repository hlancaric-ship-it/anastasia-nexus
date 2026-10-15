import { model } from "@medusajs/framework/utils"
export default model.define("customer_note",{
 id:model.id({prefix:"cnote"}).primaryKey(),customer_id:model.text(),body:model.text(),created_by:model.text(),changed_by:model.text(),
}).indexes([{on:["customer_id"]}])
