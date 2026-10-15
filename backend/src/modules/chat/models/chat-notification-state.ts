import { model } from "@medusajs/framework/utils"

/** Stav rozesílání (např. `admin_digest`): kdy naposledy odešel souhrnný e-mail Lucii (max 1×/h). */
const ChatNotificationState = model
  .define("chat_notification_state", {
    id: model.id({ prefix: "chntf" }).primaryKey(),
    key: model.text(),
    last_sent_at: model.dateTime().nullable(),
  })
  .indexes([{ on: ["key"], unique: true, where: "deleted_at IS NULL" }])

export default ChatNotificationState
