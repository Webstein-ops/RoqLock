import "dotenv/config";
import { z } from "zod";
import { isAddress } from "viem";
const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().int().positive().default(4000),
    DATA_FILE: z.string().default("./data/roqlock.json"),
    PAYMENT_SIMULATOR_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
    CORS_ORIGIN: z.string().default("http://localhost:3000"),
    BASE_SEPOLIA_RPC_URL: z.string().url().default("https://sepolia.base.org"),
    BASE_SEPOLIA_CHAIN_ID: z.coerce.number().int().default(84532),
    ROQLOCK_ESCROW_ADDRESS: z.string().refine(isAddress).default("0x30315c49b2ACfa541E09FfAA181C29547DF39de3"),
    MOCK_USDC_ADDRESS: z.string().refine(isAddress).default("0x958F019a07B239695E8aD350539d5B70A63Ef841"),
    MIN_CHAIN_CONFIRMATIONS: z.coerce.number().int().min(1).default(2),
    ROQQU_BASE_URL: z.string().url().optional(),
    ROQQU_TEST_API_KEY: z.string().transform((value) => value || undefined).optional(),
    ROQQU_TEST_PRIVATE_KEY: z.string().transform((value) => value || undefined).optional(),
    ROQQU_TEST_PUBLIC_KEY: z.string().transform((value) => value || undefined).optional(),
});
export const env = envSchema.parse(process.env);
