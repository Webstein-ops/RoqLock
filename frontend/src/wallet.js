import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  parseUnits,
} from "viem";
import { baseSepolia } from "viem/chains";
import escrowAbi from "../abi/RoqLockEscrow.json";
import usdcAbi from "../abi/MockUSDC.json";

export const ESCROW_ADDRESS = "0x30315c49b2ACfa541E09FfAA181C29547DF39de3";
export const USDC_ADDRESS = "0x958F019a07B239695E8aD350539d5B70A63Ef841";
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http("https://sepolia.base.org"),
});

function getProvider() {
  if (!window.ethereum?.request) {
    throw new Error("Install a wallet such as MetaMask to continue.");
  }
  return window.ethereum;
}

export async function connectWallet() {
  const provider = getProvider();
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const address = accounts?.[0];
  if (!address) throw new Error("No wallet account was selected.");
  return address;
}

export async function verifyWallet(apiRequest) {
  const address = await connectWallet();
  const { message } = await apiRequest("/api/users/me/wallet-challenge", {
    method: "POST",
    body: { address },
  });
  const signature = await getProvider().request({
    method: "personal_sign",
    params: [message, address],
  });
  return apiRequest("/api/users/me/wallet-verify", {
    method: "POST",
    body: { address, signature },
  });
}

async function getBaseSepoliaWallet() {
  const provider = getProvider();
  let chainId = await provider.request({ method: "eth_chainId" });
  if (Number.parseInt(chainId, 16) !== baseSepolia.id) {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${baseSepolia.id.toString(16)}` }],
      });
    } catch (error) {
      if (error?.code !== 4902) throw error;
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: `0x${baseSepolia.id.toString(16)}`,
          chainName: "Base Sepolia",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://sepolia.base.org"],
          blockExplorerUrls: ["https://sepolia.basescan.org"],
        }],
      });
    }
    chainId = await provider.request({ method: "eth_chainId" });
    if (Number.parseInt(chainId, 16) !== baseSepolia.id) {
      throw new Error("Switch your wallet to Base Sepolia to continue.");
    }
  }

  const address = await connectWallet();
  return {
    address,
    walletClient: createWalletClient({
      account: address,
      chain: baseSepolia,
      transport: custom(provider),
    }),
  };
}

async function waitForConfirmations(hash) {
  await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
}

export async function fundDeal(deal, verifyFunding) {
  const { address, walletClient } = await getBaseSepoliaWallet();
  const amount = parseUnits(deal.amountUsdc, 6);
  const approvalHash = await walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: usdcAbi,
    functionName: "approve",
    args: [ESCROW_ADDRESS, amount],
  });
  await waitForConfirmations(approvalHash);

  const fundingHash = await walletClient.writeContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "createAndFundEscrow",
    args: [deal.escrowDealId, deal.sellerWalletAddress, amount],
  });
  await waitForConfirmations(fundingHash);
  return verifyFunding(fundingHash, address);
}

export async function releaseDeal(deal, verifyRelease) {
  const { walletClient } = await getBaseSepoliaWallet();
  const releaseHash = await walletClient.writeContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "releaseFunds",
    args: [deal.escrowDealId],
  });
  await waitForConfirmations(releaseHash);
  return verifyRelease(releaseHash);
}

export async function raiseDealDispute(deal, description, verifyDispute) {
  const { address, walletClient } = await getBaseSepoliaWallet();
  const transactionHash = await walletClient.writeContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "raiseDispute",
    args: [deal.escrowDealId],
  });
  await waitForConfirmations(transactionHash);
  return verifyDispute(transactionHash, description, address);
}
