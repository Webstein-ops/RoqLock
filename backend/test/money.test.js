import assert from "node:assert/strict";
import test from "node:test";
import { externalAmountToMinor, minorToUsdc, usdcToMinor } from "../src/domain/money.js";
test("USDC input converts exactly to six decimal base units", () => {
    assert.equal(usdcToMinor("1"), 1000000n);
    assert.equal(usdcToMinor("0.000001"), 1n);
    assert.equal(usdcToMinor("120.500001"), 120500001n);
    assert.equal(minorToUsdc(120500000n), "120.5");
});
test("USDC rejects zero, excess precision, and malformed strings", () => {
    for (const amount of ["0", "-1", "1.0000001", "1e6", "01.00", "NaN"]) {
        assert.throws(() => usdcToMinor(amount), RangeError);
    }
});
test("Roqqu amount parsing never uses floating point", () => {
    assert.equal(externalAmountToMinor("0.3"), 300000n);
    assert.equal(externalAmountToMinor(12), 12000000n);
    assert.equal(externalAmountToMinor("0.0000001"), null);
});
