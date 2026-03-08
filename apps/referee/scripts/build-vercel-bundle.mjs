import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const outfile = resolve(projectRoot, "api/index.cjs");

await mkdir(dirname(outfile), { recursive: true });

await build({
  entryPoints: [resolve(projectRoot, "api/index.ts")],
  outfile,
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node22",
  sourcemap: false,
  legalComments: "none"
});

console.log(`Bundled Vercel entrypoint to ${outfile}`);
