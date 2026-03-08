import "dotenv/config";
import { z } from "zod";

const optionalString = () =>
  z.preprocess((value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }, z.string().optional());

const envSchema = z.object({
  PORT: z.coerce.number().default(8787),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  REDIS_URL: optionalString(),
  LIVEKIT_API_KEY: optionalString(),
  LIVEKIT_API_SECRET: optionalString(),
  LIVEKIT_WS_URL: optionalString(),
  BASE_SEPOLIA_RPC_URL: z.string().default("https://sepolia.base.org"),
  CDP_API_KEY_ID: optionalString(),
  CDP_API_KEY_SECRET: optionalString(),
  CDP_WALLET_SECRET: optionalString(),
  CDP_PROJECT_ID: optionalString(),
  CDP_REFEREE_ACCOUNT_NAME: z.string().default("blink-duel-referee"),
  ESCROW_CONTRACT_ADDRESS: z.preprocess((value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }, z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional())
});

const rawConfig = envSchema.parse(process.env);

export const config = {
  ...rawConfig,
  corsOrigins: rawConfig.CORS_ORIGIN.split(",")
    .map((value) => value.trim())
    .filter(Boolean)
};
