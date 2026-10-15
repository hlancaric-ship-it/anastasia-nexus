import { model } from "@medusajs/framework/utils"
export const AuthLinkState = model.define("auth_link_state", {
  id: model.text().primaryKey(), token_hash: model.text(), expires_at: model.dateTime(),
})
export const AuthLinkRate = model.define("auth_link_rate", {
  id: model.text().primaryKey(), attempts: model.number(), expires_at: model.dateTime(),
})
