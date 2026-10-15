import { model } from "@medusajs/framework/utils"
import { TRANSACTION_TYPES } from "../policy"

/** Neměnný pohyb na poukazu (audit). `idempotency_key` brání dvojímu zápisu téže operace. */
const GiftVoucherTransaction = model
  .define("gift_voucher_transaction", {
    id: model.id({ prefix: "gvtx" }).primaryKey(),
    voucher_id: model.text(),
    type: model.enum([...TRANSACTION_TYPES]),
    amount: model.number(),
    balance_after: model.number(),
    cart_id: model.text().nullable(),
    order_id: model.text().nullable(),
    reference_id: model.text().nullable(),
    reversed_at: model.dateTime().nullable(),
    idempotency_key: model.text(),
    actor_id: model.text().nullable(),
    note: model.text().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([
    { on: ["idempotency_key"], unique: true },
    { on: ["voucher_id", "type"] },
    { on: ["cart_id"] },
    { on: ["order_id"] },
  ])

export default GiftVoucherTransaction
