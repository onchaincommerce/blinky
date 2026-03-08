import { CdpClient } from "@coinbase/cdp-sdk";
import { formatUnits } from "viem";

import { config } from "../config.js";

export type WalletBalanceView = {
  symbol: string;
  name: string;
  contractAddress: string;
  amountAtomic: string;
  decimals: number;
  formatted: string;
};

export class WalletBalanceService {
  private client: CdpClient | null = null;

  async getBalances(address: string) {
    const client = this.getClient();
    const result = await client.evm.listTokenBalances({
      address: address as `0x${string}`,
      network: "base-sepolia",
      pageSize: 50
    });

    const balances: WalletBalanceView[] = result.balances.map((balance) => ({
      symbol: balance.token.symbol ?? "UNKNOWN",
      name: balance.token.name ?? balance.token.symbol ?? "Unknown token",
      contractAddress: balance.token.contractAddress,
      amountAtomic: balance.amount.amount.toString(),
      decimals: balance.amount.decimals,
      formatted: formatUnits(balance.amount.amount, balance.amount.decimals)
    }));

    const usdc = balances.find((balance) => balance.symbol.toUpperCase() === "USDC");
    const eth = balances.find((balance) => balance.symbol.toUpperCase() === "ETH");

    return {
      address,
      balances,
      summary: {
        usdc: usdc?.formatted ?? "0",
        eth: eth?.formatted ?? "0",
        readyForTestMatch: usdc ? Number(usdc.formatted) >= 0.1 : false
      }
    };
  }

  private getClient() {
    if (this.client) {
      return this.client;
    }

    if (!config.CDP_API_KEY_ID || !config.CDP_API_KEY_SECRET || !config.CDP_WALLET_SECRET) {
      throw new Error("Missing CDP credentials for token balance lookups");
    }

    this.client = new CdpClient({
      apiKeyId: config.CDP_API_KEY_ID,
      apiKeySecret: config.CDP_API_KEY_SECRET,
      walletSecret: config.CDP_WALLET_SECRET
    });

    return this.client;
  }
}
