import { model } from "@medusajs/framework/utils"
export default model.define("newsletter_consent_event", {
 id:model.id({prefix:"nce"}).primaryKey(), consent_id:model.text(),
 status:model.enum(["subscribed","unsubscribed"]),source:model.text(),text_version:model.text(),occurred_at:model.dateTime(),
})
