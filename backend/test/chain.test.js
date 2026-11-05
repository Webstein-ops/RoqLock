import assert from "node:assert/strict";
import test from "node:test";
import { encodeAbiParameters, keccak256, stringToHex } from "viem";
process.env.JWT_SECRET ??= "test-secret-for-unit-tests-at-least-32-bytes";
const { escrowAddress, verifyContractEvent, ChainVerificationError, chainClient } = await import("../src/services/chain.js");
const dealId = `0x${"a".repeat(64)}`;
const buyer = "0x1111111111111111111111111111111111111111";
const seller = "0x2222222222222222222222222222222222222222";
const hash = `0x${"b".repeat(64)}`;
function makeLog(eventDealId = dealId, address = escrowAddress) {
    return {
        address,
        blockHash: `0x${"c".repeat(64)}`,
        blockNumber: 100n,
        data: encodeAbiParameters([{ type: "uint256" }], [1500000n]),
        logIndex: 0,
        removed: false,
        topics: [
            keccak256(stringToHex("EscrowCreated(bytes32,address,address,uint256)")),
            eventDealId,
            encodeAbiParameters([{ type: "address" }], [buyer]),
            encodeAbiParameters([{ type: "address" }], [seller]),
        ],
        transactionHash: hash,
        transactionIndex: 0,
    };
}
function mockClient(options = {}) {
    const receipt = {
        blockHash: `0x${"c".repeat(64)}`,
        blockNumber: 100n,
        contractAddress: null,
        cumulativeGasUsed: 1n,
        effectiveGasPrice: 1n,
        from: buyer,
        gasUsed: 1n,
        logs: options.log === undefined ? [makeLog()] : [options.log],
        logsBloom: `0x${"0".repeat(512)}`,
        status: options.status ?? "success",
        to: escrowAddress,
        transactionHash: hash,
        transactionIndex: 0,
        type: "eip1559",
    };
    return {
        getChainId: async () => options.chainId ?? 84532,
        getTransactionReceipt: async () => receipt,
        getBlockNumber: async () => BigInt(99 + (options.confirmations ?? 2)),
    };
}
test("accepts only a successful, confirmed escrow event emitted by the escrow address", async () => {
    const verified = await verifyContractEvent(hash, "EscrowCreated", dealId, mockClient());
    assert.equal(verified.confirmations, 2);
    assert.equal(verified.event.eventName, "EscrowCreated");
    assert.equal(verified.event.args.dealId, dealId);
    assert.equal(verified.event.args.amount, 1500000n);
});
test("rejects a receipt from the wrong chain", async () => {
    await assert.rejects(() => verifyContractEvent(hash, "EscrowCreated", dealId, mockClient({ chainId: 8453 })), ChainVerificationError);
});
test("rejects pending and reverted transactions", async () => {
    await assert.rejects(() => verifyContractEvent(hash, "EscrowCreated", dealId, mockClient({ confirmations: 1 })), /needs 2 confirmations/);
    await assert.rejects(() => verifyContractEvent(hash, "EscrowCreated", dealId, mockClient({ status: "reverted" })), /reverted/);
});
test("rejects a matching event from another address or for another deal", async () => {
    await assert.rejects(() => verifyContractEvent(hash, "EscrowCreated", dealId, mockClient({ log: makeLog(dealId, buyer) })), /event for this deal was not found/);
    await assert.rejects(() => verifyContractEvent(hash, "EscrowCreated", dealId, mockClient({ log: makeLog(`0x${"d".repeat(64)}`) })), /event for this deal was not found/);
});
