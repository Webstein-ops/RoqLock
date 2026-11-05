import assert from "node:assert/strict";
import test from "node:test";
const DealStatus = Object.fromEntries(["CREATED","AWAITING_PAYMENT","PAYMENT_DETECTED","PAYMENT_VERIFIED","FUNDS_SECURED","AWAITING_FULFILMENT","SHIPPED","DISPUTED","COMPLETED","REFUNDED","FAILED","RESOLVED"].map((x) => [x, x]));
import { canTransitionDeal } from "../src/domain/deal-state.js";
test("permits the verified escrow lifecycle", () => {
    assert.equal(canTransitionDeal(DealStatus.CREATED, DealStatus.FUNDS_SECURED), true);
    assert.equal(canTransitionDeal(DealStatus.FUNDS_SECURED, DealStatus.SHIPPED), true);
    assert.equal(canTransitionDeal(DealStatus.SHIPPED, DealStatus.COMPLETED), true);
    assert.equal(canTransitionDeal(DealStatus.FUNDS_SECURED, DealStatus.COMPLETED), true);
    assert.equal(canTransitionDeal(DealStatus.DISPUTED, DealStatus.REFUNDED), true);
});
test("blocks shipping unpaid deals and any repeated terminal action", () => {
    assert.equal(canTransitionDeal(DealStatus.CREATED, DealStatus.SHIPPED), false);
    assert.equal(canTransitionDeal(DealStatus.COMPLETED, DealStatus.COMPLETED), false);
    assert.equal(canTransitionDeal(DealStatus.REFUNDED, DealStatus.COMPLETED), false);
    assert.equal(canTransitionDeal(DealStatus.DISPUTED, DealStatus.SHIPPED), false);
});
