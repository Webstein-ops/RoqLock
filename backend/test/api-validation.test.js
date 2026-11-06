import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const directory = await mkdtemp(join(tmpdir(), "roqlock-api-validation-"));
process.env.NODE_ENV = "test";
process.env.VERCEL = "1";
process.env.JWT_SECRET = "api-validation-test-secret-at-least-thirty-two-characters";
process.env.DATA_FILE = join(directory, "state.json");
process.env.PAYMENT_SIMULATOR_ENABLED = "true";

const [{ app }, { store }] = await Promise.all([
    import("../src/server.js"),
    import("../src/db.js"),
]);

after(async () => {
    await app.close();
    await store.$disconnect();
    await rm(directory, { recursive: true, force: true });
});

test("invalid deal fields return a validation response instead of an internal server error", async () => {
    const seller = await store.user.create({
        data: { email: "validation-seller@example.test", passwordHash: "test", displayName: "Validation Seller" },
    });
    const token = app.jwt.sign({ sub: seller.id, role: seller.role });
    const response = await app.inject({
        method: "POST",
        url: "/api/deals",
        headers: { authorization: `Bearer ${token}` },
        payload: {
            title: "Test deal",
            description: "Testing input validation",
            amountUsdc: "1",
            sellerWalletAddress: "0x0000000000000000000000000000000000000002",
            buyerWalletAddress: "not-an-address",
        },
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), {
        error: "Invalid request",
        details: [{ path: ["buyerWalletAddress"], message: "Invalid EVM address" }],
    });
});

test("deal creation accepts a valid buyer wallet address with surrounding whitespace", async () => {
    const seller = await store.user.create({
        data: {
            email: "validation-wallet-seller@example.test",
            passwordHash: "test",
            displayName: "Validation Seller",
            walletAddress: "0x0000000000000000000000000000000000000002",
        },
    });
    const token = app.jwt.sign({ sub: seller.id, role: seller.role });
    const buyerWalletAddress = "0x0000000000000000000000000000000000000001";
    const response = await app.inject({
        method: "POST",
        url: "/api/deals",
        headers: { authorization: "Bearer " + token },
        payload: {
            title: "Test deal",
            description: "Testing buyer wallet normalization",
            amountUsdc: "1",
            sellerWalletAddress: seller.walletAddress,
            buyerWalletAddress: ` ${buyerWalletAddress} `,
        },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.json().deal.buyerWalletAddress, buyerWalletAddress);
});

test("invalid login email returns a validation response instead of an internal server error", async () => {
    const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "not-an-email", password: "not-a-real-password" },
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), {
        error: "Invalid request",
        details: [{ path: ["email"], message: "Invalid email address" }],
    });
});
