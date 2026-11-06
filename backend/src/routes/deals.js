import { createHash, randomBytes } from "node:crypto";
import { isAddress, keccak256, stringToHex } from "viem";
import { z } from "zod";
import { env } from "../config.js";
import { store } from "../db.js";
import { minorToUsdc, usdcToMinor } from "../domain/money.js";
import { canTransitionDeal } from "../domain/deal-state.js";
const addressSchema = z.string().trim().refine(isAddress, "Invalid EVM address");
const createSchema = z.object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(5000),
    amountUsdc: z.string().regex(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,6})?$/, "Use a positive USDC amount with at most 6 decimals").refine((value) => Number(value) > 0),
    sellerWalletAddress: addressSchema,
    buyerEmail: z.email().optional(),
    buyerWalletAddress: addressSchema.optional(),
    deliveryMethod: z.string().trim().max(160).optional(),
    expectedDeliveryAt: z.iso.datetime().optional(),
    conditions: z.string().trim().max(5000).optional(),
});
const updateSchema = createSchema.partial().omit({ amountUsdc: true, sellerWalletAddress: true });
const publicParamSchema = z.object({ token: z.string().length(64).regex(/^[a-f0-9]+$/) });
async function authenticate(request, reply) {
    try {
        await request.jwtVerify();
    }
    catch {
        return reply.code(401).send({ error: "Authentication required" });
    }
}
async function notifyBestEffort(request, notifications) {
    try {
        if (notifications.length)
            await store.notification.createMany({ data: notifications });
    }
    catch (error) {
        request.log.warn({ err: error }, "Notification write failed after deal update");
    }
}
function toDealResponse(deal, publicView = false) {
    const response = { ...deal, amountUsdc: minorToUsdc(deal.amountMinor) };
    delete response.publicTokenHash;
    delete response.sellerId;
    delete response.amountMinor;
    if (publicView) {
        delete response.buyerEmail;
        delete response.buyerWalletAddress;
        delete response.buyerId;
        if (Array.isArray(response.deliveryUpdates)) {
            response.deliveryUpdates = response.deliveryUpdates.map(({ sellerId: _sellerId, ...update }) => update);
        }
    }
    return response;
}
export async function dealRoutes(app) {
    app.post("/", { preHandler: [authenticate] }, async (request, reply) => {
        if (request.user.role !== "SELLER")
            return reply.code(403).send({ error: "Seller account required" });
        const input = createSchema.parse(request.body);
        const seller = await store.user.findUnique({ where: { id: request.user.sub } });
        if (!seller?.walletAddress)
            return reply.code(409).send({ error: "Verify and link your seller wallet before creating a deal" });
        if (input.sellerWalletAddress.toLowerCase() !== seller.walletAddress.toLowerCase())
            return reply.code(422).send({ error: "Seller wallet must match your verified profile wallet" });
        const rawToken = randomBytes(32).toString("hex");
        const tokenHash = createHash("sha256").update(rawToken).digest("hex");
        const reference = `RL-${randomBytes(8).toString("hex").toUpperCase()}`;
        const escrowDealId = keccak256(stringToHex(reference));
        const deal = await store.$transaction(async (tx) => {
            const created = await tx.deal.create({ data: {
                    reference,
                    publicTokenHash: tokenHash,
                    sellerId: request.user.sub,
                    buyerEmail: input.buyerEmail,
                    buyerWalletAddress: input.buyerWalletAddress,
                    title: input.title,
                    description: input.description,
                    amountMinor: usdcToMinor(input.amountUsdc),
                    sellerWalletAddress: input.sellerWalletAddress,
                    deliveryMethod: input.deliveryMethod,
                    expectedDeliveryAt: input.expectedDeliveryAt ? new Date(input.expectedDeliveryAt) : undefined,
                    conditions: input.conditions,
                    escrowDealId,
                    statusHistory: { create: { toStatus: "CREATED", actorUserId: request.user.sub } },
                    payments: { create: { expectedAmount: usdcToMinor(input.amountUsdc), provider: "BASE_SEPOLIA", chainId: 84532, asset: "USDC" } },
                } });
            return created;
        });
        await notifyBestEffort(request, [{ userId: request.user.sub, dealId: deal.id, type: "DEAL_CREATED", message: `Deal ${deal.reference} created` }]);
        return reply.code(201).send({ deal: toDealResponse(deal), publicUrl: `${env.PUBLIC_APP_URL.replace(/\/$/, "")}/deal/${rawToken}` });
    });
    app.get("/", { preHandler: [authenticate] }, async (request) => {
        const deals = await store.deal.findMany({ where: { sellerId: request.user.sub }, include: { deliveryUpdates: { orderBy: { createdAt: "desc" }, take: 1 }, statusHistory: { orderBy: { createdAt: "desc" } } }, orderBy: { createdAt: "desc" } });
        return { deals: deals.map((deal) => toDealResponse(deal)) };
    });
    app.get("/buyer", { preHandler: [authenticate] }, async (request, reply) => {
        if (request.user.role !== "BUYER")
            return reply.code(403).send({ error: "Buyer account required" });
        const deals = await store.deal.findMany({ where: { buyerId: request.user.sub }, include: { seller: { select: { displayName: true } }, deliveryUpdates: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { createdAt: "desc" } });
        return { deals: deals.map((deal) => ({ ...toDealResponse(deal, true), seller: deal.seller })) };
    });
    app.get("/public/:token", async (request, reply) => {
        const { token } = publicParamSchema.parse(request.params);
        const tokenHash = createHash("sha256").update(token).digest("hex");
        const deal = await store.deal.findUnique({ where: { publicTokenHash: tokenHash }, include: { seller: { select: { displayName: true } }, deliveryUpdates: { orderBy: { createdAt: "desc" }, take: 1 } } });
        if (!deal)
            return reply.code(404).send({ error: "Deal not found" });
        return { deal: { ...toDealResponse(deal, true), seller: deal.seller } };
    });
    app.get("/:id", { preHandler: [authenticate] }, async (request, reply) => {
        const deal = await store.deal.findFirst({
            where: { id: request.params.id, sellerId: request.user.sub },
            include: { statusHistory: { orderBy: { createdAt: "asc" } }, deliveryUpdates: { orderBy: { createdAt: "desc" } }, dispute: { include: { evidence: true } } },
        });
        if (!deal)
            return reply.code(404).send({ error: "Deal not found" });
        return { deal: toDealResponse(deal) };
    });
    app.patch("/:id", { preHandler: [authenticate] }, async (request, reply) => {
        if (request.user.role !== "SELLER")
            return reply.code(403).send({ error: "Seller account required" });
        const id = request.params.id;
        const input = updateSchema.parse(request.body);
        const existing = await store.deal.findFirst({ where: { id, sellerId: request.user.sub } });
        if (!existing)
            return reply.code(404).send({ error: "Deal not found" });
        if (existing.status !== "CREATED")
            return reply.code(409).send({ error: "Deal terms cannot be changed after payment begins" });
        const deal = await store.deal.update({ where: { id }, data: {
                ...input,
                expectedDeliveryAt: input.expectedDeliveryAt ? new Date(input.expectedDeliveryAt) : undefined,
            } });
        return { deal: toDealResponse(deal) };
    });
    app.post("/:id/share-link", { preHandler: [authenticate] }, async (request, reply) => {
        const id = request.params.id;
        const deal = await store.deal.findFirst({ where: { id, sellerId: request.user.sub } });
        if (!deal)
            return reply.code(404).send({ error: "Deal not found" });
        const rawToken = randomBytes(32).toString("hex");
        await store.deal.update({ where: { id }, data: { publicTokenHash: createHash("sha256").update(rawToken).digest("hex") } });
        return { publicUrl: `${env.PUBLIC_APP_URL.replace(/\/$/, "")}/deal/${rawToken}` };
    });
    app.post("/:id/shipping", { preHandler: [authenticate] }, async (request, reply) => {
        if (request.user.role !== "SELLER")
            return reply.code(403).send({ error: "Seller account required" });
        const input = z.object({ trackingRef: z.string().trim().max(160).optional(), method: z.string().trim().max(160).optional(), note: z.string().trim().max(1000).optional() }).parse(request.body);
        const id = request.params.id;
        const deal = await store.deal.findFirst({ where: { id, sellerId: request.user.sub } });
        if (!deal)
            return reply.code(404).send({ error: "Deal not found" });
        if (!canTransitionDeal(deal.status, "SHIPPED"))
            return reply.code(409).send({ error: `Cannot ship a deal in ${deal.status} state` });
        const result = await store.$transaction(async (tx) => {
            const update = await tx.deliveryUpdate.create({ data: { dealId: deal.id, sellerId: request.user.sub, ...input } });
            const changed = await tx.deal.updateMany({ where: { id: deal.id, status: deal.status }, data: { status: "SHIPPED" } });
            if (!changed.count)
                throw Object.assign(new Error("Deal changed while shipping status was being saved"), { statusCode: 409 });
            if (deal.status !== "SHIPPED")
                await tx.dealStatusHistory.create({ data: { dealId: deal.id, fromStatus: deal.status, toStatus: "SHIPPED", actorUserId: request.user.sub, reason: "Seller marked the deal shipped" } });
            return update;
        });
        if (deal.buyerId)
            await notifyBestEffort(request, [{ userId: deal.buyerId, dealId: deal.id, type: "ORDER_SHIPPED", message: `Deal ${deal.reference} has shipped` }]);
        return reply.code(201).send({ deliveryUpdate: result, status: "SHIPPED" });
    });
}
