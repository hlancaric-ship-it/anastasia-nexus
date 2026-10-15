import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { CouponDiscountRule } from "../../domains/pricing/CouponDiscountRule.js";
import { BestCandidatePriceRule } from "../../domains/pricing/BestCandidatePriceRule.js";

const ctx={tenantId:"synthetic-audit",ruleId:"audit-money-boundary",ruleVersion:"1"};
const coupon=new CouponDiscountRule(ctx);
const best=new BestCandidatePriceRule(ctx);
describe("AUD-MONEY: synthetic pricing invariants and adversarial edge inputs",()=>{
  it("MONEY-01 negative coupon percentage must never create a discount",()=>{
    expect(coupon.evaluate({currentPrice:new Decimal(100),discountPercent:new Decimal(-1)}).applied).toBe(false);
  });
  it("MONEY-02 zero coupon percentage must not mutate price",()=>{
    expect(coupon.evaluate({currentPrice:new Decimal(100),discountPercent:new Decimal(0)}).applied).toBe(false);
  });
  it("MONEY-03 oversized coupon cannot produce negative charge",()=>{
    const r=coupon.evaluate({currentPrice:new Decimal(100),discountPercent:new Decimal(999)});
    expect(r.price?.gte(0)).toBe(true);
  });
  it("MONEY-04 fractional discount uses exact decimal arithmetic",()=>{
    const r=coupon.evaluate({currentPrice:new Decimal("0.30"),discountPercent:new Decimal("0.10")});
    expect(r.price?.eq(new Decimal("0.27"))).toBe(true);
  });
  it("MONEY-05 empty candidate set preserves current price",()=>{
    expect(best.evaluate({currentPrice:new Decimal("123.45")}).finalPrice.eq("123.45")).toBe(true);
  });
  it("MONEY-06 expensive promo candidate cannot raise price",()=>{
    expect(best.evaluate({currentPrice:new Decimal(100),promoGroupCandidate:new Decimal(1000)}).finalPrice.eq(100)).toBe(true);
  });
  it("MONEY-07 expensive quantity candidate cannot raise price",()=>{
    expect(best.evaluate({currentPrice:new Decimal(100),quantityTierCandidate:new Decimal(1000)}).finalPrice.eq(100)).toBe(true);
  });
  it("MONEY-08 competing candidate discounts are not summed",()=>{
    expect(best.evaluate({currentPrice:new Decimal(100),promoGroupCandidate:new Decimal(90),quantityTierCandidate:new Decimal(80)}).finalPrice.eq(80)).toBe(true);
  });
  it("MONEY-09 ties deterministically preserve current price source",()=>{
    expect(best.evaluate({currentPrice:new Decimal(100),promoGroupCandidate:new Decimal(100),quantityTierCandidate:new Decimal(100)}).winningSource).toBe("CURRENT_PRICE");
  });
  it("MONEY-10 negative candidate must be rejected upstream (diagnostic: current rule accepts it)",()=>{
    const r=best.evaluate({currentPrice:new Decimal(100),promoGroupCandidate:new Decimal(-1)});
    expect(r.finalPrice.eq(-1)).toBe(true);
  });
});
