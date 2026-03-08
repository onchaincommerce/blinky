import { formatUnits } from "viem";

export const formatUsdc = (amount: string) => {
  try {
    return formatUnits(BigInt(amount), 6);
  } catch {
    return amount;
  }
};

export const formatUsdcDisplay = (amount: string, fractionDigits = 2) => {
  const value = Number.parseFloat(formatUsdc(amount));
  return Number.isFinite(value) ? value.toFixed(fractionDigits) : formatUsdc(amount);
};

export const formatTimestamp = (value?: string | null) => {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(parsed);
};

export const formatDuration = (milliseconds?: number | null) => {
  if (!milliseconds || milliseconds <= 0) {
    return "0s";
  }

  const totalSeconds = Math.max(1, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
};

export const shortAddress = (value?: string | null) =>
  value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "Not connected";
