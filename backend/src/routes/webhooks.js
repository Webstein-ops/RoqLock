import { createHash } from "node:crypto";
import { z } from "zod";
import { store } from "../db.js";
import { decryptRoqquWebhook, RoqquApiError } from "../services/roqqu.js";
export async function webhookRoutes(app) {
    app.post("/roqqu", async (request, reply) => {
        const input = z.object({ hash: z.string().min(2) }).passthrough().parse(request.body);
        const iv = request.headers["x-api-key"];
        if (typeof iv !== "string")
            return reply.code(400).send({ error: "Missing documented Roqqu webhook IV header" });
        let payload;
        try {
            payload = decryptRoqquWebhook(input.hash, iv);
        }
        catch (error) {
            if (error instanceof RoqquApiError)
                return reply.code(error.statusCode).send({ error: error.message });
            throw error;
        }
        const eventId = typeof payload.event_id === "string" ? payload.event_id : createHash("sha256").update(input.hash).digest("hex");
        const metadata = payload.meta_data && typeof payload.meta_data === "object" ? payload.meta_data : {};
        const reference = typeof metadata.payment_reference === "string" ? metadata.payment_reference : undefined;
        const deal = reference ? await store.deal.findUnique({ where: { reference } }) : null;
        try {
            await store.webhookEvent.create({ data: {
                    provider: "ROQQU",
                    providerEventId: eventId,
                    dealId: deal?.id,
                    payload,
                } });
            return reply.code(202).send({ accepted: true, verified: false, message: "Encrypted notification recorded. It does not change payment or escrow state." });
        }
        catch (error) {
            if (error?.code === "P2002")
                return reply.code(200).send({ accepted: true, duplicate: true, verified: false });
            throw error;
        }
    });
}
