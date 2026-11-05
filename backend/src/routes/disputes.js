import { z } from "zod";
import { store } from "../db.js";
async function authenticate(request, reply) {
    try {
        await request.jwtVerify();
    }
    catch {
        return reply.code(401).send({ error: "Authentication required" });
    }
}
export async function disputeRoutes(app) {
    app.get("/", { preHandler: [authenticate] }, async (request) => {
        const disputes = await store.dispute.findMany({
            where: { deal: { OR: [{ sellerId: request.user.sub }, { buyerId: request.user.sub }] } },
            include: { evidence: true, deal: { select: { reference: true, title: true, status: true } } },
            orderBy: { createdAt: "desc" },
        });
        return { disputes };
    });
    app.post("/:id/evidence", { preHandler: [authenticate] }, async (request, reply) => {
        const input = z.object({ storageKey: z.string().trim().min(1).max(500).regex(/^[A-Za-z0-9/_\-.]+$/), description: z.string().trim().max(500).optional() }).parse(request.body);
        const id = request.params.id;
        const dispute = await store.dispute.findFirst({ where: { id, deal: { OR: [{ sellerId: request.user.sub }, { buyerId: request.user.sub }] } } });
        if (!dispute)
            return reply.code(404).send({ error: "Dispute not found" });
        return reply.code(201).send({ evidence: await store.evidence.create({ data: { disputeId: id, uploadedBy: request.user.sub, ...input } }) });
    });
}
