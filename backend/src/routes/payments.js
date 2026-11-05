import { createHash } from "node:crypto";
import { z } from "zod";
import { store } from "../db.js";
import { roqquRequest, RoqquApiError } from "../services/roqqu.js";
import { externalAmountToMinor } from "../domain/money.js";
import { minorToUsdc } from "../domain/money.js";
import { env } from "../config.js";
const publicParams = z.object({ token: z.string().length(64).regex(/^[a-f0-9]+$/) });
const txParams = publicParams.extend({ hash: z.string().regex(/^(?:0x)?[a-f\d]{64}$/i, "Transaction hash must be 32-byte hexadecimal") });
export async function paymentRoutes(app) {
    const simulatorEnabled = () => (env.VERCEL_ENV ? env.VERCEL_ENV !== "production" : env.NODE_ENV !== "production") && env.PAYMENT_SIMULATOR_ENABLED;
    const simulationUnavailable = (reply) => reply.code(404).send({ error: "Local payment simulation is disabled" });
    async function simulatorDeal(token) {
        return store.deal.findUnique({ where: { publicTokenHash: createHash("sha256").update(token).digest("hex") } });
    }
    function simulationResponse(payment, deal) {
        return {
            payment: { id: payment.id, status: payment.status, amountUsdc: minorToUsdc(payment.expectedAmount), currency: payment.asset, createdAt: payment.createdAt },
            simulated: true,
            escrowFunded: false,
            dealStatus: deal.status,
            message: "Simulation only. No money moved and no on-chain escrow was funded.",
        };
    }
    app.post("/public/:token/simulator", async (request, reply) => {
        if (!simulatorEnabled()) return simulationUnavailable(reply);
        const { token } = publicParams.parse(request.params);
        const deal = await simulatorDeal(token);
        if (!deal) return reply.code(404).send({ error: "Deal not found" });
        if (deal.status !== "CREATED") return reply.code(409).send({ error: "A simulation session can only be started for a new deal" });
        const payment = await store.payment.create({ data: { dealId: deal.id, provider: "LOCAL_SIMULATOR", asset: "USDC", chainId: deal.chainId, expectedAmount: deal.amountMinor, status: "SIMULATED_PENDING" } });
        return reply.code(201).send({ ...simulationResponse(payment, deal), actions: { complete: `/api/payments/public/${token}/simulator/${payment.id}/complete`, fail: `/api/payments/public/${token}/simulator/${payment.id}/fail`, status: `/api/payments/public/${token}/simulator/${payment.id}` } });
    });
    app.get("/public/:token/simulator/:paymentId", async (request, reply) => {
        if (!simulatorEnabled()) return simulationUnavailable(reply);
        const { token, paymentId } = z.object({ token: publicParams.shape.token, paymentId: z.uuid() }).parse(request.params);
        const deal = await simulatorDeal(token);
        if (!deal) return reply.code(404).send({ error: "Deal not found" });
        const payment = await store.payment.findFirst({ where: { id: paymentId, dealId: deal.id, provider: "LOCAL_SIMULATOR" } });
        if (!payment) return reply.code(404).send({ error: "Simulation session not found" });
        return simulationResponse(payment, deal);
    });
    app.post("/public/:token/simulator/:paymentId/:result", async (request, reply) => {
        if (!simulatorEnabled()) return simulationUnavailable(reply);
        const { token, paymentId, result } = z.object({ token: publicParams.shape.token, paymentId: z.uuid(), result: z.enum(["complete", "fail"]) }).parse(request.params);
        const deal = await simulatorDeal(token);
        if (!deal) return reply.code(404).send({ error: "Deal not found" });
        const payment = await store.payment.findFirst({ where: { id: paymentId, dealId: deal.id, provider: "LOCAL_SIMULATOR" } });
        if (!payment) return reply.code(404).send({ error: "Simulation session not found" });
        if (payment.status !== "SIMULATED_PENDING") return reply.code(409).send({ error: "Simulation session is already final" });
        const updated = await store.payment.update({ where: { id: payment.id }, data: { status: result === "complete" ? "SIMULATED_PAID" : "SIMULATED_FAILED" } });
        if (result === "complete") await store.notification.create({ data: { userId: deal.sellerId, dealId: deal.id, type: "SIMULATED_PAYMENT", message: `Simulated payment recorded for deal ${deal.reference}` } });
        return simulationResponse(updated, deal);
    });
    app.get("/roqqu/supported-networks", async (_request, reply) => {
        try {
            const baseUrl = process.env.ROQQU_BASE_URL ?? "https://service.roqqu.com/v1";
            const result = await fetch(`${baseUrl.replace(/\/$/, "")}/payment-links/supported-networks`, { signal: AbortSignal.timeout(10_000) });
            if (!result.ok)
                return reply.code(502).send({ error: `Roqqu returned HTTP ${result.status}` });
            return await result.json();
        }
        catch {
            return reply.code(502).send({ error: "Could not load Roqqu supported payment networks" });
        }
    });
    app.get("/public/:token/roqqu/transactions/:hash", async (request, reply) => {
        const { token, hash } = txParams.parse(request.params);
        const deal = await store.deal.findUnique({ where: { publicTokenHash: createHash("sha256").update(token).digest("hex") }, include: { payments: true } });
        if (!deal)
            return reply.code(404).send({ error: "Deal not found" });
        try {
            const result = await roqquRequest(`/transaction/deposit/${encodeURIComponent(hash)}`);
            const record = result.data;
            if (!record)
                return reply.code(404).send({ error: "Roqqu has no transaction record for this hash" });
            const credited = String(record.status) === "1";
            const isBaseUsdc = record.network.toLowerCase() === "base" && record.token.toLowerCase() === "usdc";
            const chainMatches = record.network.toLowerCase() === "base-sepolia" || record.network.toLowerCase() === "base_sepolia";
            const amountMatches = externalAmountToMinor(record.value) === deal.amountMinor;
            const addressMatches = Boolean(deal.payments[0]?.receivingAddress && deal.payments[0].receivingAddress.toLowerCase() === record.address.toLowerCase());
            return {
                providerStatus: credited ? "CREDITED" : "PENDING",
                amountMatches,
                addressMatches,
                chainMatches,
                network: record.network,
                token: record.token,
                providerAddress: record.address,
                compatibleWithEscrow: false,
                reason: isBaseUsdc ? "Roqqu Base deposits are not Base Sepolia escrow funding; buyer must fund the Base Sepolia contract directly." : "This asset/network does not match the Base Sepolia USDC escrow.",
                escrowStatus: deal.status,
                fundsSecured: ["FUNDS_SECURED", "SHIPPED", "COMPLETED"].includes(deal.status),
            };
        }
        catch (error) {
            if (error instanceof RoqquApiError)
                return reply.code(error.statusCode).send({ error: error.message });
            return reply.code(502).send({ error: "Could not verify the Roqqu transaction" });
        }
    });
}
