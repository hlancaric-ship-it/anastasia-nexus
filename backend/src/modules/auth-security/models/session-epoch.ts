import { model } from "@medusajs/framework/utils"

const AuthSessionEpoch = model.define("auth_session_epoch", {
  id: model.id({ prefix: "ase" }).primaryKey(),
  actor_type: model.enum(["customer", "user"]),
  actor_id: model.text(),
  epoch: model.number(),
}).indexes([{ on: ["actor_type", "actor_id"], unique: true }])

export default AuthSessionEpoch
