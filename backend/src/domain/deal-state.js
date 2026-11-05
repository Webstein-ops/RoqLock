const DealStatus = Object.fromEntries(["CREATED", "AWAITING_PAYMENT", "PAYMENT_DETECTED", "PAYMENT_VERIFIED", "FUNDS_SECURED", "AWAITING_FULFILMENT", "SHIPPED", "DISPUTED", "COMPLETED", "REFUNDED", "FAILED", "RESOLVED"].map((x) => [x, x]));
const transitions = {
    [DealStatus.CREATED]: [DealStatus.AWAITING_PAYMENT, DealStatus.FUNDS_SECURED, DealStatus.DISPUTED, DealStatus.COMPLETED, DealStatus.FAILED],
    [DealStatus.AWAITING_PAYMENT]: [DealStatus.PAYMENT_DETECTED, DealStatus.PAYMENT_VERIFIED, DealStatus.FUNDS_SECURED, DealStatus.FAILED],
    [DealStatus.PAYMENT_DETECTED]: [DealStatus.PAYMENT_VERIFIED, DealStatus.FUNDS_SECURED, DealStatus.FAILED],
    [DealStatus.PAYMENT_VERIFIED]: [DealStatus.FUNDS_SECURED, DealStatus.FAILED],
    [DealStatus.FUNDS_SECURED]: [DealStatus.AWAITING_FULFILMENT, DealStatus.SHIPPED, DealStatus.DISPUTED, DealStatus.COMPLETED],
    [DealStatus.AWAITING_FULFILMENT]: [DealStatus.SHIPPED, DealStatus.DISPUTED, DealStatus.COMPLETED],
    [DealStatus.SHIPPED]: [DealStatus.SHIPPED, DealStatus.DISPUTED, DealStatus.COMPLETED],
    [DealStatus.DISPUTED]: [DealStatus.COMPLETED, DealStatus.REFUNDED, DealStatus.RESOLVED],
    [DealStatus.COMPLETED]: [],
    [DealStatus.REFUNDED]: [],
    [DealStatus.FAILED]: [],
    [DealStatus.RESOLVED]: [],
};
export function canTransitionDeal(from, to) {
    return transitions[from].includes(to);
}
