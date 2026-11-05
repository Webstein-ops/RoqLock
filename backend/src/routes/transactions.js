import { createHash } from "node:crypto";
import { isHex } from "viem";
import { z } from "zod";
import { store } from "../db.js";
import { ChainVerificationError, getEscrowState, verifyContractEvent } from "../services/chain.js";
import { canTransitionDeal } from "../domain/deal-state.js";
const routeParams = z.object({ token: z.string().length(64).regex(/^[a-f0-9]+$/) });
const txSchema = z.object({ transactionHash: z.string().refine((value) => isHex(value, { strict: true }) && /^0x[a-f\d]{64}$/i.test(value), "Invalid transaction hash") });
async function authenticate(request, reply) {
    try {
        await request.jwtVerify();
    }
    catch {
        return reply.code(401).send({ error: "Authentication required" });
    }
}
async function findPublicDeal(token) {
    return store.deal.findUnique({ where: { publicTokenHash: createHash("sha256").update(token).digest("hex") } });
}
function sendVerificationError(reply, error) {
    if (error instanceof ChainVerificationError)
        return reply.code(error.statusCode).send({ error: error.message });
    if (error?.code === "P2002")
        return reply.code(409).send({ error: "This blockchain transaction was already recorded" });
    throw error;
}
async function notifyBestEffort(request, notifications) {
    try {
        if (notifications.length)
            await store.notification.createMany({ data: notifications });
    }
    catch (error) {
        request.log.warn({ err: error }, "Notification write failed after chain state update");
    }
}
export async function transactionRoutes(app) {
    app.post("/public/:token/funding/verify", async (request, reply) => {
        const { token } = routeParams.parse(request.params);
        const { transactionHash } = txSchema.parse(request.body);
        const deal = await findPublicDeal(token);
        if (!deal)
            return reply.code(404).send({ error: "Deal not found" });
        if (deal.status === "FUNDS_SECURED" && deal.escrowTxHash?.toLowerCase() === transactionHash.toLowerCase())
            return { status: deal.status, transactionHash };
        const prior = await store.blockchainTransaction.findUnique({ where: { hash: transactionHash } });
        if (prior)
            return prior.dealId === deal.id && prior.operation === "FUND" ? { status: deal.status, transactionHash, confirmations: prior.confirmations } : reply.code(409).send({ error: "Transaction hash is already attached to another operation" });
        if (!canTransitionDeal(deal.status, "FUNDS_SECURED"))
            return reply.code(409).send({ error: `Cannot fund a deal in ${deal.status} state` });
        try {
            const verified = await verifyContractEvent(transactionHash, "EscrowCreated", deal.escrowDealId);
            const args = verified.event.args;
            const buyer = String(args.buyer);
            const seller = String(args.seller);
            const amount = args.amount;
            if (seller.toLowerCase() !== deal.sellerWalletAddress.toLowerCase() || amount !== deal.amountMinor || (deal.buyerWalletAddress && buyer.toLowerCase() !== deal.buyerWalletAddress.toLowerCase())) {
                return reply.code(422).send({ error: "Escrow event does not match the agreed seller and amount" });
            }
            const escrow = await getEscrowState(deal.escrowDealId);
            if (escrow.status !== 1 || escrow.buyer.toLowerCase() !== buyer.toLowerCase() || escrow.seller.toLowerCase() !== seller.toLowerCase() || escrow.amount !== amount) {
                return reply.code(422).send({ error: "On-chain escrow state does not match its creation event" });
            }
            const buyerUser = await store.user.findFirst({ where: { role: "BUYER", walletAddress: { equals: buyer, mode: "insensitive" } } });
            await store.$transaction(async (tx) => {
                const changed = await tx.deal.updateMany({ where: { id: deal.id, status: deal.status }, data: {
                        status: "FUNDS_SECURED", escrowTxHash: transactionHash, buyerWalletAddress: buyer, buyerId: buyerUser?.id,
                    } });
                if (!changed.count)
                    throw new ChainVerificationError("Deal changed while the transaction was being verified", 409);
                await tx.blockchainTransaction.create({ data: {
                        dealId: deal.id, hash: transactionHash, chainId: 84532, operation: "FUND", status: "CONFIRMED",
                        fromAddress: buyer, toAddress: verified.receipt.to, blockNumber: verified.receipt.blockNumber,
                        confirmations: verified.confirmations, confirmedAt: new Date(),
                    } });
                await tx.payment.updateMany({ where: { dealId: deal.id }, data: { transactionHash, status: "VERIFIED" } });
                await tx.dealStatusHistory.create({ data: { dealId: deal.id, fromStatus: deal.status, toStatus: "FUNDS_SECURED", reason: "Confirmed EscrowCreated event and Funded contract state", txHash: transactionHash } });
            });
            await notifyBestEffort(request, [
                { userId: deal.sellerId, dealId: deal.id, type: "FUNDS_SECURED", message: `Funds for deal ${deal.reference} are secured on Base Sepolia` },
                ...(buyerUser ? [{ userId: buyerUser.id, dealId: deal.id, type: "FUNDS_SECURED", message: `Funds for deal ${deal.reference} are secured on Base Sepolia` }] : []),
            ]);
            return { status: "FUNDS_SECURED", transactionHash, confirmations: verified.confirmations, buyerWalletAddress: buyer };
        }
        catch (error) {
            return sendVerificationError(reply, error);
        }
    });
    app.post("/public/:token/release/verify", async (request, reply) => {
        const { token } = routeParams.parse(request.params);
        const { transactionHash } = txSchema.parse(request.body);
        const deal = await findPublicDeal(token);
        if (!deal)
            return reply.code(404).send({ error: "Deal not found" });
        const prior = await store.blockchainTransaction.findUnique({ where: { hash: transactionHash } });
        if (prior)
            return prior.dealId === deal.id && prior.operation === "RELEASE" ? { status: deal.status, transactionHash, confirmations: prior.confirmations } : reply.code(409).send({ error: "Transaction hash is already attached to another operation" });
        if (!canTransitionDeal(deal.status, "COMPLETED"))
            return reply.code(409).send({ error: `Cannot release a deal in ${deal.status} state` });
        try {
            const verified = await verifyContractEvent(transactionHash, "FundsReleased", deal.escrowDealId);
            const args = verified.event.args;
            if (String(args.seller).toLowerCase() !== deal.sellerWalletAddress.toLowerCase() || args.amount !== deal.amountMinor) {
                return reply.code(422).send({ error: "Release event does not match the agreed seller and amount" });
            }
            const escrow = await getEscrowState(deal.escrowDealId);
            if (escrow.status !== 3 || escrow.seller.toLowerCase() !== deal.sellerWalletAddress.toLowerCase() || escrow.amount !== deal.amountMinor)
                return reply.code(422).send({ error: "Contract does not show this deal's released funds" });
            const buyerUser = await store.user.findFirst({ where: { role: "BUYER", walletAddress: { equals: escrow.buyer, mode: "insensitive" } } });
            await store.$transaction(async (tx) => {
                const changed = await tx.deal.updateMany({ where: { id: deal.id, status: deal.status }, data: { status: "COMPLETED", buyerWalletAddress: escrow.buyer, buyerId: buyerUser?.id } });
                if (!changed.count)
                    throw new ChainVerificationError("Deal changed while the transaction was being verified", 409);
                await tx.blockchainTransaction.create({ data: { dealId: deal.id, hash: transactionHash, chainId: 84532, operation: "RELEASE", status: "CONFIRMED", fromAddress: verified.receipt.from, toAddress: verified.receipt.to, blockNumber: verified.receipt.blockNumber, confirmations: verified.confirmations, confirmedAt: new Date() } });
                await tx.payment.updateMany({ where: { dealId: deal.id }, data: { status: "VERIFIED" } });
                const reason = deal.status === "SHIPPED"
                    ? "Confirmed FundsReleased event and Released contract state"
                    : "Confirmed on-chain release before the backend had a shipped status; the deployed contract permits buyer release while funded";
                await tx.dealStatusHistory.create({ data: { dealId: deal.id, fromStatus: deal.status, toStatus: "COMPLETED", reason, txHash: transactionHash } });
            });
            await notifyBestEffort(request, [
                { userId: deal.sellerId, dealId: deal.id, type: "TRANSACTION_COMPLETED", message: `Deal ${deal.reference} has completed` },
                ...(buyerUser ? [{ userId: buyerUser.id, dealId: deal.id, type: "TRANSACTION_COMPLETED", message: `Deal ${deal.reference} has completed` }] : []),
            ]);
            return { status: "COMPLETED", transactionHash, confirmations: verified.confirmations };
        }
        catch (error) {
            return sendVerificationError(reply, error);
        }
    });
    app.post("/public/:token/disputes/verify", { preHandler: [authenticate] }, async (request, reply) => {
        const { token } = routeParams.parse(request.params);
        const { transactionHash } = txSchema.parse(request.body);
        const body = z.object({ description: z.string().trim().min(10).max(5000) }).parse(request.body);
        const deal = await findPublicDeal(token);
        if (!deal)
            return reply.code(404).send({ error: "Deal not found" });
        const prior = await store.blockchainTransaction.findUnique({ where: { hash: transactionHash } });
        if (prior)
            return prior.dealId === deal.id && prior.operation === "RAISE_DISPUTE" ? { status: deal.status, transactionHash, confirmations: prior.confirmations } : reply.code(409).send({ error: "Transaction hash is already attached to another operation" });
        if (!canTransitionDeal(deal.status, "DISPUTED"))
            return reply.code(409).send({ error: `Cannot dispute a deal in ${deal.status} state` });
        const actor = await store.user.findUnique({ where: { id: request.user.sub } });
        if (!actor?.walletAddress)
            return reply.code(403).send({ error: "Link and verify the wallet used to raise the dispute" });
        try {
            const verified = await verifyContractEvent(transactionHash, "DisputeRaised", deal.escrowDealId);
            const raisedBy = String(verified.event.args.raisedBy);
            if (actor.walletAddress.toLowerCase() !== raisedBy.toLowerCase())
                return reply.code(403).send({ error: "Signed-in wallet does not match the on-chain dispute raiser" });
            const escrow = await getEscrowState(deal.escrowDealId);
            if (escrow.status !== 2 || escrow.seller.toLowerCase() !== deal.sellerWalletAddress.toLowerCase() || escrow.amount !== deal.amountMinor || ![escrow.buyer, escrow.seller].some((address) => address.toLowerCase() === raisedBy.toLowerCase()))
                return reply.code(422).send({ error: "Contract does not show this deal disputed by a deal party" });
            const buyerUser = await store.user.findFirst({ where: { role: "BUYER", walletAddress: { equals: escrow.buyer, mode: "insensitive" } } });
            await store.$transaction(async (tx) => {
                const changed = await tx.deal.updateMany({ where: { id: deal.id, status: deal.status }, data: { status: "DISPUTED", buyerWalletAddress: escrow.buyer, buyerId: buyerUser?.id } });
                if (!changed.count)
                    throw new ChainVerificationError("Deal changed while the transaction was being verified", 409);
                await tx.dispute.create({ data: { dealId: deal.id, raisedBy, description: body.description } });
                await tx.blockchainTransaction.create({ data: { dealId: deal.id, hash: transactionHash, chainId: 84532, operation: "RAISE_DISPUTE", status: "CONFIRMED", fromAddress: raisedBy, toAddress: verified.receipt.to, blockNumber: verified.receipt.blockNumber, confirmations: verified.confirmations, confirmedAt: new Date() } });
                await tx.dealStatusHistory.create({ data: { dealId: deal.id, fromStatus: deal.status, toStatus: "DISPUTED", reason: "Confirmed DisputeRaised event and Disputed contract state", txHash: transactionHash } });
            });
            await notifyBestEffort(request, [
                { userId: deal.sellerId, dealId: deal.id, type: "DISPUTE_RAISED", message: `A dispute was raised for deal ${deal.reference}` },
                ...(buyerUser ? [{ userId: buyerUser.id, dealId: deal.id, type: "DISPUTE_RAISED", message: `A dispute was raised for deal ${deal.reference}` }] : []),
            ]);
            return { status: "DISPUTED", transactionHash, raisedBy, confirmations: verified.confirmations };
        }
        catch (error) {
            return sendVerificationError(reply, error);
        }
    });
    app.post("/public/:token/disputes/resolve/verify", async (request, reply) => {
        const { token } = routeParams.parse(request.params);
        const { transactionHash } = txSchema.parse(request.body);
        const deal = await findPublicDeal(token);
        if (!deal)
            return reply.code(404).send({ error: "Deal not found" });
        const prior = await store.blockchainTransaction.findUnique({ where: { hash: transactionHash } });
        if (prior)
            return prior.dealId === deal.id && prior.operation === "RESOLVE_DISPUTE" ? { status: deal.status, transactionHash, confirmations: prior.confirmations } : reply.code(409).send({ error: "Transaction hash is already attached to another operation" });
        if (!canTransitionDeal(deal.status, "RESOLVED"))
            return reply.code(409).send({ error: "Deal has no open dispute" });
        try {
            const verified = await verifyContractEvent(transactionHash, "DisputeResolved", deal.escrowDealId);
            const buyerAmount = verified.event.args.buyerAmount;
            const sellerAmount = verified.event.args.sellerAmount;
            if (buyerAmount + sellerAmount !== deal.amountMinor)
                return reply.code(422).send({ error: "Resolved amounts do not equal the escrow amount" });
            const escrow = await getEscrowState(deal.escrowDealId);
            if (escrow.status !== 4)
                return reply.code(422).send({ error: "Contract does not show resolved escrow" });
            const status = buyerAmount === deal.amountMinor ? "REFUNDED" : sellerAmount === deal.amountMinor ? "COMPLETED" : "RESOLVED";
            await store.$transaction(async (tx) => {
                const changed = await tx.deal.updateMany({ where: { id: deal.id, status: "DISPUTED" }, data: { status } });
                if (!changed.count)
                    throw new ChainVerificationError("Deal changed while the transaction was being verified", 409);
                await tx.dispute.update({ where: { dealId: deal.id }, data: { status: "RESOLVED", buyerAmount, sellerAmount, resolvedAt: new Date() } });
                await tx.blockchainTransaction.create({ data: { dealId: deal.id, hash: transactionHash, chainId: 84532, operation: "RESOLVE_DISPUTE", status: "CONFIRMED", fromAddress: verified.receipt.from, toAddress: verified.receipt.to, blockNumber: verified.receipt.blockNumber, confirmations: verified.confirmations, confirmedAt: new Date() } });
                await tx.dealStatusHistory.create({ data: { dealId: deal.id, fromStatus: "DISPUTED", toStatus: status, reason: `Confirmed DisputeResolved event; buyer ${buyerAmount}, seller ${sellerAmount}`, txHash: transactionHash } });
            });
            await notifyBestEffort(request, [
                { userId: deal.sellerId, dealId: deal.id, type: "DISPUTE_RESOLVED", message: `Dispute for deal ${deal.reference} has been resolved` },
                ...(deal.buyerId ? [{ userId: deal.buyerId, dealId: deal.id, type: "DISPUTE_RESOLVED", message: `Dispute for deal ${deal.reference} has been resolved` }] : []),
            ]);
            return { status, buyerAmount: buyerAmount.toString(), sellerAmount: sellerAmount.toString(), transactionHash, confirmations: verified.confirmations };
        }
        catch (error) {
            return sendVerificationError(reply, error);
        }
    });
}
