import { formatUnits } from "viem";

export const formatUsdc = (amount: string) => {
  try {
    return formatUnits(BigInt(amount), 6);
  } catch {
    return amount;
  }
};

export const shortAddress = (value?: string | null) =>
  value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "Not connected";

