import { model } from "@medusajs/framework/utils"
export default model.define("customer_erasure",{
 id:model.id({prefix:"erase"}).primaryKey(),customer_id:model.text(),status:model.enum(["requested","processing","completed"]).default("requested"),
 email_hash:model.text().nullable(),email_hashes:model.json().nullable(),blocked_until:model.dateTime().nullable(),confirmed_by:model.text().nullable(),completed_at:model.dateTime().nullable(),
}).indexes([{on:["customer_id"],unique:true,where:"deleted_at IS NULL"}])
