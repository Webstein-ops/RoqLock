import { randomBytes } from "node:crypto";
import { getAddress, isAddress, isHex, verifyMessage } from "viem";
import { z } from "zod";
import { store } from "../db.js";
const updateSchema = z.object({
    displayName: z.string().trim().min(1).max(80).optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one profile field is required");
const walletSchema = z.object({ address: z.string().refine(isAddress, "Invalid EVM address") });
async function authenticate(request, reply) {
    try {
        await request.jwtVerify();
    }
    catch {
        return reply.code(401).send({ error: "Authentication required" });
    }
}
function publicUser(user) {
    return { id: user.id, email: user.email, displayName: user.displayName, role: user.role, walletAddress: user.walletAddress, createdAt: user.createdAt, updatedAt: user.updatedAt };
}
export async function userRoutes(app) {
    app.get("/me", { preHandler: [authenticate] }, async (request, reply) => {
        const user = await store.user.findUnique({ where: { id: request.user.sub } });
        if (!user)
            return reply.code(404).send({ error: "User not found" });
        return { user: publicUser(user) };
    });
    app.patch("/me", { preHandler: [authenticate] }, async (request, reply) => {
        const input = updateSchema.parse(request.body);
        const user = await store.user.update({ where: { id: request.user.sub }, data: input });
        return { user: publicUser(user) };
    });
    app.post("/me/wallet-challenge", { preHandler: [authenticate], config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request) => {
        const { address } = walletSchema.parse(request.body);
        const normalizedAddress = getAddress(address);
        const nonce = randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
        const message = ["RoqLock wallet verification", `User: ${request.user.sub}`, `Address: ${normalizedAddress}`, `Nonce: ${nonce}`, `Expires: ${expiresAt.toISOString()}`].join("\n");
        await store.walletChallenge.create({ data: { userId: request.user.sub, address: normalizedAddress, message, expiresAt } });
        return { message, expiresAt };
    });
    app.post("/me/wallet-verify", { preHandler: [authenticate], config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
        const input = z.object({ address: walletSchema.shape.address, signature: z.string().refine((value) => isHex(value), "Invalid signature") }).parse(request.body);
        const address = getAddress(input.address);
        const challenge = await store.walletChallenge.findFirst({ where: { userId: request.user.sub, address, usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
        if (!challenge)
            return reply.code(400).send({ error: "Wallet challenge is missing or expired" });
        const valid = await verifyMessage({ address, message: challenge.message, signature: input.signature });
        if (!valid)
            return reply.code(401).send({ error: "Wallet signature is invalid" });
        let user;
        try {
            user = await store.$transaction(async (tx) => {
                const claimed = await tx.walletChallenge.updateMany({ where: { id: challenge.id, usedAt: null }, data: { usedAt: new Date() } });
                if (!claimed.count)
                    return null;
                const updated = await tx.user.update({ where: { id: request.user.sub }, data: { walletAddress: address } });
                await tx.deal.updateMany({ where: { buyerWalletAddress: { equals: address, mode: "insensitive" }, buyerId: null }, data: { buyerId: updated.id } });
                return updated;
            });
        }
        catch (error) {
            if (error && typeof error === "object" && "code" in error && error.code === "P2002")
                return reply.code(409).send({ error: "Wallet is already linked to another account" });
            throw error;
        }
        if (!user)
            return reply.code(409).send({ error: "Wallet challenge was already used" });
        return { user: publicUser(user) };
    });
}
