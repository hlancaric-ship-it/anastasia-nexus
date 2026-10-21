import { model } from "@medusajs/framework/utils"

/** Vratné zablokování chatu zákazník (jeden řádek na zákazníci, `blocked` se přepíná). */
const ChatCustomerBlock = model
  .define("chat_customer_block", {
    id: model.id({ prefix: "chblk" }).primaryKey(),
    customer_id: model.text(),
    blocked: model.boolean().default(true),
    reason: model.text().nullable(),
    changed_by: model.text().nullable(),
    changed_at: model.dateTime(),
  })
  .indexes([{ on: ["customer_id"], unique: true, where: "deleted_at IS NULL" }])

export default ChatCustomerBlock
