import { CdpClient } from "@coinbase/cdp-sdk";
import { BLINK_MATCH_ESCROW_ABI } from "@blink/shared";
import { createWalletClient, encodeFunctionData, http } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

import { config } from "../config.js";

export class CdpRefereeService {
  private readonly rpcUrl = config.BASE_SEPOLIA_RPC_URL;

  async startMatch(matchId: bigint) {
    if (!config.ESCROW_CONTRACT_ADDRESS) return null;

    if (config.CDP_API_KEY_ID && config.CDP_API_KEY_SECRET && config.CDP_WALLET_SECRET) {
      const data = encodeFunctionData({
        abi: BLINK_MATCH_ESCROW_ABI,
        functionName: "startMatch",
        args: [matchId]
      });

      return this.sendWithCdp(data);
    }

    const walletClient = this.getPrivateKeyWalletClient();
    return walletClient.writeContract({
      address: config.ESCROW_CONTRACT_ADDRESS as `0x${string}`,
      abi: BLINK_MATCH_ESCROW_ABI,
      functionName: "startMatch",
      args: [matchId]
    });
  }

  async resolveMatch(matchId: bigint, winner: `0x${string}`, resultHash: `0x${string}`) {
    if (!config.ESCROW_CONTRACT_ADDRESS) return null;

    if (config.CDP_API_KEY_ID && config.CDP_API_KEY_SECRET && config.CDP_WALLET_SECRET) {
      const data = encodeFunctionData({
        abi: BLINK_MATCH_ESCROW_ABI,
        functionName: "resolveMatch",
        args: [matchId, winner, resultHash]
      });

      return this.sendWithCdp(data);
    }

    const walletClient = this.getPrivateKeyWalletClient();
    return walletClient.writeContract({
      address: config.ESCROW_CONTRACT_ADDRESS as `0x${string}`,
      abi: BLINK_MATCH_ESCROW_ABI,
      functionName: "resolveMatch",
      args: [matchId, winner, resultHash]
    });
  }

  private async sendWithCdp(data: `0x${string}`) {
    const cdp = new CdpClient({
      apiKeyId: config.CDP_API_KEY_ID!,
      apiKeySecret: config.CDP_API_KEY_SECRET!,
      walletSecret: config.CDP_WALLET_SECRET!
    });

    const account = await cdp.evm.getOrCreateAccount({
      name: config.CDP_REFEREE_ACCOUNT_NAME
    });

    const result = await account.sendTransaction({
      network: "base-sepolia",
      transaction: {
        to: config.ESCROW_CONTRACT_ADDRESS as `0x${string}`,
        data,
        value: 0n
      }
    });

    return result.transactionHash;
  }

  private getPrivateKeyWalletClient() {
    if (!process.env.REFEREE_PRIVATE_KEY) {
      throw new Error("Provide CDP credentials or REFEREE_PRIVATE_KEY for referee contract calls");
    }

    return createWalletClient({
      account: privateKeyToAccount(process.env.REFEREE_PRIVATE_KEY as `0x${string}`),
      chain: baseSepolia,
      transport: http(this.rpcUrl)
    });
  }
}
