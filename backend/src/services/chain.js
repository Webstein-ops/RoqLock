import { readFileSync } from "node:fs";
import { createPublicClient, http, parseEventLogs } from "viem";
import { baseSepolia } from "viem/chains";
import { env } from "../config.js";
export const escrowAddress = env.ROQLOCK_ESCROW_ADDRESS;
export const escrowAbi = JSON.parse(readFileSync(new URL("../../abi/RoqLockEscrow.json", import.meta.url), "utf8"));
export const chainClient = createPublicClient({
    chain: baseSepolia,
    transport: http(env.BASE_SEPOLIA_RPC_URL),
});
export class ChainVerificationError extends Error {
    statusCode;
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}
export async function verifyContractEvent(txHash, eventName, dealId, client = chainClient) {
    const chainId = await client.getChainId();
    if (chainId !== env.BASE_SEPOLIA_CHAIN_ID)
        throw new ChainVerificationError("RPC is connected to the wrong chain", 503);
    let receipt;
    try {
        receipt = await client.getTransactionReceipt({ hash: txHash });
    }
    catch {
        throw new ChainVerificationError("Transaction is not confirmed on Base Sepolia", 409);
    }
    if (receipt.status !== "success")
        throw new ChainVerificationError("On-chain transaction reverted", 409);
    if (!receipt.to || receipt.to.toLowerCase() !== escrowAddress.toLowerCase()) {
        throw new ChainVerificationError("Transaction did not call the RoqLock escrow contract");
    }
    const tip = await client.getBlockNumber();
    const confirmations = Number(tip - receipt.blockNumber + 1n);
    if (confirmations < env.MIN_CHAIN_CONFIRMATIONS) {
        throw new ChainVerificationError(`Transaction needs ${env.MIN_CHAIN_CONFIRMATIONS} confirmations; current: ${confirmations}`, 409);
    }
    const contractLogs = receipt.logs.filter((log) => log.address.toLowerCase() === escrowAddress.toLowerCase());
    const logs = parseEventLogs({ abi: escrowAbi, logs: contractLogs, strict: false });
    const event = logs.find((log) => log.eventName === eventName && String(log.args.dealId).toLowerCase() === dealId.toLowerCase());
    if (!event)
        throw new ChainVerificationError(`Expected ${eventName} event for this deal was not found`);
    return { event, receipt, confirmations };
}
export async function getEscrowState(dealId, client = chainClient) {
    const result = await client.readContract({
        address: escrowAddress,
        abi: escrowAbi,
        functionName: "escrows",
        args: [dealId],
    });
    return { dealId: result[0], buyer: result[1], seller: result[2], amount: result[3], createdAt: result[4], status: result[5] };
}
