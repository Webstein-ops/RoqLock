import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import test, { after } from "node:test";

const directory = await mkdtemp(join(tmpdir(), "roqlock-simulator-"));
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "simulator-test-secret-at-least-thirty-two-characters";
process.env.DATA_FILE = join(directory, "state.json");
process.env.PAYMENT_SIMULATOR_ENABLED = "true";
const [{ store }, { paymentRoutes }] = await Promise.all([
    import("../src/db.js"),
    import("../src/routes/payments.js"),
]);
const app = Fastify({ logger: false });
await app.register(paymentRoutes, { prefix: "/api/payments" });

after(async () => {
    await app.close();
    await store.$disconnect();
    await rm(directory, { recursive: true, force: true });
});

test("local checkout simulator completes and fails sessions without claiming escrow funding", async () => {
    const seller = await store.user.create({ data: { email: "sim-seller@example.test", passwordHash: "test", displayName: "Simulator Seller" } });
    const token = "a".repeat(64);
    const deal = await store.deal.create({ data: {
        sellerId: seller.id,
        reference: `SIM-${randomUUID()}`,
        publicTokenHash: createHash("sha256").update(token).digest("hex"),
        title: "Simulator test deal",
        description: "Test only",
        amountMinor: 12_345_678n,
        sellerWalletAddress: "0x1111111111111111111111111111111111111111",
        escrowDealId: `0x${"b".repeat(64)}`,
    } });

    const start = await app.inject({ method: "POST", url: `/api/payments/public/${token}/simulator` });
    assert.equal(start.statusCode, 201);
    const started = start.json();
    assert.equal(started.payment.status, "SIMULATED_PENDING");
    assert.equal(started.payment.amountUsdc, "12.345678");
    assert.equal(started.escrowFunded, false);

    const pending = await app.inject({ method: "GET", url: started.actions.status });
    assert.equal(pending.statusCode, 200);
    assert.equal(pending.json().payment.status, "SIMULATED_PENDING");

    const completed = await app.inject({ method: "POST", url: started.actions.complete });
    assert.equal(completed.statusCode, 200);
    assert.equal(completed.json().payment.status, "SIMULATED_PAID");
    assert.equal(completed.json().escrowFunded, false);
    assert.equal(completed.json().dealStatus, "CREATED");
    assert.equal((await store.deal.findUnique({ where: { id: deal.id } })).status, "CREATED");

    const duplicate = await app.inject({ method: "POST", url: started.actions.complete });
    assert.equal(duplicate.statusCode, 409);

    const failedSession = await app.inject({ method: "POST", url: `/api/payments/public/${token}/simulator` });
    const failed = await app.inject({ method: "POST", url: `${failedSession.json().actions.fail}` });
    assert.equal(failed.statusCode, 200);
    assert.equal(failed.json().payment.status, "SIMULATED_FAILED");
});
