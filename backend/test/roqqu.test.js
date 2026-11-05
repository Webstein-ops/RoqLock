import assert from "node:assert/strict";
import { createCipheriv } from "node:crypto";
import { createServer } from "node:http";
import test, { after } from "node:test";
process.env.JWT_SECRET ??= "test-secret-for-unit-tests-at-least-32-bytes";
process.env.ROQQU_TEST_API_KEY = "0123456789abcdef0123456789abcdef-test-api-key";
const iv = "00112233445566778899aabbccddeeff";
const key = Buffer.from(process.env.ROQQU_TEST_API_KEY.slice(0, 32), "utf8");
let receivedStagingKey;
const server = createServer((request, response) => {
    receivedStagingKey = request.headers["x-staging-api-key"];
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "fail", message: "Invalid API Key" }));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string")
    throw new Error("Test server did not bind");
process.env.ROQQU_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
const { decryptRoqquWebhook, roqquRequest, RoqquApiError } = await import("../src/services/roqqu.js");
after(async () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
test("decrypts the documented AES-256-CTR callback body", () => {
    const plaintext = Buffer.from(JSON.stringify({ event_id: "evt-test", event_type: "token_received" }));
    const cipher = createCipheriv("aes-256-ctr", key, Buffer.from(iv, "hex"));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]).toString("hex");
    assert.deepEqual(decryptRoqquWebhook(ciphertext, iv), { event_id: "evt-test", event_type: "token_received" });
});
test("rejects malformed callback envelopes", () => {
    assert.throws(() => decryptRoqquWebhook("xyz", iv), /Malformed encrypted webhook body/);
    assert.throws(() => decryptRoqquWebhook("00", "bad-iv"), /Malformed encrypted webhook body/);
});
test("uses the documented staging header and maps invalid credentials without leaking them", async () => {
    await assert.rejects(() => roqquRequest("/wallets/get-all-networks"), (error) => {
        assert.ok(error instanceof RoqquApiError);
        assert.equal(error.message, "Roqqu rejected the configured test API key");
        assert.equal(error.statusCode, 503);
        assert.equal(error.message.includes(process.env.ROQQU_TEST_API_KEY), false);
        return true;
    });
    assert.equal(receivedStagingKey, process.env.ROQQU_TEST_API_KEY);
});
