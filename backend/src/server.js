import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { env } from "./config.js";
import { store } from "./db.js";
import { authRoutes } from "./routes/auth.js";
import { dealRoutes } from "./routes/deals.js";
import { userRoutes } from "./routes/users.js";
import { transactionRoutes } from "./routes/transactions.js";
import { disputeRoutes } from "./routes/disputes.js";
import { notificationRoutes } from "./routes/notifications.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { paymentRoutes } from "./routes/payments.js";
export const app = Fastify({ logger: true, bodyLimit: 1_000_000 });
await app.register(helmet);
await app.register(cors, {
    origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
    credentials: true,
});
await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
await app.register(jwt, { secret: env.JWT_SECRET, sign: { expiresIn: "15m" } });
app.get("/health/live", async () => ({ status: "ok" }));
app.get("/health", async (_request, reply) => {
    try {
        await store.$ping();
        return { status: "ok", storage: "ok" };
    }
    catch {
        return reply.code(503).send({ status: "unavailable", storage: "unavailable" });
    }
});
await app.register(authRoutes, { prefix: "/api/auth" });
await app.register(userRoutes, { prefix: "/api/users" });
await app.register(dealRoutes, { prefix: "/api/deals" });
await app.register(transactionRoutes, { prefix: "/api/transactions" });
await app.register(disputeRoutes, { prefix: "/api/disputes" });
await app.register(notificationRoutes, { prefix: "/api/notifications" });
await app.register(webhookRoutes, { prefix: "/api/webhooks" });
await app.register(paymentRoutes, { prefix: "/api/payments" });
app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
        return reply.code(400).send({ error: "Invalid request", details: error.issues.map(({ path, message }) => ({ path, message })) });
    }
    request.log.error(error);
    if (error.validation) {
        return reply.code(400).send({ error: "Invalid request", details: error.validation });
    }
    if (error.statusCode && error.statusCode < 500) {
        return reply.code(error.statusCode).send({ error: error.message });
    }
    return reply.code(500).send({ error: "Internal server error" });
});
const close = async () => {
    await app.close();
    await store.$disconnect();
};
process.once("SIGINT", () => void close().then(() => process.exit(0)));
process.once("SIGTERM", () => void close().then(() => process.exit(0)));
try {
    await app.listen({ host: env.HOST, port: env.PORT });
}
catch (error) {
    app.log.error(error);
    await store.$disconnect();
    process.exit(1);
}
