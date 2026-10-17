import { validateTerms, type Terms, type Receipt } from './policy'
export type CheckoutContract = {
 cart_id: string; terms: Terms;
 consent: {version:string; auto_renew:boolean}; accepted_at:string;
}
export const membershipIdValid=(id:unknown):id is string=>typeof id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(id)
export function assertCheckoutContract(contract:CheckoutContract):void {
 if(!contract||!membershipIdValid(contract.cart_id)||!contract.terms)throw new Error('INVALID_MEMBERSHIP_CHECKOUT')
 validateTerms(contract.terms)
 if(!contract.consent||contract.consent.version!==contract.terms.version||typeof contract.consent.auto_renew!=='boolean')throw new Error('MEMBERSHIP_CONSENT_REQUIRED')
 if(typeof contract.accepted_at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(contract.accepted_at)||!Number.isFinite(Date.parse(contract.accepted_at))||new Date(contract.accepted_at).toISOString()!==contract.accepted_at)throw new Error('INVALID_MEMBERSHIP_ACCEPTANCE_TIME')
}
export function assertCheckoutReceipt(contract:CheckoutContract,receipt:Receipt):void {
 assertCheckoutContract(contract)
 if(receipt.checkout_key!==`initial:${receipt.order_id}`||receipt.customer_id!==contract.terms.customer_id||receipt.product_id!==contract.terms.product_id||receipt.variant_id!==contract.terms.variant_id)throw new Error('MEMBERSHIP_CHECKOUT_RECEIPT_MISMATCH')
 if(!Number.isFinite(Date.parse(receipt.paid_at))||Date.parse(receipt.paid_at)<Date.parse(contract.accepted_at))throw new Error('MEMBERSHIP_PAYMENT_BEFORE_CONSENT')
}
