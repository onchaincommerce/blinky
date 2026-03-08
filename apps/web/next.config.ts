import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputFileTracingRoot = path.join(__dirname, "../..");

const nextConfig: NextConfig = {
  transpilePackages: ["@blink/shared"],
  outputFileTracingRoot,
  async rewrites() {
    return [
      {
        source: "/api/referee/:path*",
        destination: "http://127.0.0.1:8787/:path*"
      }
    ];
  }
};

export default nextConfig;
