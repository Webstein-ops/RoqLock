import { createDecipheriv } from "node:crypto";
import { env } from "../config.js";
const baseUrl = env.ROQQU_BASE_URL ?? "https://service.roqqu.com/v1";
const testApiKey = env.ROQQU_TEST_API_KEY ?? env.ROQQU_TEST_PRIVATE_KEY;
export class RoqquApiError extends Error {
    statusCode;
    constructor(message, statusCode = 502) {
        super(message);
        this.statusCode = statusCode;
    }
}
export async function roqquRequest(path, init = {}) {
    if (!testApiKey)
        throw new RoqquApiError("Roqqu test API key is not configured", 503);
    const headers = new Headers(init.headers);
    headers.set("x-staging-api-key", testApiKey);
    headers.set("accept", "application/json");
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
        ...init,
        headers,
        signal: AbortSignal.timeout(12_000),
    });
    let body;
    try {
        body = await response.json();
    }
    catch {
        throw new RoqquApiError(`Roqqu returned HTTP ${response.status} with an unreadable response`);
    }
    if (!response.ok || body?.status === "fail") {
        const message = String(body?.message ?? `HTTP ${response.status}`);
        throw new RoqquApiError(message.toLowerCase().includes("invalid api key") ? "Roqqu rejected the configured test API key" : `Roqqu request failed: ${message}`, response.status === 401 ? 503 : 502);
    }
    return body;
}
export function decryptRoqquWebhook(ciphertextHex, ivHex) {
    const key = testApiKey;
    if (!key || key.length < 32)
        throw new RoqquApiError("Roqqu test API key is not configured for webhook decryption", 503);
    if (!/^[a-f\d]+$/i.test(ciphertextHex) || ciphertextHex.length % 2 || !/^[a-f\d]{32}$/i.test(ivHex)) {
        throw new RoqquApiError("Malformed encrypted webhook body", 400);
    }
    const decipher = createDecipheriv("aes-256-ctr", Buffer.from(key.slice(0, 32), "utf8"), Buffer.from(ivHex, "hex"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]).toString("utf8");
    try {
        return JSON.parse(plaintext);
    }
    catch {
        throw new RoqquApiError("Webhook decrypted but did not contain valid JSON", 400);
    }
}
