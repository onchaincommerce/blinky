import { createClient } from "redis";

import { config } from "../config.js";

type AppRedisClient = any;

declare global {
  // eslint-disable-next-line no-var
  var __blinkyRedisClient: AppRedisClient | undefined;
  // eslint-disable-next-line no-var
  var __blinkyRedisConnectPromise: Promise<AppRedisClient> | undefined;
}

const connectClient = async (client: AppRedisClient) => {
  if (client.isOpen) {
    return client;
  }

  await client.connect();
  return client;
};

export const hasRedis = () => Boolean(config.REDIS_URL);

export const getRedisClient = async () => {
  if (!config.REDIS_URL) {
    throw new Error("REDIS_URL is required for Redis-backed referee state");
  }

  if (!globalThis.__blinkyRedisClient) {
    const client = createClient({
      url: config.REDIS_URL
    }) as AppRedisClient;

    client.on("error", (error: unknown) => {
      console.error("Redis client error", error);
    });

    globalThis.__blinkyRedisClient = client;
    globalThis.__blinkyRedisConnectPromise = connectClient(client)
      .then(() => client)
      .catch((error) => {
        globalThis.__blinkyRedisClient = undefined;
        globalThis.__blinkyRedisConnectPromise = undefined;
        throw error;
      });
  }

  const client = globalThis.__blinkyRedisClient;
  if (!client) {
    throw new Error("Redis client failed to initialize");
  }

  if (!client.isOpen) {
    globalThis.__blinkyRedisConnectPromise ??= connectClient(client)
      .then(() => globalThis.__blinkyRedisClient!)
      .catch((error) => {
        globalThis.__blinkyRedisClient = undefined;
        globalThis.__blinkyRedisConnectPromise = undefined;
        throw error;
      });
  }

  return globalThis.__blinkyRedisConnectPromise!;
};
