import { PUBLIC_ERROR_CODES, publicCodeError } from "../../../modules/gift-voucher/policy"

const MESSAGES: Record<string, string> = {
  GIFT_VOUCHER_INVALID: "Kód poukazu nie je platný.",
  GIFT_VOUCHER_EXPIRED: "Platnosť poukazu vypršala.",
  GIFT_VOUCHER_DEPLETED: "Poukaz je už vyčerpaný.",
  GIFT_VOUCHER_NOT_APPLICABLE: "Poukaz sa nedá použiť na produkty v košíku.",
  GIFT_VOUCHER_AMOUNT_CHANGED: "Košík sa zmenil. Prepočítajte košík a skúste to znova.",
  GIFT_VOUCHER_BALANCE_INSUFFICIENT: "Zostatok poukazu sa medzitým zmenil. Prepočítajte košík.",
  GIFT_VOUCHER_ALREADY_REDEEMED: "Poukaz už bol v tomto košíku použitý.",
  GIFT_VOUCHER_MULTIPLE: "V jednej objednávke je možné použiť len jeden poukaz.",
  GIFT_VOUCHER_RECIPIENT_REQUIRED: "Doplňte údaje obdarovaného ku každému poukazu.",
  GIFT_VOUCHER_RECIPIENT_INVALID: "Údaje obdarovaného nie sú platné.",
  GIFT_VOUCHER_RECIPIENT_NAME_INVALID: "Zadajte meno obdarovaného (najviac 120 znakov).",
  GIFT_VOUCHER_RECIPIENT_EMAIL_INVALID: "Zadajte platný e-mail obdarovaného.",
  GIFT_VOUCHER_MESSAGE_INVALID: "Venovanie môže mať najviac 300 znakov.",
  GIFT_VOUCHER_DELIVERY_DATE_INVALID: "Dátum doručenia musí byť dnes alebo neskôr, v rámci platnosti poukazu.",
  GIFT_VOUCHER_RECIPIENT_COUNT_MISMATCH: "Počet obdarovaných nezodpovedá počtu poukazov v košíku.",
  GIFT_VOUCHER_DISABLED: "Predaj darčekových poukazov je momentálne vypnutý.",
  GIFT_VOUCHER_PRODUCT_INVALID: "Hodnota poukazu v košíku nie je platná. Odstráňte ho a pridajte znova.",
  GIFT_VOUCHER_CART_INVALID: "Košík nie je možné spracovať.",
  GIFT_VOUCHER_CART_COMPLETED: "Objednávka z tohto košíka je už dokončená.",
}

const CONFLICT = new Set([
  "GIFT_VOUCHER_AMOUNT_CHANGED", "GIFT_VOUCHER_BALANCE_INSUFFICIENT", "GIFT_VOUCHER_ALREADY_REDEEMED", "GIFT_VOUCHER_CART_COMPLETED",
])

/**
 * Převod kódu chyby poukazu na HTTP odpověď. Hledá jen přesnou shodu (Medusa serializuje
 * chyby z hooků bez prototypu). Neznámá chyba = null, řeší ji volající.
 */
export function giftVoucherHttpError(code: unknown): { status: number; body: { ok: false; error: string; message: string } } | null {
  if (typeof code !== "string" || !PUBLIC_ERROR_CODES.has(code)) return null
  const error = publicCodeError(code)
  return { status: CONFLICT.has(error) ? 409 : 400, body: { ok: false, error, message: MESSAGES[error] ?? "Poukaz nie je možné použiť." } }
}
