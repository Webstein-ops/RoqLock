export function usdcToMinor(value) {
    if (!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,6})?$/.test(value) || Number(value) <= 0) {
        throw new RangeError("USDC amount must be positive and have at most six decimal places");
    }
    const [whole, fraction = ""] = value.split(".");
    return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"));
}
export function minorToUsdc(value) {
    const whole = value / 1000000n;
    const fraction = (value % 1000000n).toString().padStart(6, "0").replace(/0+$/, "");
    return fraction ? `${whole}.${fraction}` : whole.toString();
}
export function externalAmountToMinor(value) {
    const amount = String(value);
    if (!/^(?:0|[1-9]\d{0,12})(?:\.\d{1,6})?$/.test(amount))
        return null;
    const [whole, fraction = ""] = amount.split(".");
    return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"));
}
