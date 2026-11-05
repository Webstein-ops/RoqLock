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
export async function notificationRoutes(app) {
    app.get("/", { preHandler: [authenticate] }, async (request) => ({
        notifications: await store.notification.findMany({ where: { userId: request.user.sub }, orderBy: { createdAt: "desc" }, take: 100 }),
    }));
    app.patch("/:id/read", { preHandler: [authenticate] }, async (request, reply) => {
        const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
        const changed = await store.notification.updateMany({ where: { id, userId: request.user.sub }, data: { readAt: new Date() } });
        if (!changed.count)
            return reply.code(404).send({ error: "Notification not found" });
        return { success: true };
    });
}
