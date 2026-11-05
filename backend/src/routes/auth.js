import argon2 from "argon2";
import { z } from "zod";
import { store } from "../db.js";
const registerSchema = z.object({
    email: z.email().transform((value) => value.toLowerCase()),
    password: z.string().min(12).max(128),
    displayName: z.string().trim().min(1).max(80),
    role: z.enum(["SELLER", "BUYER"]).default("SELLER"),
});
const loginSchema = z.object({ email: z.email().transform((value) => value.toLowerCase()), password: z.string().min(1) });
function publicUser(user) {
    return { id: user.id, email: user.email, displayName: user.displayName, role: user.role, walletAddress: user.walletAddress, createdAt: user.createdAt };
}
export async function authRoutes(app) {
    app.post("/register", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
        const input = registerSchema.parse(request.body);
        const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
        try {
            const user = await store.user.create({
                data: { email: input.email, passwordHash, displayName: input.displayName, role: input.role },
            });
            const token = app.jwt.sign({ sub: user.id, role: user.role });
            return reply.code(201).send({ user: publicUser(user), token });
        }
        catch (error) {
            if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
                return reply.code(409).send({ error: "An account with this email already exists" });
            }
            throw error;
        }
    });
    app.post("/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
        const input = loginSchema.parse(request.body);
        const user = await store.user.findUnique({ where: { email: input.email } });
        if (!user || !(await argon2.verify(user.passwordHash, input.password))) {
            return reply.code(401).send({ error: "Invalid email or password" });
        }
        return { user: publicUser(user), token: app.jwt.sign({ sub: user.id, role: user.role }) };
    });
    app.get("/me", { preHandler: [async (request, reply) => {
                try {
                    await request.jwtVerify();
                }
                catch {
                    return reply.code(401).send({ error: "Authentication required" });
                }
            }] }, async (request, reply) => {
        const user = await store.user.findUnique({ where: { id: request.user.sub } });
        if (!user)
            return reply.code(401).send({ error: "Authentication required" });
        return { user: publicUser(user) };
    });
}
